const { logger } = require('../logger');
const { randomUUID } = require('node:crypto');
const Checkout = require('../models/Checkout');
const Order = require('../models/Order');
const stockService = require('./stockService');
const notificationService = require('./notificationService');

async function notify(checkout) {
  const claimed = await Checkout.findOneAndUpdate(
    { _id: checkout._id, state: 'confirmed', notificationStatus: 'pending' },
    { $set: { notificationStatus: 'sending', notificationStartedAt: new Date() } },
    { new: true }
  );
  if (!claimed) return;
  const order = await Order.findById(checkout.orderId);
  const status = await notificationService.sendOrderNotification(order);
  await Checkout.updateOne(
    { _id: checkout._id, notificationStatus: 'sending' },
    { $set: { notificationStatus: status } }
  );
}

/** Traite une demande avec un bail exclusif et reprend une réservation interrompue sans créer de doublon.
 * @param {string} id Identifiant utilisateur:UUID de la demande.
 * @returns {Promise<object>} ?tat persistant de la demande.
 */
async function processCheckout(id) {
  const owner = randomUUID();
  const checkout = await Checkout.findOneAndUpdate(
    {
      _id: id,
      state: { $in: ['pending', 'releasing'] },
      $or: [{ leaseUntil: null }, { leaseUntil: { $lte: new Date() } }],
    },
    { $set: { leaseOwner: owner, leaseUntil: new Date(Date.now() + 60000) } },
    { new: true }
  );
  if (!checkout) return Checkout.findById(id);
  const filter = { _id: id, leaseOwner: owner };
  const heartbeat = setInterval(() => {
    Checkout.updateOne(filter, { $set: { leaseUntil: new Date(Date.now() + 60000) } }).catch(() =>
      logger.error('La reprise de commande attend la base de données.')
    );
  }, 10000);
  heartbeat.unref();
  const order = new Order({ ...checkout.orderData, _id: checkout.orderId });
  try {
    let savedOrder = await Order.findById(checkout.orderId);
    if (!savedOrder && checkout.state !== 'releasing') {
      try {
        await stockService.reserveStock(order);
      } catch (error) {
        const status = error.response?.status;
        if (![404, 409].includes(status)) throw error;
        checkout.state = 'releasing';
        checkout.httpStatus = status;
        checkout.message =
          status === 409
            ? 'Le stock disponible a changé. Veuillez vérifier votre panier.'
            : 'Un produit du panier est introuvable.';
        await Checkout.updateOne(filter, {
          $set: {
            state: 'releasing',
            httpStatus: checkout.httpStatus,
            message: checkout.message,
          },
        });
      }
      if (checkout.state !== 'releasing') {
        try {
          savedOrder = await order.save();
        } catch (error) {
          if (error.code !== 11000) throw error;
          savedOrder = await Order.findById(checkout.orderId);
          if (!savedOrder) throw error;
        }
      }
    }

    if (savedOrder) {
      await Checkout.updateOne(filter, {
        $set: { state: 'confirmed', leaseUntil: null },
        $unset: { leaseOwner: 1 },
      });
      await notify(checkout);
    } else if (checkout.state === 'releasing') {
      await stockService.releaseStock(order);
      await Checkout.updateOne(filter, {
        $set: { state: 'failed', leaseUntil: null },
        $unset: { leaseOwner: 1 },
      });
    }
  } catch {
    await Checkout.updateOne(filter, {
      $set: { nextAttemptAt: new Date(Date.now() + 15000), leaseUntil: null },
      $unset: { leaseOwner: 1 },
    });
  } finally {
    clearInterval(heartbeat);
  }
  return Checkout.findById(id);
}

async function respond(checkout, res, confirmedStatus = 201) {
  if (checkout.state === 'confirmed') {
    const order = await Order.findById(checkout.orderId);
    return res.status(confirmedStatus).json({
      message: 'Commande confirmée.',
      order,
      notificationStatus: checkout.notificationStatus,
    });
  }
  if (checkout.state === 'failed') {
    return res
      .status(checkout.httpStatus || 409)
      .json({ message: checkout.message || 'La commande n’a pas pu être confirmée.' });
  }
  return res.status(202).json({
    pending: true,
    message: 'La confirmation est en cours. Vérifiez son état avant de passer une autre commande.',
  });
}

/** Relance périodiquement les demandes interrompues et retourne une fonction d'arrêt attendable.
 * @returns {Function} Fonction asynchrone arrêtant la boucle de reprise.
 */
function startRecovery() {
  let running = false;
  let currentRun = Promise.resolve();
  async function recover() {
    if (running) return;
    running = true;
    try {
      const pending = await Checkout.find({
        state: { $in: ['pending', 'releasing'] },
        nextAttemptAt: { $lte: new Date() },
        $or: [{ leaseUntil: null }, { leaseUntil: { $lte: new Date() } }],
      })
        .sort({ createdAt: 1 })
        .limit(20);
      for (const checkout of pending) await processCheckout(checkout._id);
      const notifications = await Checkout.find({
        state: 'confirmed',
        notificationStatus: 'pending',
      }).limit(20);
      for (const checkout of notifications) await notify(checkout);
      await Checkout.updateMany(
        {
          state: 'confirmed',
          notificationStatus: 'sending',
          notificationStartedAt: { $lt: new Date(Date.now() - 120000) },
        },
        { $set: { notificationStatus: 'unknown' } }
      );
    } catch {
      logger.error('La reprise des commandes sera retentée.');
    } finally {
      running = false;
    }
  }
  const schedule = () => {
    if (!running) currentRun = recover();
  };
  const timer = setInterval(schedule, 15000);
  timer.unref();
  schedule();
  return async () => {
    clearInterval(timer);
    await currentRun;
  };
}

module.exports = { processCheckout, respond, startRecovery };
