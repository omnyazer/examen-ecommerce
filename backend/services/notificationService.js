const axios = require('axios');

async function sendOrderNotification(order) {
  if (process.env.NOTIFICATIONS_ENABLED !== 'true') return 'disabled';
  const recipient = process.env.ORDER_NOTIFICATION_EMAIL;
  if (!recipient || !process.env.INTERNAL_SERVICE_TOKEN) {
    console.error('Configuration des notifications incomplète');
    return 'failed';
  }
  try {
    const gatewayUrl = process.env.GATEWAY_URL || 'http://localhost:8000';
    await axios.post(
      `${gatewayUrl}/notify`,
      {
        to: recipient,
        subject: 'Nouvelle commande créée',
        text:
          `Commande ${order._id}\nMontant : ${order.total.toFixed(2)} EUR\n` +
          order.items.map((item) => `Produit ${item.productId} : ${item.quantity}`).join('\n'),
      },
      {
        headers: { 'X-Internal-Token': process.env.INTERNAL_SERVICE_TOKEN },
        timeout: 15000,
      }
    );
    return 'sent';
  } catch {
    console.error('Échec de la notification de commande');
    return 'failed';
  }
}

module.exports = { sendOrderNotification };
