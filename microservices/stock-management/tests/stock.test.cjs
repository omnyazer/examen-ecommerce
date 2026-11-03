const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const mongoose = require('mongoose');
const StockProduct = require('../models/Product');
const { createApp } = require('../app');
const { reserveStock, releaseStock } = require('../stock');

const uri = process.env.STOCK_TEST_MONGO_URI;

test('une réservation et sa restitution ne s’exécutent pas simultanément pour la même commande', async () => {
  let active = 0;
  let maximum = 0;
  const Product = {
    async findOneAndUpdate() {
      active++;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 20));
      active--;
      return { stock: 5 };
    },
  };
  const serviceToken = 'serialization-test-token';
  const server = createApp({ Product, serviceToken }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    const body = {
      orderId: new mongoose.Types.ObjectId().toString(),
      items: [{ productId: new mongoose.Types.ObjectId().toString(), quantity: 1 }],
    };
    const results = await Promise.all(
      ['update-stock', 'release-stock'].map((path) =>
        fetch(`http://127.0.0.1:${server.address().port}/${path}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Internal-Token': serviceToken },
          body: JSON.stringify(body),
        })
      )
    );
    assert.ok(results.every((response) => response.status === 200));
    assert.equal(maximum, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('stock : mises à jour réelles dans une base de test isolée', { skip: !uri }, async (t) => {
  const dbName = `exam1_stock_test_${randomUUID().replaceAll('-', '')}`;
  const connection = await mongoose
    .createConnection(uri, { dbName, serverSelectionTimeoutMS: 5000 })
    .asPromise();
  t.after(async () => {
    assert.match(connection.name, /^exam1_stock_test_[a-f0-9]{32}$/);
    await connection.dropDatabase();
    await connection.close();
  });
  const Product = connection.model('StockProduct', StockProduct.schema);
  const orderId = () => new mongoose.Types.ObjectId().toString();
  const item = (product, quantity) => ({ productId: String(product._id), quantity });

  await t.test(
    'le stock diminue et une nouvelle tentative reste sans effet supplémentaire',
    async () => {
      const product = await Product.create({ stock: 5 });
      const id = orderId();
      await reserveStock(Product, id, [item(product, 2)]);
      await reserveStock(Product, id, [item(product, 2)]);
      assert.equal((await Product.findById(product._id)).stock, 3);
      await releaseStock(Product, id, [item(product, 2)]);
      await releaseStock(Product, id, [item(product, 2)]);
      assert.equal((await Product.findById(product._id)).stock, 5);
    }
  );

  await t.test('deux commandes concurrentes ne peuvent pas dépasser le stock', async () => {
    const product = await Product.create({ stock: 3 });
    const results = await Promise.allSettled([
      reserveStock(Product, orderId(), [item(product, 2)]),
      reserveStock(Product, orderId(), [item(product, 2)]),
    ]);
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(results.find((result) => result.status === 'rejected').reason.status, 409);
    assert.equal((await Product.findById(product._id)).stock, 1);
  });

  await t.test('un échec sur le deuxième produit remet le premier en stock', async () => {
    const first = await Product.create({ stock: 5 });
    const second = await Product.create({ stock: 1 });
    await assert.rejects(reserveStock(Product, orderId(), [item(first, 2), item(second, 2)]), {
      status: 409,
    });
    assert.equal((await Product.findById(first._id)).stock, 5);
    assert.equal((await Product.findById(second._id)).stock, 1);
  });

  await t.test('une réservation ne peut pas être rejouée avec une autre quantité', async () => {
    const product = await Product.create({ stock: 5 });
    const id = orderId();
    await reserveStock(Product, id, [item(product, 2)]);
    await assert.rejects(reserveStock(Product, id, [item(product, 1)]), { status: 409 });
    assert.equal((await Product.findById(product._id)).stock, 3);
  });

  await t.test(
    'un produit inexistant est refusé sans perdre les réservations précédentes',
    async () => {
      const product = await Product.create({ stock: 5 });
      await assert.rejects(
        reserveStock(Product, orderId(), [item(product, 2), { productId: orderId(), quantity: 1 }]),
        { status: 404 }
      );
      assert.equal((await Product.findById(product._id)).stock, 5);
    }
  );

  await t.test('les réservations internes sont masquées dans le modèle du backend', async () => {
    const BackendProduct = require('../../../backend/models/Product');
    const PublicProduct = connection.model('PublicProduct', BackendProduct.schema, 'products');
    const product = await Product.create({ stock: 5 });
    await reserveStock(Product, orderId(), [item(product, 2)]);
    const publicProduct = await PublicProduct.findById(product._id).lean();
    assert.equal(publicProduct.stock, 3);
    assert.equal('stockReservations' in publicProduct, false);
  });

  await t.test('API : accès protégé, validation et diminution réelle du stock', async () => {
    const serviceToken = 'internal-test-token';
    const server = createApp({ Product, serviceToken }).listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    try {
      const url = `http://127.0.0.1:${server.address().port}/update-stock`;
      const post = (body, token = serviceToken) =>
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Internal-Token': token },
          body: JSON.stringify(body),
        });
      const product = await Product.create({ stock: 5 });
      const body = { orderId: orderId(), items: [item(product, 2)] };
      assert.equal((await post(body, '')).status, 401);
      assert.equal((await post({ ...body, items: [item(product, -1)] })).status, 400);
      assert.equal((await post({ ...body, items: [item(product, 1.5)] })).status, 400);
      assert.equal((await post({ ...body, items: [...body.items, ...body.items] })).status, 400);
      assert.equal((await Product.findById(product._id)).stock, 5);
      assert.equal((await post(body)).status, 200);
      assert.equal((await Product.findById(product._id)).stock, 3);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  await t.test(
    'gateway : réservation et remise en stock avec transmission du jeton interne',
    async () => {
      const serviceToken = 'gateway-test-token';
      const service = createApp({ Product, serviceToken }).listen(0, '127.0.0.1');
      await new Promise((resolve) => service.once('listening', resolve));
      const previousUrl = process.env.STOCK_SERVICE_URL;
      process.env.STOCK_SERVICE_URL = `http://127.0.0.1:${service.address().port}`;
      const express = require('../../../gateway/node_modules/express');
      const gateway = express();
      gateway.use(express.json());
      const proxy = require('../../../gateway/routes/stock');
      gateway.use('/update-stock', proxy);
      gateway.use('/release-stock', proxy);
      const server = gateway.listen(0, '127.0.0.1');
      await new Promise((resolve) => server.once('listening', resolve));
      try {
        const product = await Product.create({ stock: 5 });
        const body = { orderId: orderId(), items: [item(product, 2)] };
        const send = (path) =>
          fetch(`http://127.0.0.1:${server.address().port}/${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Internal-Token': serviceToken },
            body: JSON.stringify(body),
          });
        assert.equal((await send('update-stock')).status, 200);
        assert.equal((await Product.findById(product._id)).stock, 3);
        assert.equal((await send('release-stock')).status, 200);
        assert.equal((await Product.findById(product._id)).stock, 5);
        await new Promise((resolve) => service.close(resolve));
        const unavailable = await send('update-stock');
        assert.equal(unavailable.status, 503);
        assert.equal((await unavailable.json()).message, 'Le service de stock est indisponible.');
      } finally {
        await new Promise((resolve) => server.close(resolve));
        if (service.listening) await new Promise((resolve) => service.close(resolve));
        if (previousUrl === undefined) delete process.env.STOCK_SERVICE_URL;
        else process.env.STOCK_SERVICE_URL = previousUrl;
      }
    }
  );
});
