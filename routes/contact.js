const express = require('express');
const router = express.Router();
const Contact = require('../models/Contact');
const mailer = require('../utils/mailer');

// POST /api/contact
router.post('/', async (req, res) => {
  const { name, email, message } = req.body;
  if (!name || !email || !message) {
    return res.status(400).json({ error: 'All fields are required.' });
  }
  try {
    // Save to DB
    const contact = await Contact.create({ name, email, message });

    // Send mail to admin
    await mailer.sendMail({
      to: 'adeyekunadelola0@gmail.com',
      subject: `New Contact Message from ${name}`,
      html: `
        <div style="max-width:600px;margin:auto;background:#fff;border-radius:8px;box-shadow:0 2px 8px #eee;font-family:sans-serif;padding:24px;">
          <h2 style="color:#6c63ff;margin-bottom:8px;">New Contact Message</h2>
          <p style="font-size:16px;margin:0 0 16px 0;">You have received a new message from the contact form:</p>
          <div style="background:#f7f7fa;padding:16px 12px;border-radius:6px;margin-bottom:16px;">
            <strong>Name:</strong> <span>${name}</span><br/>
            <strong>Email:</strong> <span>${email}</span><br/>
            <strong>Message:</strong>
            <div style="margin-top:8px;padding:12px;background:#fffbe6;border-radius:4px;font-size:15px;">${message.replace(/\n/g, '<br/>')}</div>
          </div>
          <footer style="font-size:13px;color:#888;text-align:center;margin-top:24px;">JC's Closet &copy; ${new Date().getFullYear()}</footer>
        </div>
        <style>@media (max-width:600px){div[style*='max-width:600px']{padding:12px !important;}}</style>
      `,
    });

    // Send mail to user
    await mailer.sendMail({
      to: email,
      subject: "Thank you for contacting JC's Closet",
      html: `
        <div style="max-width:600px;margin:auto;background:#fff;border-radius:8px;box-shadow:0 2px 8px #eee;font-family:sans-serif;padding:24px;">
          <div style="text-align:center;margin-bottom:16px;">
            <img src='https://jcscloset.com/logo.png' alt="JC's Closet Logo" style="width:60px;height:60px;border-radius:50%;background:#f7f7fa;object-fit:cover;" onerror="this.style.display='none'"/>
          </div>
          <h2 style="color:#6c63ff;margin-bottom:8px;">Thank You, ${name}!</h2>
          <p style="font-size:16px;margin:0 0 16px 0;">We have received your message and will get back to you soon.</p>
          <div style="background:#f7f7fa;padding:16px 12px;border-radius:6px;margin-bottom:16px;">
            <strong>Your Message:</strong>
            <div style="margin-top:8px;padding:12px;background:#fffbe6;border-radius:4px;font-size:15px;">${message.replace(/\n/g, '<br/>')}</div>
          </div>
          <p style="font-size:15px;margin:16px 0 0 0;">Best regards,<br/>JC's Closet Team</p>
          <footer style="font-size:13px;color:#888;text-align:center;margin-top:24px;">JC's Closet &copy; ${new Date().getFullYear()}</footer>
        </div>
        <style>@media (max-width:600px){div[style*='max-width:600px']{padding:12px !important;}}</style>
      `,
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to process your request.' });
  }
});

module.exports = router;
