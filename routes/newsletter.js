const express = require('express');
const router = express.Router();
const Subscriber = require('../models/Subscriber');
const nodemailer = require('nodemailer');
const { logAdminAction } = require('../utils/logAdminAction');

// Configure nodemailer transporter (use your SMTP credentials in .env)
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

router.post('/subscribe', async (req, res) => {
  const { email } = req.body;
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ message: 'Invalid email address.' });
  }
  try {
    // Check for duplicate
    let existing = await Subscriber.findOne({ email });
    if (existing) {
      return res.status(409).json({ message: 'You are already subscribed.' });
    }
    // Save to DB
    await Subscriber.create({ email });
    // Send confirmation email
    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: email,
      subject: "Welcome to JC's Closet Newsletter!",
      html: `
        <div style="max-width:500px;margin:0 auto;background:#fff;border-radius:10px;box-shadow:0 2px 8px #eee;padding:32px 24px;font-family:'Segoe UI',Arial,sans-serif;">
          <div style="text-align:center;margin-bottom:24px;">
            <img src="https://i.ibb.co/6bQw6yT/jcscloset-logo.png" alt="JC's Closet Logo" style="height:60px;margin-bottom:12px;"/>
            <h1 style="color:#b76e79;margin:0;font-size:2rem;">JC's Closet</h1>
          </div>
          <h2 style="color:#333;margin-top:0;">Thank you for subscribing!</h2>
          <p style="font-size:1.1rem;color:#444;">Welcome to the JC's Closet family! 🎉</p>
          <p style="color:#555;">You will now receive <b>exclusive offers</b>, <b>fashion tips</b>, and the latest updates straight to your inbox.</p>
          <div style="margin:24px 0;text-align:center;">
            <a href="https://www.instagram.com/jcsclosetng/" style="display:inline-block;background:#b76e79;color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:600;">Follow us on Instagram</a>
          </div>
          <hr style="border:none;border-top:1px solid #eee;margin:32px 0;"/>
          <p style="font-size:0.95rem;color:#888;text-align:center;">If you did not subscribe, please ignore this email.<br>JC's Closet &copy; 2025</p>
        </div>
      `
    });
    return res.json({ message: 'Subscription successful! Please check your email.' });
  } catch (err) {
    console.error('Newsletter subscribe error:', err);
    return res.status(500).json({ message: 'Server error. Please try again later.' });
  }
});

// GET /api/newsletter/subscribers - List all subscribers (admin)
router.get('/subscribers', async (req, res) => {
  try {
    const subscribers = await Subscriber.find({}, 'email subscribedAt');
    res.json(subscribers);
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
});

// DELETE /api/newsletter/subscribers/:id - Delete a subscriber (admin)
router.delete('/subscribers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Subscriber.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ message: 'Subscriber not found.' });
    await logAdminAction({ req, action: `Deleted newsletter subscriber: ${deleted.email}` });
    res.json({ message: 'Subscriber deleted.' });
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
});

// POST /api/newsletter/notify - Send notification to all or selected subscribers (admin)
router.post('/notify', async (req, res) => {
  const { subject, message, subscriberIds } = req.body;
  if (!subject || !message) {
    return res.status(400).json({ message: 'Subject and message are required.' });
  }
  try {
    let recipients;
    if (Array.isArray(subscriberIds) && subscriberIds.length > 0) {
      recipients = await Subscriber.find({ _id: { $in: subscriberIds } });
    } else {
      recipients = await Subscriber.find();
    }
    if (!recipients.length) return res.status(404).json({ message: 'No subscribers found.' });
    // Branded, responsive HTML email template
    const brandTemplate = (content) => `
      <div style="background:#f7f6fa;padding:0;margin:0;width:100%;font-family:'Segoe UI',Arial,sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:32px auto;background:#fff;border-radius:12px;box-shadow:0 2px 12px #e5e5e5;overflow:hidden;">
          <tr>
            <td style="background:#b76e79;padding:32px 0;text-align:center;">
              <img src="https://i.ibb.co/6bQw6yT/jcscloset-logo.png" alt="JC's Closet Logo" style="height:60px;margin-bottom:10px;display:block;margin-left:auto;margin-right:auto;"/>
              <h1 style="color:#fff;margin:0;font-size:2.1rem;letter-spacing:1.5px;font-family:'Montserrat',Arial,sans-serif;">JC's Closet</h1>
              <p style="color:#fff;font-size:1.1rem;margin:0;">Perfume & Fashion Store</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 24px 24px 24px;">
              <div style="font-size:1.08rem;color:#333;line-height:1.7;">
                ${content}
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:0 24px 32px 24px;">
              <div style="margin-top:32px;text-align:center;">
                <a href="https://www.instagram.com/jcsclosetng/" style="display:inline-block;background:#b76e79;color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:600;font-size:1rem;">Follow us on Instagram</a>
              </div>
              <hr style="border:none;border-top:1px solid #eee;margin:32px 0;"/>
              <p style="font-size:0.95rem;color:#888;text-align:center;">JC's Closet &copy; 2025<br>Perfume & Fashion Boutique<br><a href='https://jccloset.vercel.app' style='color:#b76e79;text-decoration:none;'>jccloset.vercel.app</a></p>
            </td>
          </tr>
        </table>
      </div>
    `;
    // Send email to each recipient
    await Promise.all(recipients.map(sub =>
      transporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: sub.email,
        subject,
        html: brandTemplate(message)
      })
    ));
    await logAdminAction({ req, action: `Sent newsletter to ${recipients.length} subscribers` });
    res.json({ message: 'Notification sent.' });
  } catch (err) {
    console.error('Newsletter notify error:', err);
    res.status(500).json({ message: 'Server error. Could not send notification.' });
  }
});

module.exports = router;
