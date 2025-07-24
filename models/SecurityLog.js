const mongoose = require('mongoose');

const SecurityLogSchema = new mongoose.Schema({
  admin: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  action: {
    type: String,
    required: true
  },
  ip: String,
  device: String,
  timestamp: {
    type: Date,
    default: Date.now
  }
});

SecurityLogSchema.index({ user: 1 });
SecurityLogSchema.index({ device: 1 });
SecurityLogSchema.index({ timestamp: 1 });

module.exports = mongoose.model('SecurityLog', SecurityLogSchema);
