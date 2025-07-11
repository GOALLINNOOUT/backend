const express = require('express');
const router = express.Router();
const Perfume = require('../models/Perfume');
const Design = require('../models/Design');

// POST /api/cart/check-stock
router.post('/check-stock', async (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items)) {
    return res.status(400).json({ success: false, message: 'Invalid items array.' });
  }

  // Check each item for stock
  for (const item of items) {
    let product = await Perfume.findById(item._id).lean();
    if (!product) {
      product = await Design.findById(item._id).lean();
    }
    if (!product) {
      return res.status(404).json({ success: false, message: `Product not found: ${item._id}` });
    }
    if (product.stock < item.quantity) {
      return res.status(400).json({ success: false, message: `Insufficient stock for ${product.name}. Only ${product.stock} left.` });
    }
  }

  return res.json({ success: true });
});

module.exports = router;
