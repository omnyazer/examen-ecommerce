// backend/models/Product.js
const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    price: { type: Number, required: true },
    description: { type: String, required: true },
    stock: { type: Number, required: true },
    stockReservations: {
      type: [{ orderId: String, quantity: Number, _id: false }],
      default: [],
      select: false,
    },
  },
  {
    timestamps: true, // Ajoute createdAt et updatedAt
  }
);

module.exports = mongoose.model('Product', productSchema);
