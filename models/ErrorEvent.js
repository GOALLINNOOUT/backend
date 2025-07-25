const mongoose = require('mongoose');

const ErrorEventSchema = new mongoose.Schema({
  message: { type: String, required: true },
  stack: { type: String },
  url: { type: String },
  user: { type: String },
  timestamp: { type: Date, default: Date.now },
}, { timestamps: true });

module.exports = mongoose.model('ErrorEvent', ErrorEventSchema);
