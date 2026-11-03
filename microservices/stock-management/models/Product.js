const mongoose = require('mongoose');

const reservationSchema = new mongoose.Schema(
  {
    orderId: { type: String, required: true },
    quantity: { type: Number, required: true },
  },
  { _id: false }
);

const productSchema = new mongoose.Schema(
  {
    stock: { type: Number, required: true },
    stockReservations: { type: [reservationSchema], default: [] },
  },
  { collection: 'products', timestamps: true }
);

module.exports = mongoose.model('StockProduct', productSchema);
