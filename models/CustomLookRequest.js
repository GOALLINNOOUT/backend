const mongoose = require('mongoose');

const CustomLookRequestSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String },
  notes: { type: String },
  designTitle: { type: String },
  designId: { type: mongoose.Schema.Types.ObjectId, ref: 'Design' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('CustomLookRequest', CustomLookRequestSchema);
