const mongoose = require('mongoose');

const PageViewLogSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  email: { type: String }, // Add email field for analytics
  ip: String,
  device: String,
  userAgent: String,
  page: { type: String, required: true },
  referrer: { type: String, default: '' }, // Added referrer field
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('PageViewLog', PageViewLogSchema);
