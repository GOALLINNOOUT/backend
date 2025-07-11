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

module.exports = mongoose.model('SecurityLog', SecurityLogSchema);
