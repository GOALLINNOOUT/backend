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

  // Check each item for stock and price
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
    // Check for price change (including promo)
    let currentPrice = product.price;
    if (product.promoEnabled && product.promoValue != null && product.promoStart && product.promoEnd) {
      const now = new Date();
      if (new Date(product.promoStart) <= now && new Date(product.promoEnd) >= now) {
        if (product.promoType === 'discount') {
          currentPrice = Math.round(product.price * (1 - product.promoValue / 100));
        } else if (product.promoType === 'price') {
          currentPrice = product.promoValue;
        }
      }
    }
    if (item.price !== undefined && Number(item.price) !== Number(currentPrice)) {
      return res.status(409).json({ success: false, message: `The price of ${product.name} has changed. Please review your cart before checking out.` });
    }
  }

  return res.json({ success: true });
});

module.exports = router;
