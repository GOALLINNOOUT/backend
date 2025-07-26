const express = require('express');
const router = express.Router();
const Perfume = require('../models/Perfume');
const Design = require('../models/Design');

// POST /api/cart/check-stock
router.post('/check-stock', async (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items)) {
    return res.status(400).json({ success: false, message: 'Please provide a valid list of items to check stock.' });
  }

  // Check each item for stock
  for (const item of items) {
    let product = await Perfume.findById(item._id).lean();
    if (!product) {
      product = await Design.findById(item._id).lean();
    }
    if (!product) {
      return res.status(404).json({ success: false, message: 'Sorry, we could not find one of the products in your cart.' });
    }
    if (product.stock < item.quantity) {
      return res.status(400).json({ success: false, message: `Sorry, we only have ${product.stock} left of ${product.name}. Please adjust your quantity.` });
    }
  }

  return res.json({ success: true });
});

module.exports = router;
