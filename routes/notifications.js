const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const auth = require('../middleware/auth');

// Get notifications for logged-in user
router.get('/', auth, async (req, res) => {
  try {
    const notifications = await Notification.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.json(notifications);
  } catch (err) {
    res.status(500).json({ error: 'Oops! We could not fetch your notifications. Please try again later.' });
  }
});

// Mark notification as read
router.patch('/:id/read', auth, async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { read: true },
      { new: true }
    );
    if (!notification) return res.status(404).json({ error: 'Sorry, we could not find the requested notification.' });
    res.json(notification);
  } catch (err) {
    res.status(500).json({ error: 'Oops! We could not update your notification. Please try again later.' });
  }
});

// Admin: Get all notifications (optional)
router.get('/all', auth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Sorry, you need admin access to view all notifications.' });
  try {
    const notifications = await Notification.find().sort({ createdAt: -1 });
    res.json(notifications);
  } catch (err) {
    res.status(500).json({ error: 'Oops! We could not fetch all notifications. Please try again later.' });
  }
});

// Admin: Create notification for a user
router.post('/', auth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Sorry, you need admin access to create notifications.' });
  const { userId, message } = req.body;
  if (!userId || !message) return res.status(400).json({ error: 'Please provide both a user and a message to create a notification.' });
  try {
    const notification = await Notification.create({ user: userId, message });
    res.status(201).json(notification);
  } catch (err) {
    res.status(500).json({ error: 'Oops! We could not create the notification. Please try again later.' });
  }
});

module.exports = router;
