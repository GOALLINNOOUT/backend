const mongoose = require('mongoose');

const CartActionLogSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, index: true },
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Perfume', required: true },
  action: { type: String, enum: ['add', 'remove', 'update'], required: true },
  quantity: { type: Number, default: 1 },
  timestamp: { type: Date, default: Date.now, index: true }
});


module.exports = mongoose.model('CartActionLog', CartActionLogSchema);
