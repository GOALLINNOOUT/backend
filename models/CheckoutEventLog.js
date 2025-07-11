const mongoose = require('mongoose');

const CheckoutEventLogSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  timestamp: { type: Date, default: Date.now, index: true }
});

module.exports = mongoose.model('CheckoutEventLog', CheckoutEventLogSchema);
