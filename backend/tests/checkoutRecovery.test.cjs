const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const mongoose = require('mongoose');
const Checkout = require('../models/Checkout');
const Order = require('../models/Order');
const Product = require('../models/Product');
const stockService = require('../services/stockService');
const notificationService = require('../services/notificationService');
const { createOrder, getCheckout } = require('../controllers/orderController');
const { processCheckout, startRecovery } = require('../services/checkoutService');
const stock = require('../../microservices/stock-management/stock');

test(
  'reprise durable des confirmations dans une base isolée',
  { skip: !process.env.RECOVERY_TEST_MONGO_URI },
  async (t) => {
    const dbName = `exam1_recovery_test_${randomUUID().replaceAll('-', '')}`;
    await mongoose.connect(process.env.RECOVERY_TEST_MONGO_URI, {
      dbName,
      serverSelectionTimeoutMS: 5000,
    });
    await Checkout.init();
    t.after(async () => {
      assert.match(mongoose.connection.name, /^exam1_recovery_test_[a-f0-9]{32}$/);
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    });
    const adapter = {
      findOneAndUpdate: (...args) => Product.findOneAndUpdate(...args),
      findById: (id) => Product.findById(id).select('+stockReservations'),
    };
    const reserve = t.mock.method(stockService, 'reserveStock', async (order) => {
      try {
        await stock.reserveStock(adapter, String(order._id), order.items);
      } catch (error) {
        if (error.status) error.response = { status: error.status };
        throw error;
      }
    });
    const release = t.mock.method(stockService, 'releaseStock', async (order) =>
      stock.releaseStock(adapter, String(order._id), order.items)
    );
    const notify = t.mock.method(
      notificationService,
      'sendOrderNotification',
      async () => 'disabled'
    );
    const userId = new mongoose.Types.ObjectId().toString();
    const response = () => ({
      status(code) {
        this.code = code;
        return this;
      },
      json(body) {
        this.body = body;
        return this;
      },
    });

    async function fixture() {
      const product = await Product.create({
        name: 'Produit test',
        description: 'Test isolé',
        price: 100,
        stock: 10,
      });
      return {
        product,
        body: {
          items: [{ productId: String(product._id), quantity: 2 }],
          shippingAddress: {
            street: '10 rue des Tests',
            city: 'Ville Test',
            postalCode: '75000',
            country: 'France',
          },
          shippingMethod: 'chronopost',
          paymentMethod: 'Carte bancaire',
        },
      };
    }
    async function submit(body, key) {
      const res = response();
      await createOrder({ body, headers: { 'idempotency-key': key }, user: { userId } }, res);
      return res;
    }

    await t.test(
      'rejouer la même confirmation ne crée ni commande ni retrait de stock supplémentaires',
      async () => {
        const { product, body } = await fixture();
        const key = randomUUID();
        const first = await submit(body, key);
        assert.equal(first.code, 201);
        assert.equal(first.body.order.total, 200);
        const notificationCount = notify.mock.callCount();
        await Product.updateOne({ _id: product._id }, { $set: { price: 999 } });
        const replay = await submit(body, key);
        assert.equal(replay.code, 201);
        assert.equal(String(replay.body.order._id), String(first.body.order._id));
        assert.equal(replay.body.order.total, 200);
        assert.equal(await Order.countDocuments({ 'items.productId': product._id }), 1);
        assert.equal((await Product.findById(product._id)).stock, 8);
        assert.equal(notify.mock.callCount(), notificationCount);
        const conflict = await submit(
          { ...body, items: [{ productId: String(product._id), quantity: 3 }] },
          key
        );
        assert.equal(conflict.code, 409);
        assert.equal(conflict.body.code, 'CHECKOUT_KEY_REUSED');
      }
    );

    await t.test('deux confirmations simultanées partagent une seule commande', async () => {
      const { product, body } = await fixture();
      const key = randomUUID();
      const results = await Promise.all([submit(body, key), submit(body, key)]);
      assert.ok(results.every((result) => [201, 202].includes(result.code)));
      assert.equal(await Order.countDocuments({ 'items.productId': product._id }), 1);
      assert.equal((await Product.findById(product._id)).stock, 8);
    });

    await t.test(
      'une réponse réseau perdue après réservation est reprise sans double retrait',
      async () => {
        const { product, body } = await fixture();
        const key = randomUUID();
        reserve.mock.mockImplementationOnce(async (order) => {
          await stock.reserveStock(adapter, String(order._id), order.items);
          throw new Error('Response lost');
        });
        assert.equal((await submit(body, key)).code, 202);
        assert.equal((await Product.findById(product._id)).stock, 8);
        assert.equal(await Order.countDocuments({ 'items.productId': product._id }), 0);
        assert.equal((await submit(body, key)).code, 201);
        assert.equal((await Product.findById(product._id)).stock, 8);
      }
    );

    await t.test(
      'une sauvegarde effectuée mais dont la réponse est perdue est retrouvée',
      async () => {
        const { product, body } = await fixture();
        const key = randomUUID();
        const originalSave = Order.prototype.save;
        const save = t.mock.method(Order.prototype, 'save', async function (...args) {
          await originalSave.apply(this, args);
          throw new Error('Save response lost');
        });
        assert.equal((await submit(body, key)).code, 202);
        save.mock.restore();
        const reservations = reserve.mock.callCount();
        assert.equal((await submit(body, key)).code, 201);
        assert.equal(reserve.mock.callCount(), reservations);
        assert.equal(await Order.countDocuments({ 'items.productId': product._id }), 1);
        assert.equal((await Product.findById(product._id)).stock, 8);
      }
    );

    await t.test(
      'une erreur de sauvegarde conserve la demande jusqu’à une reprise réussie',
      async () => {
        const { product, body } = await fixture();
        const key = randomUUID();
        const save = t.mock.method(Order.prototype, 'save', async () => {
          throw new Error('Database unavailable');
        });
        assert.equal((await submit(body, key)).code, 202);
        save.mock.restore();
        const checkout = await processCheckout(`${userId}:${key}`);
        assert.equal(checkout.state, 'confirmed');
        assert.equal((await Product.findById(product._id)).stock, 8);
        assert.equal(await Order.countDocuments({ 'items.productId': product._id }), 1);
      }
    );

    await t.test(
      'une remise en stock interrompue est reprise sans double restitution',
      async () => {
        const { product, body } = await fixture();
        const second = await Product.create({
          name: 'Second',
          description: 'Test',
          price: 50,
          stock: 10,
        });
        body.items.push({ productId: String(second._id), quantity: 2 });
        const key = randomUUID();
        reserve.mock.mockImplementationOnce(async (order) => {
          await stock.reserveStock(adapter, String(order._id), [order.items[0]]);
          throw new Error('Interrupted');
        });
        assert.equal((await submit(body, key)).code, 202);
        await Product.updateOne({ _id: second._id }, { $set: { stock: 0 } });
        release.mock.mockImplementationOnce(async () => {
          throw new Error('Unavailable');
        });
        assert.equal((await submit(body, key)).code, 202);
        assert.equal((await Checkout.findById(`${userId}:${key}`)).state, 'releasing');
        assert.equal((await Product.findById(product._id)).stock, 8);
        const final = await processCheckout(`${userId}:${key}`);
        assert.equal(final.state, 'failed');
        assert.equal((await Product.findById(product._id)).stock, 10);
        await processCheckout(`${userId}:${key}`);
        assert.equal((await Product.findById(product._id)).stock, 10);
      }
    );

    await t.test(
      'la reprise automatique retrouve une demande après expiration du verrou',
      async () => {
        const { product, body } = await fixture();
        const key = randomUUID();
        reserve.mock.mockImplementationOnce(async () => {
          throw new Error('Unavailable');
        });
        assert.equal((await submit(body, key)).code, 202);
        await Checkout.updateOne(
          { _id: `${userId}:${key}` },
          {
            $set: {
              leaseOwner: 'previous-process',
              leaseUntil: new Date(Date.now() - 1000),
              nextAttemptAt: new Date(Date.now() - 1000),
            },
          }
        );
        const stop = startRecovery();
        try {
          const deadline = Date.now() + 5000;
          while ((await Checkout.findById(`${userId}:${key}`)).state !== 'confirmed') {
            if (Date.now() > deadline) throw new Error('Recovery timed out');
            await new Promise((resolve) => setTimeout(resolve, 25));
          }
          assert.equal((await Product.findById(product._id)).stock, 8);
        } finally {
          await stop();
        }
        const res = response();
        await getCheckout(
          {
            user: { userId: new mongoose.Types.ObjectId().toString() },
            params: { requestKey: key },
          },
          res
        );
        assert.equal(res.code, 404);
      }
    );

    await t.test(
      'un mail interrompu reste incertain sans être envoyé une seconde fois',
      async () => {
        const { body } = await fixture();
        const key = randomUUID();
        assert.equal((await submit(body, key)).code, 201);
        await Checkout.updateOne(
          { _id: `${userId}:${key}` },
          {
            $set: {
              notificationStatus: 'sending',
              notificationStartedAt: new Date(Date.now() - 180000),
            },
          }
        );
        const count = notify.mock.callCount();
        const stop = startRecovery();
        await stop();
        assert.equal((await Checkout.findById(`${userId}:${key}`)).notificationStatus, 'unknown');
        assert.equal(notify.mock.callCount(), count);
      }
    );
  }
);
