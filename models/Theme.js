const mongoose = require('mongoose');

const ThemeSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  sessionId: { type: String, default: null },
  colorMode: { type: String, enum: ['light', 'dark'], required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

ThemeSchema.index({ user: 1 });
ThemeSchema.index({ sessionId: 1 });

module.exports = mongoose.model('Theme', ThemeSchema);
