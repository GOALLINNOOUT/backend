const mongoose = require('mongoose');

const OrderSchema = new mongoose.Schema({
  customer: {
    name: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String, required: true },
    address: { type: String, required: true },
    state: { type: String, required: true },
    lga: { type: String, required: true },
  },
  cart: [
    {
      _id: String,
      name: String,
      price: Number,
      quantity: Number,
      images: [String],
      promoEnabled: Boolean,
      promoType: String,
      promoValue: Number,
      promoStart: Date,
      promoEnd: Date,
    }
  ],
  paystackRef: { type: String, required: true },
  amount: { type: Number, required: true }, // subtotal (cart only)
  deliveryFee: { type: Number, required: true },
  grandTotal: { type: Number, required: true },
  status: { type: String, enum: ['paid', 'shipped', 'delivered', 'cancelled'], default: 'paid' },
  paidAt: { type: Date, required: true },
  shippedAt: { type: Date },
  deliveredAt: { type: Date },
  cancelledAt: { type: Date },
  createdAt: { type: Date, default: Date.now },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  sessionId: { type: String }
});

module.exports = mongoose.model('Order', OrderSchema);
