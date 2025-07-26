const express = require('express');
const router = express.Router();
const CheckoutEventLog = require('../models/CheckoutEventLog');

// Log a checkout event (user lands on checkout page)
router.post('/', async (req, res) => {
  try {
    const { sessionId, user } = req.body;
    if (!sessionId) return res.status(400).json({ error: 'Session ID is required to log your checkout event.' });
    await CheckoutEventLog.create({ sessionId, user });
    res.status(201).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Oops! We could not log your checkout event. Please try again later.' });
  }
});

module.exports = router;
