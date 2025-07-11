const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

function brandMailWrapper(content) {
  return `<!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>JC's Closet Appointment</title>
    <style>
      body { background: #f7f7fa; margin: 0; padding: 0; font-family: 'Segoe UI', Arial, sans-serif; }
      .container { max-width: 480px; margin: 32px auto; background: #fff; border-radius: 12px; box-shadow: 0 2px 16px #0001; padding: 32px 24px; }
      .brand { text-align: center; margin-bottom: 24px; }
      .brand-logo { width: 60px; height: 60px; border-radius: 50%; object-fit: cover; margin-bottom: 8px; }
      .brand-title { font-size: 1.7rem; font-weight: 700; color: #2d2d2d; letter-spacing: 1px; }
      .content { color: #333; font-size: 1.08rem; line-height: 1.7; }
      .cta { display: inline-block; margin: 24px 0 0 0; padding: 12px 28px; background: #222; color: #fff; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 1rem; }
      @media (max-width: 600px) { .container { padding: 18px 4vw; } .brand-title { font-size: 1.2rem; } }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="brand">
        <img src="https://jcscloset.com/logo.png" alt="JC's Closet Logo" class="brand-logo" style="display:block;margin:0 auto 8px auto;" />
        <div class="brand-title">JC's Closet</div>
      </div>
      <div class="content">
        ${content}
      </div>
    </div>
  </body>
  </html>`;
}

async function sendAppointmentEmails({ name, email, service, datetime }) {
  const adminMail = process.env.ADMIN_EMAIL || process.env.SMTP_USER;
  const formattedDate = new Date(datetime).toLocaleString();

  // Email to user
  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: email,
    subject: "Your JC's Closet Appointment Request",
    html: brandMailWrapper(`
      <p>Hi <b>${name}</b>,</p>
      <p>Thank you for booking an appointment for <b>${service}</b> on <b>${formattedDate}</b>.<br>
      We will contact you soon to confirm your session and share more details.</p>
      <p style="margin-top: 18px;">If you have any questions, reply to this email or call <a href="tel:+1234567890" style="color:#222; text-decoration:underline;">+1 (234) 567-890</a>.</p>
      <a class="cta" href="https://jcscloset.com">Visit JC's Closet</a>
      <p style="margin-top: 32px; color: #888; font-size: 0.95em;">Thank you for choosing JC's Closet!</p>
    `),
  });

  // Email to admin
  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: adminMail,
    subject: `New Appointment Request from ${name}`,
    html: brandMailWrapper(`
      <p><b>New appointment request received:</b></p>
      <ul style="padding-left: 1.2em;">
        <li><b>Name:</b> ${name}</li>
        <li><b>Email:</b> <a href="mailto:${email}">${email}</a></li>
        <li><b>Service:</b> ${service}</li>
        <li><b>Date & Time:</b> ${formattedDate}</li>
      </ul>
      <a class="cta" href="mailto:${email}">Reply to Client</a>
    `),
  });
}

async function sendMail({ to, subject, text, html }) {
  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject,
    text,
    html: html ? brandMailWrapper(html) : undefined,
  });
}

module.exports = { sendAppointmentEmails, sendMail };
