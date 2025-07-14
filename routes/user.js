const express = require('express');
const auth = require('../middleware/auth');
const User = require('../models/User');
const { getDeviceInfo } = require('../utils/logAdminAction');
const SecurityLog = require('../models/SecurityLog');

const router = express.Router();

// Admin role check middleware
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// Optional auth middleware for public endpoints
function optionalAuth(req, res, next) {
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    return auth(req, res, next);
  }
  next();
}

// Get current user profile (protected)
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-password');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ data: user });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Update user profile (protected)
router.put('/me', auth, async (req, res) => {
  try {
    const updates = req.body;
    if (updates.password) delete updates.password; // Prevent password change here
    const user = await User.findByIdAndUpdate(req.user.userId, updates, { new: true, select: '-password' });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Change user password (protected)
router.post('/change-password', auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password required' });
    }
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) return res.status(400).json({ error: 'Current password is incorrect' });
    user.password = newPassword;
    await user.save();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get user login/logout history (protected)
router.get('/login-history', auth, async (req, res) => {
  try {
    // Fetch both login and logout actions for the user
    const logs = await SecurityLog.find({
      user: req.user.userId,
      action: { $in: ['login', 'logout'] }
    })
      .sort({ createdAt: -1, timestamp: -1 })
      .limit(50)
      .select('createdAt timestamp ip device action');
    // Prefer createdAt, fallback to timestamp for legacy logs
    const formattedLogs = logs.map(log => ({
      createdAt: log.createdAt || log.timestamp,
      ip: log.ip,
      device: log.device,
      action: log.action
    }));
    res.json(formattedLogs);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete user login/logout history (protected)
router.delete('/login-history', auth, async (req, res) => {
  try {
    await SecurityLog.deleteMany({ user: req.user.userId, action: { $in: ['login', 'logout'] } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Example admin-only route (add your admin APIs like this)
// router.get('/admin/users', auth, requireAdmin, async (req, res) => {
//   // admin logic here
// });

// Save guest info for future checkout (public, token optional)
router.post('/save-info', optionalAuth, async (req, res) => {
  try {
    const { name, email, phone, address, state, lga } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });
    await User.updateOne(
      { email },
      {
        $set: {
          name,
          email,
          phone,
          address,
          state,
          lga,
          role: 'user',
        },
        $setOnInsert: { password: 'guest-' + Date.now() }, // dummy password for guest
      },
      { upsert: true }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get guest info by email (public, token optional)
router.get('/save-info', optionalAuth, async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: 'Email is required' });
    const user = await User.findOne({ email }).select('-password -role -createdAt -resetPasswordToken -resetPasswordExpires');
    if (!user) return res.status(404).json({});
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Utility to log user logout
async function logUserAction(req, userId, action) {
  try {
    await SecurityLog.create({
      user: userId,
      action,
      ip: req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress,
      device: getDeviceInfo(req),
      createdAt: new Date(),
    });
  } catch (err) {
    console.error('SecurityLog error:', err);
  }
}

// Logout endpoint
router.post('/logout', auth, async (req, res) => {
  try {
    await logUserAction(req, req.user._id, 'logout');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
