const axios = require('axios');

async function updateStock(path, order) {
  if (!process.env.INTERNAL_SERVICE_TOKEN) {
    throw new Error('Le service de stock doit être configuré.');
  }
  const gatewayUrl = process.env.GATEWAY_URL || 'http://localhost:8000';
  await axios.post(
    `${gatewayUrl}/${path}`,
    {
      orderId: String(order._id),
      items: order.items.map((item) => ({
        productId: String(item.productId),
        quantity: item.quantity,
      })),
    },
    {
      headers: { 'X-Internal-Token': process.env.INTERNAL_SERVICE_TOKEN },
      timeout: 15000,
    }
  );
}

module.exports = {
  reserveStock: (order) => updateStock('update-stock', order),
  releaseStock: (order) => updateStock('release-stock', order),
};
