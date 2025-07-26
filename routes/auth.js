const express = require('express');
const router = express.Router();
// Logout: clear JWT cookie
router.post('/logout', (req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    secure: true,
    sameSite: 'None',
  });
  res.json({ success: true });
});
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const mailer = require('../utils/mailer'); // Import mailer utility
const { logAdminAction } = require('../utils/logAdminAction');

// Helper to verify setup token for /setup-password
function verifySetupToken(token) {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return null;
  }
}


// Signup
router.post('/signup', async (req, res) => {
  try {
    const { name, email, password, role } = req.body; // Accept role from client
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already in use' });
    }
    // Only create and save user after all checks succeed
    const user = new User({ name, email, password, role: role || 'user' }); // Save role
    await user.save();
    // Send beautiful welcome email (non-blocking)
    mailer.sendMail({
      to: email,
      subject: "Welcome to JC's Closet!",
      text: `Hi ${name},\n\nThank you for joining JC's Closet! Your style journey starts here.\n\nExplore our latest collections, book a styling session, or shop exclusive perfumes.\n\nWith love,\nJC's Closet Team` ,
      html: `
      <div style="max-width:520px;margin:auto;font-family:'Segoe UI',Arial,sans-serif;background:#fff;border-radius:12px;box-shadow:0 2px 8px #e0e0e0;overflow:hidden;">
        <div style="background:#AFCBFF;padding:32px 0;text-align:center;">
          <img src="https://jccloset.vercel.app/WhatsApp%20Image%202025-06-30%20at%2014.59.32_f1f86020.jpg" alt="JC's Closet Logo" style="height:60px;margin-bottom:10px;" onerror="this.style.display='none'"/>
          <h1 style="color:#222;margin:0;font-size:2rem;letter-spacing:1px;">Welcome to JC's Closet!</h1>
        </div>
        <div style="padding:32px 28px 24px 28px;">
          <p style="font-size:1.1rem;color:#333;">Hi <b>${name}</b>,</p>
          <p style="font-size:1.1rem;color:#333;">Thank you for signing up at <b>JC's Closet</b>! We're thrilled to have you join our fashion-forward community.</p>
          <p style="color:#444;">Start exploring our <a href="https://jccloset.vercel.app/fashion" style="color:#AFCBFF;text-decoration:underline;">latest collections</a>, book a <a href="https://jccloset.vercel.app/appointments" style="color:#AFCBFF;text-decoration:underline;">styling session</a>, or discover our exclusive <a href="https://jccloset.vercel.app/perfumes" style="color:#AFCBFF;text-decoration:underline;">perfumes</a>.</p>
          <div style="margin:32px 0;text-align:center;">
            <a href="https://jccloset.vercel.app" style="background:#AFCBFF;color:#fff;padding:12px 32px;border-radius:6px;text-decoration:none;font-weight:600;font-size:1.1rem;box-shadow:0 2px 6px #e0e0e0;">Visit JC's Closet</a>
          </div>
          <p style="font-size:1rem;color:#888;">With love,<br/>JC's Closet Team</p>
        </div>
        <div style="background:#f6f8fa;padding:16px;text-align:center;font-size:0.95rem;color:#aaa;">
          &copy; ${new Date().getFullYear()} JC's Closet. All rights reserved.
        </div>
      </div>
      `
    }).catch(err => {
      console.error('Signup mail error:', err);
    });
    // Include _id as _id in JWT token for compatibility with admin logging
    const token = jwt.sign({ _id: user._id, userId: user._id, role: user.role, name: user.name, email: user.email }, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.cookie('token', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'None',
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    });
    res.status(201).json({ user: { id: user._id, name: user.name, email: user.email, role: user.role } }); // Do not send token in body
  } catch (err) {
    console.error('Signup error:', err); // Improved error logging
    // No user is saved if any error occurs before user.save()
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ error: 'User not found' });
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Incorrect Password' });
    }
    // Check if the user is suspended or blacklisted
    if (user.status === 'suspended' || user.status === 'blacklisted') {
      return res.status(403).json({ error: 'Your account is suspended. Please contact support.' });
    }
    // Log login for all users
    const { getDeviceInfo } = require('../utils/logAdminAction');
    const SecurityLog = require('../models/SecurityLog');
    await SecurityLog.create({
      user: user._id,
      action: 'login',
      ip: req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress,
      device: getDeviceInfo(req),
      createdAt: new Date(),
    });
    // Only log admin login (legacy, can be removed if not needed)
    if (user.role === 'admin') {
      req.user = user; // Ensure req.user is set for logging
      await logAdminAction({ req, action: 'Admin login' });
    }
    // Include _id as _id in JWT token for compatibility with admin logging
    const token = jwt.sign({ _id: user._id, userId: user._id, role: user.role, name: user.name, email: user.email }, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.cookie('token', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'None',
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    });
    res.json({ user: { id: user._id, name: user.name, email: user.email, role: user.role, status: user.status } }); // Do not send token in body
  } catch (err) {
    console.error('Login error:', err); 
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// Forgot Password
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });
    const user = await User.findOne({ email });
    if (!user) {
      // Always respond with success to prevent email enumeration
      return res.json({ message: 'If this email exists, a reset link has been sent.' });
    }
    // Generate token and expiration
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpires = Date.now() + 1000 * 60 * 60; // 1 hour
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = resetTokenExpires;
    await user.save();
    // Send email (placeholder)
    const resetUrl = `${process.env.CLIENT_URL || 'https://jccloset.vercel.app'}/reset-password/${resetToken}`;
    await mailer.sendMail({
      to: user.email,
      subject: "Reset your JC's Closet password",
      html: `
      <div style="max-width:520px;margin:auto;font-family:'Segoe UI',Arial,sans-serif;background:#fff;border-radius:12px;box-shadow:0 2px 8px #e0e0e0;overflow:hidden;">
        <div style="background:#AFCBFF;padding:32px 0;text-align:center;">
          <img src="https://jccloset.vercel.app/WhatsApp%20Image%202025-06-30%20at%2014.59.32_f1f86020.jpg" alt="JC's Closet Logo" style="height:60px;margin-bottom:10px;" onerror="this.style.display='none'"/>
          <h1 style="color:#222;margin:0;font-size:2rem;letter-spacing:1px;">Reset Your Password</h1>
        </div>
        <div style="padding:32px 28px 24px 28px;">
          <p style="font-size:1.1rem;color:#333;">Hi <b>${user.name}</b>,</p>
          <p style="font-size:1.1rem;color:#333;">We received a request to reset your password for your <b>JC's Closet</b> account.</p>
          <p style="color:#444;">To reset your password, please click the button below. This link is valid for 1 hour.</p>
          <div style="margin:32px 0;text-align:center;">
            <a href="${resetUrl}" style="background:#AFCBFF;color:#fff;padding:14px 36px;border-radius:6px;text-decoration:none;font-weight:600;font-size:1.1rem;box-shadow:0 2px 6px #e0e0e0;">Reset Password</a>
          </div>
          <p style="color:#888;font-size:1rem;">If you did not request this, you can safely ignore this email. Your password will remain unchanged.</p>
        </div>
        <div style="background:#f6f8fa;padding:16px;text-align:center;font-size:0.95rem;color:#aaa;">
          &copy; ${new Date().getFullYear()} JC's Closet. All rights reserved.
        </div>
      </div>
      `
    });
    return res.json({ message: 'If this email exists, a reset link has been sent.' });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// Reset Password
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: 'Token and new password are required' });
    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() }
    });
    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired token' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    user.password = password; // Let pre-save hook hash it
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();
    // Optionally send confirmation email here
    res.json({ message: 'Password has been reset successfully.' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});
// POST /auth/setup-password
router.post('/setup-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: 'Token and new password are required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    const payload = verifySetupToken(token);
    if (!payload) return res.status(400).json({ error: 'Invalid or expired token' });
    const user = await User.findOne({ _id: payload._id, email: payload.email });
    if (!user) return res.status(400).json({ error: 'User not found' });
    user.password = password; // Let pre-save hook hash it
    await user.save();
    res.json({ message: 'Password set successfully. You can now log in.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

module.exports = router;
