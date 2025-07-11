const mongoose = require('mongoose');

const PerfumeSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, required: true },
  price: { type: Number, required: true },
  stock: { type: Number, required: true, default: 0 },
  images: [{ type: String }], // up to 5 images
  mainImageIndex: { type: Number, default: 0 }, // index of main image
  promoEnabled: { type: Boolean, default: false },
  promoType: { type: String, enum: ['discount', 'price'], default: 'discount' },
  promoValue: { type: Number },
  promoStart: { type: Date },
  promoEnd: { type: Date },
  categories: [{ type: String, enum: ['men', 'women', 'luxury', 'arab', 'designer', 'affordable'] }],
  createdAt: { type: Date, default: Date.now },
  views: { type: Number, default: 0 }, // Track product views
});

module.exports = mongoose.model('Perfume', PerfumeSchema);
