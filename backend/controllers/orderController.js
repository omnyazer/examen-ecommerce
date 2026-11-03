// backend/controllers/orderController.js
const Order = require('../models/Order');
const Product = require('../models/Product');
const { isObjectIdOrHexString } = require('mongoose');
const { createHash } = require('node:crypto');
const Checkout = require('../models/Checkout');
const checkoutService = require('../services/checkoutService');
const schemas = require('../validation/schemas');

const requestKeyPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

exports.createOrder = async (req, res) => {
  const validated = schemas.validate(schemas.order, req.body || {});
  if (validated.error) return res.status(400).json({ message: validated.error });
  const { items, shippingAddress, paymentMethod, shippingMethod } = validated.value;
  const userId = req.user.userId;
  const requestKey = req.headers?.['idempotency-key'];
  if (typeof requestKey !== 'string' || !requestKeyPattern.test(requestKey)) {
    return res.status(400).json({ message: 'Actualisez la page avant de confirmer la commande.' });
  }

  const quantities = new Map();
  for (const item of items) {
    const productId = item.productId.toLowerCase();
    const quantity = (quantities.get(productId) || 0) + item.quantity;
    if (!Number.isSafeInteger(quantity)) {
      return res.status(400).json({ message: 'La quantité demandée est trop élevée.' });
    }
    quantities.set(productId, quantity);
  }

  const addressFields = ['street', 'city', 'postalCode', 'country'];

  try {
    const checkoutId = `${userId}:${requestKey.toLowerCase()}`;
    const payloadHash = createHash('sha256')
      .update(
        JSON.stringify({
          items: [...quantities.entries()].sort(),
          shippingAddress: Object.fromEntries(
            addressFields.map((field) => [field, shippingAddress[field]])
          ),
          paymentMethod,
          shippingMethod,
        })
      )
      .digest('hex');
    const existing = await Checkout.findById(checkoutId);
    if (existing) {
      if (existing.payloadHash !== payloadHash) {
        return res.status(409).json({
          code: 'CHECKOUT_KEY_REUSED',
          message: 'Une autre confirmation est déjà associée à cette demande. Vérifiez son état.',
        });
      }
      return checkoutService.respond(await checkoutService.processCheckout(checkoutId), res);
    }
    const products = await Product.find({ _id: { $in: [...quantities.keys()] } });
    const productsById = new Map(products.map((product) => [String(product._id), product]));
    const orderDetails = [];
    let totalCents = 0;

    for (const [productId, quantity] of quantities) {
      const product = productsById.get(productId);
      if (!product) {
        return res.status(404).json({ message: 'Un produit du panier est introuvable.' });
      }
      if (
        !Number.isSafeInteger(product.stock) ||
        product.stock < 0 ||
        !Number.isFinite(product.price) ||
        product.price < 0
      ) {
        throw new Error('Données produit invalides');
      }
      if (quantity > product.stock) {
        return res
          .status(409)
          .json({ message: `Stock insuffisant pour le produit « ${product.name} ».` });
      }

      const priceCents = Math.round((product.price + Number.EPSILON) * 100);
      const lineTotalCents = priceCents * quantity;
      if (
        !Number.isSafeInteger(priceCents) ||
        !Number.isSafeInteger(lineTotalCents) ||
        !Number.isSafeInteger(totalCents + lineTotalCents)
      ) {
        return res.status(400).json({ message: 'Le montant de la commande est trop élevé.' });
      }
      totalCents += lineTotalCents;
      orderDetails.push({ productId: product._id, quantity, price: priceCents / 100 });
    }

    const newOrder = new Order({
      userId,
      items: orderDetails,
      total: totalCents / 100,
      shippingAddress: Object.fromEntries(
        addressFields.map((field) => [field, shippingAddress[field].trim()])
      ),
      paymentMethod,
      shippingMethod,
    });

    await newOrder.validate();
    let checkout;
    try {
      checkout = await Checkout.create({
        _id: checkoutId,
        userId,
        orderId: newOrder._id,
        payloadHash,
        orderData: newOrder.toObject(),
      });
    } catch (error) {
      if (error.code !== 11000) throw error;
      checkout = await Checkout.findById(checkoutId);
      if (checkout.payloadHash !== payloadHash) {
        return res.status(409).json({
          code: 'CHECKOUT_KEY_REUSED',
          message: 'Une autre confirmation est déjà associée à cette demande. Vérifiez son état.',
        });
      }
    }
    return checkoutService.respond(await checkoutService.processCheckout(checkout._id), res);
  } catch (error) {
    console.error('Erreur lors de la création de la commande');
    res.status(500).json({
      message: 'Une erreur est survenue lors de la création de la commande.',
    });
  }
};

exports.getCheckout = async (req, res) => {
  if (!requestKeyPattern.test(req.params.requestKey))
    return res.status(400).json({ message: 'Identifiant de confirmation invalide.' });
  try {
    const checkout = await Checkout.findById(
      `${req.user.userId}:${req.params.requestKey.toLowerCase()}`
    );
    if (!checkout) return res.status(404).json({ message: 'Confirmation introuvable.' });
    return checkoutService.respond(checkout, res, 200);
  } catch {
    return res
      .status(503)
      .json({ message: 'Impossible de vérifier la confirmation. Réessayez plus tard.' });
  }
};

exports.getOrders = async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 });
    res.status(200).json(orders);
  } catch {
    res.status(500).json({ message: 'Impossible de récupérer les commandes.' });
  }
};

exports.validateOrder = async (req, res) => {
  req.body = { status: 'En cours de traitement' };
  return exports.updateOrderStatus(req, res);
};

exports.updateOrderStatus = async (req, res) => {
  const { orderId } = req.params;
  const { status } = req.body || {};

  if (!isObjectIdOrHexString(orderId)) {
    return res.status(400).json({ message: 'Identifiant de commande invalide.' });
  }
  if (!Order.schema.path('status').enumValues.includes(status)) {
    return res.status(400).json({ message: 'Le statut de commande est invalide.' });
  }

  try {
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: 'Commande non trouvée.' });
    }
    if (status === order.status) {
      return res.status(200).json({ message: 'Le statut est déjà enregistré.', order });
    }

    const transitions = {
      'En attente': ['En cours de traitement'],
      'En cours de traitement': ['Expédiée'],
      Expédiée: ['Délivrée'],
      Délivrée: [],
      Annulée: [],
    };
    if (!transitions[order.status]?.includes(status)) {
      return res.status(409).json({
        message: 'Ce changement de statut ne respecte pas les étapes de traitement de la commande.',
      });
    }

    const updatedOrder = await Order.findOneAndUpdate(
      { _id: orderId, status: order.status },
      { $set: { status } },
      { new: true, runValidators: true }
    );
    if (!updatedOrder) {
      return res
        .status(409)
        .json({ message: 'La commande a été modifiée. Actualisez la page avant de réessayer.' });
    }

    res.status(200).json({ message: 'Statut mis à jour avec succès', order: updatedOrder });
  } catch (error) {
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};
