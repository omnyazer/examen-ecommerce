const assert = require('node:assert/strict');
const { test } = require('node:test');
const Order = require('../models/Order');
const Product = require('../models/Product');
const { createOrder } = require('../controllers/orderController');
const { randomUUID } = require('node:crypto');
const Checkout = require('../models/Checkout');
const checkoutService = require('../services/checkoutService');
const notificationService = require('../services/notificationService');

const keyboardId = '507f1f77bcf86cd799439011';
const headsetId = '507f1f77bcf86cd799439012';
const products = [
  { _id: keyboardId, name: 'Clavier', price: 120, stock: 15 },
  { _id: headsetId, name: 'Casque', price: 150, stock: 30 },
];
function validBody() {
  return {
    items: [
      { productId: keyboardId, quantity: 3 },
      { productId: headsetId, quantity: 1 },
    ],
    shippingAddress: {
      street: '10 rue des Tests',
      city: 'Ville Test',
      postalCode: '75000',
      country: 'France',
    },
    shippingMethod: 'chronopost',
    paymentMethod: 'Carte bancaire',
  };
}

test('création de commande : contrôle des données et calcul serveur', async (t) => {
  const find = t.mock.method(Product, 'find', async () => products);
  const save = t.mock.method(Order.prototype, 'save', async function () {
    await this.validate();
    return this;
  });
  const notify = t.mock.method(notificationService, 'sendOrderNotification', async () => 'sent');
  const requests = new Map();
  const savedOrders = new Map();
  t.mock.method(Checkout, 'findById', async (id) => requests.get(id));
  t.mock.method(Checkout, 'create', async (data) => {
    requests.set(data._id, data);
    return data;
  });
  t.mock.method(Order, 'findById', async (id) => savedOrders.get(String(id)));
  t.mock.method(checkoutService, 'processCheckout', async (id) => {
    const request = requests.get(id);
    const order = new Order(request.orderData);
    const saved = await order.save();
    savedOrders.set(String(saved._id), saved);
    return {
      ...request,
      state: 'confirmed',
      notificationStatus: await notificationService.sendOrderNotification(saved),
    };
  });

  async function submit(body) {
    const response = {
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        this.body = body;
        return this;
      },
    };
    await createOrder(
      {
        body,
        headers: { 'idempotency-key': randomUUID() },
        user: { userId: '507f1f77bcf86cd799439013' },
      },
      response
    );
    return response;
  }

  await t.test(
    'une demande sans identifiant de confirmation est refusée avant accès aux produits',
    async () => {
      const res = {
        status(code) {
          this.statusCode = code;
          return this;
        },
        json() {
          return this;
        },
      };
      await createOrder(
        { body: validBody(), headers: {}, user: { userId: '507f1f77bcf86cd799439013' } },
        res
      );
      assert.equal(res.statusCode, 400);
      assert.equal(find.mock.callCount(), 0);
    }
  );

  await t.test('les prix et le total falsifiés sont ignorés', async () => {
    const body = validBody();
    body.total = 0.01;
    body.items.forEach((item) => {
      item.price = 0.01;
    });
    const response = await submit(body);
    assert.equal(response.statusCode, 201);
    assert.equal(response.body.order.total, 510);
    assert.deepEqual(
      response.body.order.items.map((item) => item.price),
      [120, 150]
    );
    assert.equal(response.body.notificationStatus, 'sent');
  });

  await t.test('les lignes du même produit sont regroupées', async () => {
    const body = validBody();
    body.items = [
      { productId: keyboardId, quantity: 2 },
      { productId: keyboardId.toUpperCase(), quantity: 1 },
    ];
    const response = await submit(body);
    assert.equal(response.statusCode, 201);
    assert.equal(response.body.order.items.length, 1);
    assert.equal(response.body.order.items[0].quantity, 3);
    assert.equal(response.body.order.total, 360);
  });

  const invalidCases = [
    ['corps absent', () => undefined, 400],
    ['panier vide', (body) => ({ ...body, items: [] }), 400],
    ['ligne vide', (body) => ({ ...body, items: [null] }), 400],
    [
      'identifiant mal formé',
      (body) => ({ ...body, items: [{ productId: 'invalide', quantity: 1 }] }),
      400,
    ],
    ...[0, -1, 1.5, '2', Number.MAX_SAFE_INTEGER + 1].map((quantity) => [
      `quantité invalide : ${quantity}`,
      (body) => ({ ...body, items: [{ productId: keyboardId, quantity }] }),
      400,
    ]),
    [
      'produit absent du catalogue',
      (body) => ({ ...body, items: [{ productId: '507f1f77bcf86cd799439099', quantity: 1 }] }),
      404,
    ],
    [
      'stock insuffisant',
      (body) => ({ ...body, items: [{ productId: keyboardId, quantity: 16 }] }),
      409,
    ],
    [
      'stock dépassé par des lignes dupliquées',
      (body) => ({
        ...body,
        items: [
          { productId: keyboardId, quantity: 10 },
          { productId: keyboardId, quantity: 6 },
        ],
      }),
      409,
    ],
    ['adresse manquante', (body) => ({ ...body, shippingAddress: {} }), 400],
    [
      'adresse composée d’espaces',
      (body) => ({ ...body, shippingAddress: { ...body.shippingAddress, street: '   ' } }),
      400,
    ],
    [
      'adresse de type incorrect',
      (body) => ({ ...body, shippingAddress: { ...body.shippingAddress, city: {} } }),
      400,
    ],
    ['paiement invalide', (body) => ({ ...body, paymentMethod: 'invalide' }), 400],
    ['livraison invalide', (body) => ({ ...body, shippingMethod: 'invalide' }), 400],
  ];
  for (const [label, change, status] of invalidCases) {
    await t.test(label, async () => {
      const previousSaves = save.mock.callCount();
      const previousNotifications = notify.mock.callCount();
      const response = await submit(change(validBody()));
      assert.equal(response.statusCode, status);
      assert.equal(typeof response.body.message, 'string');
      assert.equal(save.mock.callCount(), previousSaves);
      assert.equal(notify.mock.callCount(), previousNotifications);
    });
  }

  await t.test('calcul en centimes et adresse nettoyée', async () => {
    find.mock.mockImplementation(async () => [{ ...products[0], price: 0.1 }]);
    const body = validBody();
    body.items = [{ productId: keyboardId, quantity: 3 }];
    body.shippingAddress.street = ' 10 rue des Tests ';
    const response = await submit(body);
    assert.equal(response.statusCode, 201);
    assert.equal(response.body.order.total, 0.3);
    assert.equal(response.body.order.shippingAddress.street, '10 rue des Tests');
  });

  await t.test(
    'un échec de notification ne transforme pas une commande enregistrée en échec',
    async () => {
      find.mock.mockImplementation(async () => products);
      notify.mock.mockImplementation(async () => 'failed');
      const response = await submit(validBody());
      assert.equal(response.statusCode, 201);
      assert.equal(response.body.notificationStatus, 'failed');
    }
  );

  await t.test('échec de la base : aucune notification', async () => {
    find.mock.mockImplementation(async () => {
      throw new Error('Database unavailable');
    });
    const previousNotifications = notify.mock.callCount();
    const response = await submit(validBody());
    assert.equal(response.statusCode, 500);
    assert.equal(notify.mock.callCount(), previousNotifications);
  });
});
