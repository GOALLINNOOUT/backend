const mongoose = require('mongoose');

const DesignSchema = new mongoose.Schema({
  title: { type: String, required: true },
  desc: { type: String, required: true },
  details: { type: String },
  imgs: [{ type: String }], // Array of image URLs or paths
  sizes: [{ type: String }], // Array of sizes (optional)
  categories: [{ type: String, required: true }], // At least one required
  colors: [{ type: String }], // Array of color variants
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Design', DesignSchema);
