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
      return res.status(400).json({ error: 'All fields are required.' });
    }
    const appointment = new Appointment({ name, email, service, datetime });
    await appointment.save();
    // Send emails to user and admin
    try {
      await sendAppointmentEmails({ name, email, service, datetime });
      // Send notification to user (if registered)
      if (req.user && req.user._id) {
        await sendNotification({
          userId: req.user._id,
          message: `Your appointment for ${service} on ${datetime} was received.`,
          type: 'info'
        });
      }
      // Notify all admins
      await notifyAdmins({
        message: `New appointment request from ${name} (${email}) for ${service} on ${datetime}.`,
        type: 'system'
      });
    } catch (mailErr) {
      // Log but don't fail the request if email fails
      console.error('Email error:', mailErr);
    }
    res.status(201).json({ message: 'Appointment request received.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
