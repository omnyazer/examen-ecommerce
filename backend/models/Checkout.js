const mongoose = require('mongoose');

const checkoutSchema = new mongoose.Schema(
  {
    _id: { type: String },
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, required: true },
    payloadHash: { type: String, required: true },
    orderData: { type: mongoose.Schema.Types.Mixed, required: true },
    state: {
      type: String,
      enum: ['pending', 'releasing', 'confirmed', 'failed'],
      default: 'pending',
    },
    httpStatus: { type: Number },
    message: { type: String },
    leaseOwner: { type: String },
    leaseUntil: { type: Date, default: null },
    nextAttemptAt: { type: Date, default: Date.now },
    notificationStatus: {
      type: String,
      enum: ['pending', 'sending', 'sent', 'failed', 'disabled', 'unknown'],
      default: 'pending',
    },
    notificationStartedAt: { type: Date },
  },
  { timestamps: true }
);

checkoutSchema.index({ state: 1, nextAttemptAt: 1, leaseUntil: 1 });
module.exports = mongoose.model('Checkout', checkoutSchema);
