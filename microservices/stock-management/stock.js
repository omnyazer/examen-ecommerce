function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

async function releaseStock(Product, orderId, items) {
  for (const { productId, quantity } of items) {
    await Product.findOneAndUpdate(
      { _id: productId, stockReservations: { $elemMatch: { orderId, quantity } } },
      { $inc: { stock: quantity }, $pull: { stockReservations: { orderId, quantity } } },
      { new: true }
    );
  }
}

async function reserveStock(Product, orderId, items) {
  const reserved = [];
  try {
    for (const { productId, quantity } of items) {
      const updated = await Product.findOneAndUpdate(
        {
          _id: productId,
          stock: { $gte: quantity },
          'stockReservations.orderId': { $ne: orderId },
        },
        { $inc: { stock: -quantity }, $push: { stockReservations: { orderId, quantity } } },
        { new: true }
      );
      if (updated) {
        reserved.push({ productId, quantity });
        continue;
      }

      const product = await Product.findById(productId);
      if (!product) throw httpError(404, 'Un produit du panier est introuvable.');
      const existing = product.stockReservations.find((entry) => entry.orderId === orderId);
      if (existing?.quantity === quantity) continue;
      if (existing)
        throw httpError(409, 'La réservation existante contient une quantité différente.');
      throw httpError(409, 'Stock insuffisant pour un produit du panier.');
    }
  } catch (error) {
    try {
      await releaseStock(Product, orderId, reserved);
    } catch {
      throw httpError(503, 'La remise en stock nécessite une vérification.');
    }
    throw error;
  }
}

module.exports = { reserveStock, releaseStock };
