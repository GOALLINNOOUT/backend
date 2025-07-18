// Utility: Send push notification to a specific user and all admins
// Usage: await sendPushToUserAndAdmins(userId, { title, body, url })
const User = require('../models/User');
async function sendPushToUserAndAdmins(userId, { title, body, url }) {
  const payload = JSON.stringify({ title, body, url });
  // Find subscriptions for the user
  const userSubs = await Subscription.find({ user: userId });
  // Find all admin users
  const admins = await User.find({ role: 'admin' });
  const adminIds = admins.map(a => a._id);
  // Find subscriptions for all admins
  const adminSubs = await Subscription.find({ user: { $in: adminIds } });
  // Merge and deduplicate by endpoint
  const allSubs = [...userSubs, ...adminSubs].filter((sub, idx, arr) =>
    arr.findIndex(s => s.endpoint === sub.endpoint) === idx
  );
  console.log('[Push] Sending push to', allSubs.length, 'subscriptions. User:', userId, 'Admins:', adminIds);
  let sent = 0;
  for (const sub of allSubs) {
    try {
      await webpush.sendNotification(sub, payload);
      sent++;
      console.log('[Push] Sent to', sub.endpoint);
    } catch (err) {
      console.error('[Push] Failed to send to', sub.endpoint, err.message);
    }
  }
  return sent;
}

const express = require('express');
const router = express.Router();
const webpush = require('web-push');
const mongoose = require('mongoose');

// Simple model for storing subscriptions
const SubscriptionSchema = new mongoose.Schema({
  endpoint: String,
  keys: mongoose.Schema.Types.Mixed,
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
});
const Subscription = mongoose.model('Subscription', SubscriptionSchema);

// VAPID keys (generate with web-push CLI)
webpush.setVapidDetails(
  'mailto:adeyekunadelola0@gmail.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// Save push subscription
// Exportable subscribe handler
async function subscribe(req, res) {
  try {
    const sub = req.body;
    // Optionally associate with logged-in user
    let user = null;
    if (req.user && req.user._id) user = req.user._id;
    await Subscription.findOneAndUpdate(
      { endpoint: sub.endpoint },
      { ...sub, user },
      { upsert: true, new: true }
    );
    res.status(201).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save subscription' });
  }
}
router.post('/subscribe', subscribe);

// Send push notification to all subscribers (demo)
router.post('/send', async (req, res) => {
  try {
    const { title, body, url } = req.body;
    const payload = JSON.stringify({ title, body, url });
    const subs = await Subscription.find();
    for (const sub of subs) {
      await webpush.sendNotification(sub, payload);
    }
    res.json({ sent: subs.length });
  } catch (err) {
    res.status(500).json({ error: 'Failed to send push' });
  }
});

module.exports = {
  router,
  subscribe,
  sendPushToUserAndAdmins
};
