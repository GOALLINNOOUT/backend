const express = require('express');
const router = express.Router();
const CustomLookRequest = require('../models/CustomLookRequest');
const nodemailer = require('nodemailer');
const auth = require('../middleware/auth');

// Helper: isAdmin middleware
const isAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') return next();
  return res.status(403).json({ message: 'Admin access required.' });
};

// Email transporter setup (configure with your SMTP or use environment variables)
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// @route   POST /api/custom-look-request
// @desc    Submit a custom look request
// @access  Public
router.post('/', async (req, res) => {
  try {
    const { name, email, phone, notes, designTitle, designId } = req.body;
    if (!name || !email) {
      return res.status(400).json({ message: 'Name and email are required.' });
    }
    const request = new CustomLookRequest({
      name,
      email,
      phone,
      notes,
      designTitle,
      designId
    });
    await request.save();

    // Send notification email to admin
    if (process.env.ADMIN_EMAIL) {
      await transporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: process.env.ADMIN_EMAIL,
        subject: `New Custom Look Request from ${name} | JC's Closet`,
        text: `A new custom look request has been submitted.\n\nName: ${name}\nEmail: ${email}\nPhone: ${phone || '-'}\nDesign: ${designTitle || '-'}\nNotes: ${notes || '-'}\n`,
        html: `<!DOCTYPE html>
<html lang=\"en\">
<head>
  <meta charset=\"UTF-8\">
  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">
  <title>New Custom Look Request | JC's Closet</title>
  <style>
    body { background: #f8fafc; margin: 0; font-family: 'Segoe UI', Arial, sans-serif; color: #222; }
    .container { max-width: 520px; margin: 32px auto; background: #fff; border-radius: 16px; box-shadow: 0 4px 32px #e0e7ef55; padding: 32px 24px; }
    .brand { text-align: center; margin-bottom: 24px; }
    .brand-logo { width: 64px; height: 64px; border-radius: 50%; object-fit: cover; box-shadow: 0 2px 8px #e0e7ef88; }
    .brand-title { font-size: 2rem; font-weight: 700; color: #1976d2; margin: 8px 0 0 0; letter-spacing: 1px; }
    .section-title { font-size: 1.2rem; font-weight: 600; color: #222; margin-bottom: 12px; }
    .info-list { list-style: none; padding: 0; margin: 0 0 16px 0; }
    .info-list li { margin-bottom: 10px; font-size: 1rem; }
    .label { font-weight: 600; color: #1976d2; min-width: 90px; display: inline-block; }
    .footer { margin-top: 32px; text-align: center; color: #888; font-size: 0.95rem; }
    @media (max-width: 600px) {
      .container { padding: 18px 4vw; }
      .brand-title { font-size: 1.3rem; }
    }
  </style>
</head>
<body>
  <div class=\"container\">
    <div class=\"brand\">
      <img src=\"https://jccloset.vercel.app/WhatsApp%20Image%202025-06-30%20at%2014.59.32_f1f86020.jpg\" alt=\"JC's Closet Logo\" class=\"brand-logo\" onerror=\"this.style.display='none'\" />
      <div class=\"brand-title\">JC's Closet</div>
    </div>
    <div class=\"section-title\">New Custom Look Request</div>
    <ul class=\"info-list\">
      <li><span class=\"label\">Name:</span> ${name}</li>
      <li><span class=\"label\">Email:</span> <a href=\"mailto:${email}\" style=\"color:#1976d2;text-decoration:none;\">${email}</a></li>
      <li><span class=\"label\">Phone:</span> <a href=\"tel:${phone}\" style=\"color:#1976d2;text-decoration:none;\">${phone || '-'}</a></li>
      <li><span class=\"label\">Design:</span> ${designTitle || '-'}</li>
      <li><span class=\"label\">Notes:</span> ${notes || '-'}</li>
    </ul>
    <div class=\"footer\">
      This notification was sent by JC's Closet. <br />
      <a href=\"https://jccloset.vercel.app\" style=\"color:#1976d2;text-decoration:none;\">jccloset.vercel.app</a>
    </div>
  </div>
</body>
</html>`
      });
    }

    res.status(201).json({ message: 'Request submitted successfully.' });
  } catch (err) {
    res.status(500).json({ message: 'Server error. Please try again.' });
  }
});

// @route   GET /api/custom-look-request
// @desc    Get all custom look requests (admin only)
// @access  Private/Admin
router.get('/', auth, isAdmin, async (req, res) => {
  try {
    const requests = await CustomLookRequest.find().sort({ createdAt: -1 });
    res.json(requests);
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
