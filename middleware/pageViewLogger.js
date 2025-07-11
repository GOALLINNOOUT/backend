const PageViewLog = require('../models/PageViewLog');
const SessionLog = require('../models/SessionLog');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');

// Middleware to log each page view
// Usage: app.use(pageViewLogger);
module.exports = async function pageViewLogger(req, res, next) {
  try {
    // Only log GET requests for HTML pages (not static assets or API)
    if (req.method !== 'GET' || req.path.startsWith('/api') || req.path.match(/\.(js|css|png|jpg|jpeg|svg|webp|ico)$/i)) {
      return next();
    }
    // Get or create sessionId (from cookie or header, or generate new)
    let sessionId = req.cookies?.sessionId || req.headers['x-session-id'];
    if (!sessionId) {
      sessionId = uuidv4();
      res.cookie && res.cookie('sessionId', sessionId, { httpOnly: true, maxAge: 1000 * 60 * 60 * 24 * 7 });
    }
    // Try to get user and email from req.user or JWT token
    let user = req.user?._id || null;
    let email = req.user?.email || undefined;
    if (!email) {
      // Try to decode JWT from Authorization header
      const authHeader = req.headers['authorization'];
      const token = authHeader && authHeader.split(' ')[1];
      if (token) {
        try {
          const decoded = jwt.verify(token, process.env.JWT_SECRET);
          user = decoded._id || user;
          email = decoded.email || email;
          console.log('[PageViewLogger] Decoded JWT:', decoded); // DEBUG
        } catch (err) {
          console.log('[PageViewLogger] JWT decode error:', err); // DEBUG
        }
      } else {
        console.log('[PageViewLogger] No token found in Authorization header'); // DEBUG
      }
    }
    // Get device info (user-agent)
    const device = req.headers['user-agent'] || 'Unknown';
    // Get IP
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    // Log the page view
    console.log('[PageViewLogger] Logging page view:', { sessionId, user, email, ip, device, page: req.path }); // DEBUG
    await PageViewLog.create({
      sessionId,
      user,
      email, // Log email if available
      ip,
      device,
      page: req.path
    });
    // Update lastActivity in SessionLog for this session
    await SessionLog.findOneAndUpdate(
      { sessionId },
      { $set: { lastActivity: new Date() } }
    );
  } catch (err) {
    // Don't block request on logging error
    console.error('PageViewLog error:', err);
  }
  next();
};

