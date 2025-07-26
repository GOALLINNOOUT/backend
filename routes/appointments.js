const express = require('express');
const router = express.Router();
const Appointment = require('../models/Appointment');
const { sendAppointmentEmails } = require('../utils/mailer');
const { sendNotification, notifyAdmins } = require('../utils/notificationUtil');
const auth = require('../middleware/auth');

// Optional auth middleware: sets req.user if token is valid, else continues as guest
function optionalAuth(req, res, next) {
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    return auth(req, res, next);
  }
  next();
}

// POST /api/appointments (token optional for guest or user)
router.post('/', optionalAuth, async (req, res) => {
  try {
    const { name, email, service, datetime } = req.body;
    if (!name || !email || !service || !datetime) {
      return res.status(400).json({ error: 'Please fill in all required fields to book your appointment.' });
    }
    const appointment = new Appointment({ name, email, service, datetime });
    await appointment.save();
    // Send emails to user and admin
    try {
      await sendAppointmentEmails({ name, email, service, datetime });
    } catch (mailErr) {
      // Log but don't fail the request if email fails
      console.error('Email error:', mailErr);
    }
    // Format datetime for user-friendly display
    const formattedDate = new Date(datetime).toLocaleString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true
    });
    // Send notification to user (if registered)
    if (req.user && req.user._id) {
      await sendNotification({
        userId: req.user._id,
        message: `Your appointment for ${service} on ${formattedDate} was received.`,
        type: 'info'
      });
    }
    // Notify all admins
    await notifyAdmins({
      message: `New appointment request from ${name} (${email}) for ${service} on ${formattedDate}.`,
      type: 'system'
    });
    // Send push notification to all admins
    try {
      const { sendPushToUserAndAdmins } = require('./push');
      const User = require('../models/User');
      const admins = await User.find({ role: 'admin' });
      const notifMsgAdmin = `New appointment request from ${name} (${email}) for ${service} on ${formattedDate}.`;
      for (const admin of admins) {
        await sendPushToUserAndAdmins(admin._id, {
          title: 'New Appointment',
          body: notifMsgAdmin,
          url: '/notifications'
        });
      }
    } catch (e) {
      console.error('Failed to send push notification to admins:', e);
    }
    // Success response
    return res.status(201).json({ message: 'Appointment request received.' });
  } catch (err) {
    console.error('Appointment booking error:', err);
    return res.status(500).json({ error: 'Oops! We could not process your appointment request. Please try again later.' });
  }
});
