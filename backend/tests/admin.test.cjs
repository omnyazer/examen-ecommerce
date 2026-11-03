const assert = require('node:assert/strict');
const { test } = require('node:test');
const express = require('express');
const jwt = require('jsonwebtoken');
const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');

test('administration : autorisations et validation des mises à jour', async (t) => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'admin-route-test-secret';
  const id = '507f1f77bcf86cd799439011';
  const clientId = '507f1f77bcf86cd799439014';
  t.mock.method(User, 'findById', (userId) => ({
    select: async () => ({
      _id: userId,
      username: userId === id ? 'admin-test' : 'client-test',
      role: userId === id ? 'admin' : 'user',
    }),
  }));
  const order = { _id: id, status: 'En attente', items: [], total: 120 };
  const product = { _id: id, name: 'Clavier', stock: 15, price: 120 };
  let currentOrder = order;
  const findOrder = t.mock.method(Order, 'findById', async () => currentOrder);
  const orderUpdate = t.mock.method(Order, 'findOneAndUpdate', async (filter, update) => ({
    ...order,
    status: update.$set.status,
  }));
  t.mock.method(Order, 'find', () => ({ sort: async () => [order] }));
  t.mock.method(Product, 'find', async () => [product]);
  const stockUpdate = t.mock.method(Product, 'findOneAndUpdate', async (filter, update) => ({
    ...product,
    stock: update.$set.stock,
  }));
  const exists = t.mock.method(Product, 'exists', async () => ({ _id: id }));
  const app = express();
  app.use(express.json());
  app.use('/api/admin', require('../routes/adminRoutes'));
  app.use('/api/orders', require('../routes/orderRoutes'));
  app.use('/api/products', require('../routes/productRoutes'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  });
  const admin = jwt.sign({ userId: id, role: 'admin' }, process.env.JWT_SECRET);
  const client = jwt.sign({ userId: clientId }, process.env.JWT_SECRET);
  async function request(path, { token = admin, method = 'GET', body } = {}) {
    return fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Cookie: `session=${token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  await t.test('toutes les routes administrateur refusent un client ou un visiteur', async () => {
    for (const [path, method] of [
      ['/api/admin/orders', 'GET'],
      ['/api/admin/products', 'GET'],
      [`/api/admin/orders/${id}/status`, 'PUT'],
      [`/api/admin/orders/${id}/validate`, 'PUT'],
      [`/api/admin/products/${id}/stock`, 'PUT'],
    ]) {
      assert.equal((await request(path, { token: '', method })).status, 401);
      assert.equal(
        (await request(path, { token: client, method, ...(method === 'GET' ? {} : { body: {} }) }))
          .status,
        403
      );
    }
    assert.equal(orderUpdate.mock.callCount(), 0);
    assert.equal(stockUpdate.mock.callCount(), 0);
  });

  await t.test('un jeton modifié ou mal signé ne donne aucun droit', async () => {
    const forged = jwt.sign({ userId: id, role: 'admin' }, 'wrong-secret');
    assert.equal((await request('/api/admin/orders', { token: forged })).status, 401);
  });

  await t.test('les routes historiques restent protégées', async () => {
    assert.equal((await request('/api/orders', { token: client })).status, 403);
    assert.equal(
      (
        await request(`/api/products/${id}/stock`, {
          token: client,
          method: 'PUT',
          body: { stock: 0, expectedStock: 15 },
        })
      ).status,
      403
    );
    assert.equal(
      (await request(`/api/orders/${id}`, { token: client, method: 'DELETE' })).status,
      404
    );
  });

  await t.test('un administrateur peut lire les produits et les commandes', async () => {
    assert.equal((await request('/api/admin/orders')).status, 200);
    assert.equal((await request('/api/admin/products')).status, 200);
  });

  await t.test('les identifiants et statuts invalides sont refusés avant écriture', async () => {
    for (const [orderId, status] of [
      ['invalid', 'Expédiée'],
      [id, 'invalide'],
      [id, undefined],
    ]) {
      assert.equal(
        (await request(`/api/admin/orders/${orderId}/status`, { method: 'PUT', body: { status } }))
          .status,
        400
      );
    }
    assert.equal(orderUpdate.mock.callCount(), 0);
  });

  await t.test('la validation modifie réellement le statut avec le bon identifiant', async () => {
    const response = await request(`/api/admin/orders/${id}/validate`, { method: 'PUT', body: {} });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).order.status, 'En cours de traitement');
    const [filter, update, options] = orderUpdate.mock.calls.at(-1).arguments;
    assert.deepEqual(filter, { _id: id, status: 'En attente' });
    assert.equal(update.$set.status, 'En cours de traitement');
    assert.equal(options.runValidators, true);
  });

  await t.test('une expédition directe sans validation est refusée', async () => {
    currentOrder = order;
    const previousUpdates = orderUpdate.mock.callCount();
    assert.equal(
      (
        await request(`/api/admin/orders/${id}/status`, {
          method: 'PUT',
          body: { status: 'Expédiée' },
        })
      ).status,
      409
    );
    assert.equal(orderUpdate.mock.callCount(), previousUpdates);
  });

  await t.test('une commande en traitement peut être expédiée', async () => {
    currentOrder = { ...order, status: 'En cours de traitement' };
    const response = await request(`/api/admin/orders/${id}/status`, {
      method: 'PUT',
      body: { status: 'Expédiée' },
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).order.status, 'Expédiée');
  });

  await t.test('une commande expédiée ne peut pas revenir en traitement', async () => {
    currentOrder = { ...order, status: 'Expédiée' };
    const previousUpdates = orderUpdate.mock.callCount();
    assert.equal(
      (await request(`/api/admin/orders/${id}/validate`, { method: 'PUT', body: {} })).status,
      409
    );
    assert.equal(orderUpdate.mock.callCount(), previousUpdates);
  });

  await t.test('un statut identique ne provoque aucune nouvelle écriture', async () => {
    currentOrder = { ...order, status: 'Expédiée' };
    const previousUpdates = orderUpdate.mock.callCount();
    assert.equal(
      (
        await request(`/api/admin/orders/${id}/status`, {
          method: 'PUT',
          body: { status: 'Expédiée' },
        })
      ).status,
      200
    );
    assert.equal(orderUpdate.mock.callCount(), previousUpdates);
  });

  await t.test('une modification concurrente du statut est détectée', async () => {
    currentOrder = order;
    orderUpdate.mock.mockImplementationOnce(async () => null);
    assert.equal(
      (await request(`/api/admin/orders/${id}/validate`, { method: 'PUT', body: {} })).status,
      409
    );
  });

  await t.test('une commande inexistante retourne 404', async () => {
    findOrder.mock.mockImplementation(async () => null);
    assert.equal(
      (
        await request(`/api/admin/orders/${id}/status`, {
          method: 'PUT',
          body: { status: 'Expédiée' },
        })
      ).status,
      404
    );
  });

  await t.test('le stock doit être un entier et inclure la valeur précédente', async () => {
    for (const stock of [-1, 1.5, '2', null, {}, Number.MAX_SAFE_INTEGER + 1]) {
      assert.equal(
        (
          await request(`/api/admin/products/${id}/stock`, {
            method: 'PUT',
            body: { stock, expectedStock: 15 },
          })
        ).status,
        400
      );
    }
    assert.equal(
      (await request(`/api/admin/products/${id}/stock`, { method: 'PUT', body: { stock: 2 } }))
        .status,
      400
    );
    assert.equal(stockUpdate.mock.callCount(), 0);
  });

  await t.test(
    'la mise à zéro est autorisée et vérifie atomiquement le stock précédent',
    async () => {
      const response = await request(`/api/admin/products/${id}/stock`, {
        method: 'PUT',
        body: { stock: 0, expectedStock: 15 },
      });
      assert.equal(response.status, 200);
      assert.equal((await response.json()).product.stock, 0);
      const [filter, update] = stockUpdate.mock.calls.at(-1).arguments;
      assert.deepEqual(filter, { _id: id, stock: 15 });
      assert.deepEqual(update, { $set: { stock: 0 } });
    }
  );

  await t.test(
    'un stock modifié depuis la lecture retourne 409 et un produit absent 404',
    async () => {
      stockUpdate.mock.mockImplementation(async () => null);
      const body = { stock: 2, expectedStock: 15 };
      assert.equal(
        (await request(`/api/admin/products/${id}/stock`, { method: 'PUT', body })).status,
        409
      );
      exists.mock.mockImplementation(async () => null);
      assert.equal(
        (await request(`/api/admin/products/${id}/stock`, { method: 'PUT', body })).status,
        404
      );
    }
  );
});
