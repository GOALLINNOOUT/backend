const mongoose = require('mongoose');

const SessionLogSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  ip: String,
  device: String,
  startTime: { type: Date, required: true },
  endTime: { type: Date },
  lastActivity: { type: Date }, // Track last activity for session expiration
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('SessionLog', SessionLogSchema);
