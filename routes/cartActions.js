const express = require('express');
const router = express.Router();
const CartActionLog = require('../models/CartActionLog');

// Log a cart action (add/remove/update)
router.post('/', async (req, res) => {
  try {
    const { sessionId, productId, action, quantity } = req.body;
    if (!sessionId || !productId || !action) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    await CartActionLog.create({ sessionId, productId, action, quantity });
    res.status(201).json({ message: 'Cart action logged' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to log cart action' });
  }
});

module.exports = router;
