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
  amount: { type: Number, required: true }, 
  deliveryFee: { type: Number, required: true },
  grandTotal: { type: Number, required: true },
  status: { type: String, enum: ['paid', 'shipped', 'out_for_delivery', 'delivered', 'cancelled'], default: 'paid' },
  paidAt: { type: Date, required: true },
  shippedAt: { type: Date },
  deliveredAt: { type: Date },
  cancelledAt: { type: Date },
  createdAt: { type: Date, default: Date.now },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  sessionId: { type: String }
});

OrderSchema.index({ createdAt: 1 });
OrderSchema.index({ 'customer._id': 1 });
OrderSchema.index({ 'customer.email': 1 });
OrderSchema.index({ status: 1 });
OrderSchema.index({ sessionId: 1 });

module.exports = mongoose.model('Order', OrderSchema);
