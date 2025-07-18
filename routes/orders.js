const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const { sendOrderEmail, orderCustomerTemplate, orderAdminTemplate, orderStatusUpdateTemplate, orderAdminCancelTemplate } = require('../utils/orderMailer');
const auth = require('../middleware/auth');
const { logAdminAction, getDeviceInfo } = require('../utils/logAdminAction');
const { generateSetupToken } = require('../utils/setupToken');
const mailer = require('../utils/mailer');

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

// Create new order (public, token optional)
router.post('/', optionalAuth, async (req, res) => {
  try {
    const { customer, cart, paystackRef, amount, deliveryFee, grandTotal, status, paidAt, sessionId } = req.body;
    if (!customer || !cart || !paystackRef || !amount || deliveryFee == null || grandTotal == null || !status || !paidAt) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // --- ENHANCEMENT: Backfill user location and log device robustly ---
    const User = require('../models/User');
    const SecurityLog = require('../models/SecurityLog');
    let userDoc = await User.findOne({ email: customer.email });
    console.log('User lookup result:', userDoc ? 'Found existing user' : 'User not found');
    let wasAutoCreated = false;
    if (!userDoc) {
      console.log('Creating new user for email:', customer.email);
      userDoc = new User({
        name: customer.name || customer.email,
        email: customer.email,
        password: Math.random().toString(36).slice(-8), // random password, force reset on first login
        state: customer.state,
        lga: customer.lga,
        address: customer.address,
        phone: customer.phone
      });
      await userDoc.save();
      wasAutoCreated = true;
      console.log('New user created, wasAutoCreated:', wasAutoCreated);
    } else {
      let updated = false;
      if ((!userDoc.state || userDoc.state === '') && customer.state) { userDoc.state = customer.state; updated = true; }
      if ((!userDoc.lga || userDoc.lga === '') && customer.lga) { userDoc.lga = customer.lga; updated = true; }
      if ((!userDoc.address || userDoc.address === '') && customer.address) { userDoc.address = customer.address; updated = true; }
      if (updated) await userDoc.save();
      console.log('Using existing user, wasAutoCreated:', wasAutoCreated);
    }
    // Now create the order with userDoc._id and sessionId
    const order = new Order({ customer, cart, paystackRef, amount, deliveryFee, grandTotal, status, paidAt, user: userDoc._id, sessionId });
    await order.save();
    // Log device info for every order
    const device = getDeviceInfo(req);
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    await SecurityLog.create({ user: userDoc._id, action: 'order', device, ip, timestamp: new Date() });
    // --- END ENHANCEMENT ---

    // Send beautiful email to customer
    let setupLink = null;
    if (wasAutoCreated) {
      // Generate setup token and link
      const setupToken = generateSetupToken(userDoc);
      const clientUrl = process.env.CLIENT_URL || 'https://jccloset.vercel.app';
      setupLink = `${clientUrl}/setup-password/${setupToken}`;
    }
    sendOrderEmail({
      to: customer.email,
      subject: "Your JC's Closet Order Confirmation",
      html: orderCustomerTemplate(order) +
        (setupLink ? `
        <div style="margin:32px auto 0 auto;max-width:480px;padding:0 10px;text-align:center;">
          <a href="${setupLink}"
            style="display:inline-block;background:#b48a78;color:#fff;padding:18px 40px;border-radius:8px;text-decoration:none;font-weight:700;font-size:1.15rem;box-shadow:0 2px 8px rgba(180,138,120,0.15);transition:background 0.2s;">
            Set up your account
          </a>
          <p style="color:#555;font-size:1em;margin-top:16px;line-height:1.5;max-width:400px;margin-left:auto;margin-right:auto;">
            <strong>Why?</strong> Creating a password lets you access your order history, track your orders, and enjoy faster checkout next time.<br>
            <span style="color:#b48a78;font-weight:600;">It's quick and secure!</span>
          </p>
        </div>
        <style>@media (max-width:600px){a[style*='padding:18px 40px']{padding:14px 10px;font-size:1rem;}}</style>
        ` : '')
    }).catch(() => {});
    // Send beautiful email to admin
    if (process.env.ADMIN_EMAIL) {
      sendOrderEmail({
        to: process.env.ADMIN_EMAIL,
        subject: 'New JC\'s Closet Order',
        html: orderAdminTemplate(order)
      }).catch(() => {});
    }
        
        // // Emit Socket.IO events for real-time notification
        // const io = req.app.get('io');
        // if (io) {
        //   console.log('[Order] Emitting notification to user room:', `user_${userDoc._id}`);
        //   io.to(`user_${userDoc._id}`).emit('notification', {
        //     message: `Your order has been placed successfully! Order ID: ${order._id}`,
        //     type: 'order',
        //     createdAt: new Date(),
        //     read: false
        //   });
        //   console.log('[Order] Emitting notification to admins room: admins');
        //   io.to('admins').emit('notification', {
        //     message: `New order placed by ${customer.name || customer.email}. Order ID: ${order._id}`,
        //     type: 'order',
        //     createdAt: new Date(),
        //     read: false
        //   });
        // }

    // Store notification in DB for user and all admins, and send push
    try {
      const Notification = require('../models/Notification');
      const { sendPushToUserAndAdmins } = require('../routes/push');
      const webpush = require('web-push');
      const Subscription = require('../routes/push').Subscription || require('mongoose').model('Subscription');
      const User = require('../models/User');
      const admins = await User.find({ role: 'admin' });
      const adminIds = admins.map(a => a._id);
      const notifMsgUser = `Your order has been placed successfully! Order ID: ${order._id}`;
      const notifMsgAdmin = `New order placed by ${customer.name || customer.email}. Order ID: ${order._id}`;
      // Create notification for user
      await Notification.create({ user: userDoc._id, message: notifMsgUser, type: 'order' });
      // Create notification for each admin
      for (const adminId of adminIds) {
        await Notification.create({ user: adminId, message: notifMsgAdmin, type: 'order' });
      }
      // Send push notification to user only
      const userSubs = await Subscription.find({ user: userDoc._id });
      const userPayload = JSON.stringify({
        title: 'Order Placed!',
        body: `Your order has been placed successfully! Order #${order._id.toString().slice(-6).toUpperCase()}`,
        url: `/orders`
      });
      for (const sub of userSubs) {
        try {
          await webpush.sendNotification(sub, userPayload);
        } catch (err) {
          console.error('[Push] Failed to send to user', sub.endpoint, err.message);
        }
      }
      // Send push notification to each admin
      const adminPayload = JSON.stringify({
        title: 'New Order!',
        body: `New order placed by ${customer.name || customer.email}. Order #${order._id.toString().slice(-6).toUpperCase()}`,
        url: `/admin/orders`
      });
      const adminSubs = await Subscription.find({ user: { $in: adminIds } });
      for (const sub of adminSubs) {
        try {
          await webpush.sendNotification(sub, adminPayload);
        } catch (err) {
          console.error('[Push] Failed to send to admin', sub.endpoint, err.message);
        }
      }
    } catch (err) {
      console.error('[Order] Notification/push error:', err);
    }
    res.status(201).json({
      message: 'Order saved',
      orderId: order._id,
      wasAutoCreated,
      email: customer.email
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save order' });
  }
});

// All admin order routes below require token and admin role
router.get('/', auth, requireAdmin, async (req, res) => {
  try {
    const { search, email, state } = req.query;
    let query = {};
    if (email) {
      query['customer.email'] = { $regex: email, $options: 'i' };
    }
    if (state) {
      query['customer.state'] = { $regex: state, $options: 'i' };
    }
    if (search && search.trim()) {
      const s = search.trim();
      query.$or = [
        { 'customer.name': { $regex: s, $options: 'i' } },
        { 'customer.email': { $regex: s, $options: 'i' } },
        { 'customer.phone': { $regex: s, $options: 'i' } },
        { 'customer.address': { $regex: s, $options: 'i' } },
        { 'customer.state': { $regex: s, $options: 'i' } },
        { 'customer.lga': { $regex: s, $options: 'i' } },
        { _id: { $regex: s, $options: 'i' } },
      ];
    }
    const orders = await Order.find(query).sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// Update order status (admin)
router.patch('/:id', auth, requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    const update = { status };
    if (status === 'shipped') update.shippedAt = new Date();
    if (status === 'out_for_delivery') update.outForDeliveryAt = new Date();
    if (status === 'delivered') update.deliveredAt = new Date();
    if (status === 'cancelled') update.cancelledAt = new Date();
    console.log('Updating order', req.params.id, 'with', update); // DEBUG
    const order = await Order.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!order) {
      console.error('Order not found for id', req.params.id); // DEBUG
      return res.status(404).json({ error: 'Order not found' });
    }
    await logAdminAction({ req, action: `Updated order status: ${order._id} to ${status}` });
    // Send status update email and push notification to customer and admins
    if (['shipped', 'delivered', 'cancelled', 'out_for_delivery'].includes(status)) {
      let emailSubject = `Your JC's Closet Order is now ${status.charAt(0).toUpperCase() + status.slice(1)}`;
      let emailHtml = orderStatusUpdateTemplate(order, status);
      if (status === 'out_for_delivery') {
        emailSubject = `Your JC's Closet Order is Out for Delivery!`;
      }
      sendOrderEmail({
        to: order.customer.email,
        subject: emailSubject,
        html: emailHtml
      })
        .then(() => console.log(`Status email sent to ${order.customer.email} for order ${order._id}`))
        .catch((err) => console.error('Failed to send status email:', err));

      // Send push notification to user only
      try {
        const { Subscription } = require('./push');
        const webpush = require('web-push');
        const userSubs = await Subscription.find({ user: order.user });
        let notifTitle = `Order ${status.charAt(0).toUpperCase() + status.slice(1)}`;
        let notifBody = `Your order #${order._id.toString().slice(-6).toUpperCase()} is now ${status}.`;
        if (status === 'out_for_delivery') {
          notifTitle = 'Order Out for Delivery!';
          notifBody = `Your order #${order._id.toString().slice(-6).toUpperCase()} is out for delivery. Expect it soon!`;
        }
        const userPayload = JSON.stringify({
          title: notifTitle,
          body: notifBody,
          url: `/orders`
        });
        for (const sub of userSubs) {
          try {
            await webpush.sendNotification(sub, userPayload);
          } catch (err) {
            console.error('[Push] Failed to send to user', sub.endpoint, err.message);
          }
        }
      } catch (pushErr) {
        console.error('Failed to send push notification:', pushErr);
      }
    }
    res.json(order);
  } catch (err) {
    console.error('Order status update error:', err); // DEBUG
    res.status(500).json({ error: 'Failed to update order', details: err.message });
  }
});

// Delete order (admin)
router.delete('/:id', auth, requireAdmin, async (req, res) => {
  try {
    const order = await Order.findByIdAndDelete(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    await logAdminAction({ req, action: `Deleted order: ${order._id}` });
    res.json({ message: 'Order deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete order' });
  }
});

// Suggestions endpoint for admin order search
router.get('/suggestions', auth, requireAdmin, async (req, res) => {
  try {
    const { query } = req.query;
    if (!query || !query.trim()) return res.json([]);
    const q = query.trim();
    // Find matching emails and states
    const emailMatches = await Order.find({ 'customer.email': { $regex: q, $options: 'i' } }).distinct('customer.email');
    const stateMatches = await Order.find({ 'customer.state': { $regex: q, $options: 'i' } }).distinct('customer.state');
    // Combine and dedupe
    const suggestions = Array.from(new Set([...emailMatches, ...stateMatches])).slice(0, 10);
    res.json(suggestions);
  } catch (err) {
    res.status(500).json([]);
  }
});

// Get all unique states for dropdown
router.get('/states', auth, requireAdmin, async (req, res) => {
  try {
    const states = await Order.distinct('customer.state');
    res.json(states.filter(Boolean).sort());
  } catch (err) {
    res.status(500).json([]);
  }
});

// Get orders for the logged-in user
router.get('/my', auth, async (req, res) => {
  try {
    const userEmail = req.user.email;
    if (!userEmail) return res.status(400).json({ error: 'User email not found in token' });
    const orders = await Order.find({ 'customer.email': userEmail }).sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch your orders' });
  }
});

// User can cancel their own order
router.patch('/:id/cancel', auth, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    // Only allow if the order belongs to the user and is not delivered/cancelled
    if (order.customer.email !== req.user.email) {
      return res.status(403).json({ error: 'You can only cancel your own order' });
    }
    if (order.status === 'delivered' || order.status === 'cancelled') {
      return res.status(400).json({ error: 'Order cannot be cancelled' });
    }
    order.status = 'cancelled';
    order.cancelledAt = new Date();
    await order.save();
    // Send email notification to user and admin
    try {
      sendOrderEmail({
        to: order.customer.email,
        subject: "Your JC's Closet Order has been Cancelled",
        html: orderStatusUpdateTemplate(order, 'cancelled')
      }).catch(() => {});
      if (process.env.ADMIN_EMAIL) {
        sendOrderEmail({
          to: process.env.ADMIN_EMAIL,
          subject: 'Order Cancelled by Customer',
          html: orderAdminCancelTemplate(order)
        }).catch(() => {});
      }
    } catch (e) { /* ignore email errors */ }
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: 'Failed to cancel order' });
  }
});

module.exports = router;
