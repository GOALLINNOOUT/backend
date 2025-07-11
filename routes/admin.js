const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const User = require('../models/User');
const Perfume = require('../models/Perfume');
const Design = require('../models/Design');
const SecurityLog = require('../models/SecurityLog');
const mongoose = require('mongoose');
const auth = require('../middleware/auth');
const { sendMail } = require('../utils/mailer');
const { logAdminAction, getDeviceInfo } = require('../utils/logAdminAction');

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

// Apply auth and requireAdmin to all admin routes
router.use(auth, requireAdmin);

// GET /api/admin/sales-summary?start=YYYY-MM-DD&end=YYYY-MM-DD
router.get('/sales-summary', async (req, res) => {
  try {
    const { start, end } = req.query;
    const matchPaid = { status: { $in: ['paid', 'shipped', 'delivered'] } };
    const match = { ...matchPaid };
    if (start && end) {
      match.createdAt = { $gte: new Date(start), $lte: new Date(end) };
    }
    // Total sales (number of paid/fulfilled orders)
    const totalSales = await Order.countDocuments(match);
    // Total revenue (sum of grandTotal for paid/fulfilled orders)
    const totalRevenueAgg = await Order.aggregate([
      { $match: match },
      { $group: { _id: null, total: { $sum: '$grandTotal' } } }
    ]);
    const totalRevenue = totalRevenueAgg[0]?.total || 0;
    // Average Order Value
    const avgOrderValue = totalSales > 0 ? totalRevenue / totalSales : 0;
    res.json({ totalSales, totalRevenue, avgOrderValue });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/order-summary
router.get('/order-summary', async (req, res) => {
  try {
    const { start, end } = req.query;
    const match = {};
    if (start && end) {
      match.createdAt = { $gte: new Date(start), $lte: new Date(end) };
    }
    const totalOrders = await Order.countDocuments(match);
    const statusBreakdown = await Order.aggregate([
      { $match: match },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    res.json({ totalOrders, statusBreakdown });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/total-users
router.get('/total-users', async (req, res) => {
  try {
    const { start, end } = req.query;
    const match = {};
    if (start && end) {
      match.createdAt = { $gte: new Date(start), $lte: new Date(end) };
    }
    // Get unique emails from orders
    const orderEmailsAgg = await Order.aggregate([
      { $match: match },
      { $group: { _id: '$customer.email' } }
    ]);
    const orderEmails = orderEmailsAgg.map(u => u._id).filter(Boolean);

    // Get unique emails from users
    const userEmailsAgg = await User.aggregate([
      { $group: { _id: '$email' } }
    ]);
    const userEmails = userEmailsAgg.map(u => u._id).filter(Boolean);

    // Merge and deduplicate
    const emailSet = new Set([...orderEmails, ...userEmails]);
    res.json({ totalUsers: emailSet.size });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/low-stock?threshold=5
router.get('/low-stock', async (req, res) => {
  try {
    const threshold = parseInt(req.query.threshold) || 5;
    // Defensive: ensure threshold is a valid number
    if (isNaN(threshold)) {
      return res.status(400).json({ error: 'Invalid threshold value' });
    }
    // Only Perfume has a stock field
    const lowStockPerfumes = await Perfume.find({ stock: { $lte: threshold } });
    // Design does not have a stock/quantity field; return empty array for now
    const lowStockDesigns = [];
    // Log for debugging
    if (!lowStockPerfumes.length && !lowStockDesigns.length) {
      console.warn('No low stock items found for threshold:', threshold);
    }
    res.json({ perfumes: lowStockPerfumes, designs: lowStockDesigns });
  } catch (err) {
    console.error('Low stock error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/latest-orders?limit=10
router.get('/latest-orders', async (req, res) => {
  try {
    const { start, end } = req.query;
    const match = {};
    if (start && end) {
      match.createdAt = { $gte: new Date(start), $lte: new Date(end) };
    }
    const limit = parseInt(req.query.limit) || 5;
    const orders = await Order.find(match).sort({ createdAt: -1 }).limit(limit);
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/customers
router.get('/customers', async (req, res) => {
  try {
    const { search } = req.query;
    let filter = {};
    if (search && search.trim()) {
      // If search is in the form 'Name <email>', extract email
      const emailMatch = search.match(/<([^>]+)>/);
      if (emailMatch) {
        filter = { email: emailMatch[1] };
      } else {
        const regex = new RegExp(search.trim(), 'i');
        filter = { $or: [ { name: regex }, { email: regex } ] };
      }
    }
    const users = await User.find(filter, '-password -resetPasswordToken -resetPasswordExpires');
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/customer-orders?email=...
router.get('/customer-orders', async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: 'Email required' });
    const orders = await Order.find({ 'customer.email': email });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/admin/blacklist-user
router.patch('/blacklist-user', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });
    const user = await User.findOneAndUpdate(
      { email },
      { status: 'suspended' },
      { new: true }
    );
    if (!user) return res.status(404).json({ error: 'User not found' });
    // Send suspension email (branded, responsive)
    sendMail({
      to: user.email,
      subject: "Your JC's Closet Account Has Been Suspended",
      html: `
        <p>Hi <b>${user.name || user.email}</b>,</p>
        <p style="margin-bottom:18px;">We regret to inform you that your JC's Closet account has been <b style='color:#d32f2f;'>suspended</b> by our admin team. You will not be able to log in or place orders until your account is reactivated.</p>
        <p>If you believe this is a mistake or need clarification, please contact our support team below.</p>
        <a class="cta" href="mailto:favouradeyekun@gmail.com" style="display:inline-block;margin:24px 0 0 0;padding:12px 28px;background:#222;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;font-size:1rem;">Contact Support</a>
        <p style="margin-top:24px;font-size:0.98em;color:#888;">JC's Closet | <a href='https://jcscloset.com' style='color:#222;text-decoration:underline;'>Visit our website</a><br>Phone: <a href="tel:+2348022335287" style="color:#222; text-decoration:underline;">+2348022335287</a></p>
        <p style="margin-top:32px;color:#aaa;font-size:0.93em;">Thank you for your understanding.<br>The JC's Closet Team</p>
      `
    }).catch(err => console.error('Suspension mail error:', err));
    await logAdminAction({ req, action: `Blacklisted user: ${email}` });
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/admin/unsuspend-user
router.patch('/unsuspend-user', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });
    const user = await User.findOneAndUpdate(
      { email },
      { status: 'active' },
      { new: true }
    );
    if (!user) return res.status(404).json({ error: 'User not found' });
    // Send unsuspension email (branded, responsive)
    sendMail({
      to: user.email,
      subject: "Your JC's Closet Account Has Been Reactivated",
      html: `
        <p>Hi <b>${user.name || user.email}</b>,</p>
        <p style="margin-bottom:18px;">Good news! Your JC's Closet account has been <b style='color:#388e3c;'>re-activated</b>. You may now log in and place orders as usual.</p>
        <a class="cta" href="https://jcscloset.com/login" style="display:inline-block;margin:24px 0 0 0;padding:12px 28px;background:#222;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;font-size:1rem;">Log In Now</a>
        <p style="margin-top:24px;font-size:0.98em;color:#888;">JC's Closet | <a href='https://jcscloset.com' style='color:#222;text-decoration:underline;'>Visit our website</a><br>Phone: <a href="tel:+2348022335287" style="color:#222; text-decoration:underline;">+2348022335287</a> | Email: <a href="mailto:favouradeyekun@gmail.com" style="color:#222; text-decoration:underline;">favouradeyekun@gmail.com</a></p>
        <p style="margin-top:32px;color:#aaa;font-size:0.93em;">Thank you for your patience.<br>The JC's Closet Team</p>
      `
    }).catch(err => console.error('Unsuspension mail error:', err));
    await logAdminAction({ req, action: `Unsuspended user: ${email}` });
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/customers/suggestions?query=...
router.get('/customers/suggestions', async (req, res) => {
  try {
    const { query } = req.query;
    if (!query || !query.trim()) return res.json([]);
    const regex = new RegExp(query.trim(), 'i');
    const users = await User.find({ $or: [ { name: regex }, { email: regex } ] }, 'name email').limit(10);
    // Return suggestions as array of strings (name + email)
    const suggestions = users.map(u => `${u.name} <${u.email}>`);
    res.json(suggestions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/admin/update-customer
router.patch('/update-customer', async (req, res) => {
  try {
    const { _id, name, email, role, status, phone, address, state, lga } = req.body;
    if (!_id) return res.status(400).json({ error: 'User ID required' });
    // Only allow valid roles and statuses
    const allowedRoles = ['user', 'admin', 'customer'];
    const allowedStatuses = ['active', 'suspended', 'blacklisted'];
    const update = {};
    if (name !== undefined) update.name = name;
    if (email !== undefined) update.email = email;
    if (role !== undefined && allowedRoles.includes(role)) update.role = role;
    if (status !== undefined && allowedStatuses.includes(status)) update.status = status;
    if (phone !== undefined) update.phone = phone;
    if (address !== undefined) update.address = address;
    if (state !== undefined) update.state = state;
    if (lga !== undefined) update.lga = lga;
    const user = await User.findByIdAndUpdate(_id, update, { new: true });
    if (!user) return res.status(404).json({ error: 'User not found' });
    await logAdminAction({ req, action: `Updated user: ${user.email || user._id}` });
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/security-log
router.get('/security-log', async (req, res) => {
  try {
    // Always fetch the last 50 admin logs for frontend display
    const limit = 10;
    const logs = await SecurityLog.find({ admin: { $exists: true, $ne: null } })
      .sort({ timestamp: -1, createdAt: -1 })
      .limit(limit)
      .populate('admin', 'name email');
    res.json(logs.map(log => ({
      _id: log._id,
      action: log.action,
      ip: log.ip,
      device: log.device,
      timestamp: log.timestamp || log.createdAt,
      admin: log.admin ? { name: log.admin.name, email: log.admin.email, _id: log.admin._id } : undefined
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
