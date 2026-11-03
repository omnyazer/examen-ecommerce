const express = require('express');
const { timingSafeEqual } = require('node:crypto');
const { isObjectIdOrHexString } = require('mongoose');
const { reserveStock, releaseStock } = require('./stock');

function createApp({ Product, serviceToken }) {
  if (!serviceToken) throw new Error('INTERNAL_SERVICE_TOKEN est requis.');
  const app = express();
  const operations = new Map();
  async function serialize(orderId, operation) {
    const previous = operations.get(orderId) || Promise.resolve();
    let unlock;
    const current = new Promise((resolve) => {
      unlock = resolve;
    });
    operations.set(orderId, current);
    try {
      await previous;
      return await operation();
    } finally {
      unlock();
      if (operations.get(orderId) === current) operations.delete(orderId);
    }
  }
  app.use(express.json());
  app.use((req, res, next) => {
    const received = Buffer.from(req.get('X-Internal-Token') || '');
    const expected = Buffer.from(serviceToken);
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
      return res.status(401).json({ message: 'Accès au service de stock refusé.' });
    }
    next();
  });

  function handle(operation) {
    return async (req, res) => {
      const { orderId, items } = req.body || {};
      if (
        typeof orderId !== 'string' ||
        !isObjectIdOrHexString(orderId) ||
        !Array.isArray(items) ||
        items.length === 0 ||
        items.length > 100
      ) {
        return res
          .status(400)
          .json({ message: 'Une commande et des produits valides sont requis.' });
      }
      const productIds = new Set();
      for (const item of items) {
        if (
          !item ||
          typeof item.productId !== 'string' ||
          !isObjectIdOrHexString(item.productId) ||
          !Number.isSafeInteger(item.quantity) ||
          item.quantity < 1 ||
          productIds.has(item.productId.toLowerCase())
        ) {
          return res.status(400).json({
            message: 'Les produits doivent être distincts et les quantités entières positives.',
          });
        }
        productIds.add(item.productId.toLowerCase());
      }
      try {
        await serialize(orderId.toLowerCase(), () =>
          operation(
            Product,
            orderId.toLowerCase(),
            items.map((item) => ({
              productId: item.productId.toLowerCase(),
              quantity: item.quantity,
            }))
          )
        );
        return res.status(200).json({ message: 'Stock mis à jour.' });
      } catch (error) {
        const status = [404, 409, 503].includes(error.status) ? error.status : 503;
        return res.status(status).json({
          message: error.status ? error.message : 'Le service de stock est indisponible.',
        });
      }
    };
  }

  app.post('/update-stock', handle(reserveStock));
  app.post('/release-stock', handle(releaseStock));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status =
      error.type === 'entity.parse.failed' ? 400 : error.type === 'entity.too.large' ? 413 : 500;
    res.status(status).json({
      message:
        status === 400 ? 'Le corps JSON est invalide.' : 'La requête ne peut pas être traitée.',
    });
  });
  return app;
}

module.exports = { createApp };
