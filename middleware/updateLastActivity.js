const SessionLog = require('../models/SessionLog');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');

// Middleware to update lastActivity for any backend action (any fetch/API call)
module.exports = async function updateLastActivity(req, res, next) {
  console.log(`[updateLastActivity] middleware called for: ${req.method} ${req.path}`);
  try {
    // Ignore static assets
    if (req.path.match(/\.(js|css|png|jpg|jpeg|svg|webp|ico)$/i)) {
      return next();
    }
    // Get sessionId from cookie or header; do NOT create if missing
    let sessionId = req.cookies?.sessionId || req.headers['x-session-id'];
    if (!sessionId) {
      return next(); // If no sessionId, skip updating lastActivity
    }
    // Log the page action for debugging
    console.log(`[updateLastActivity] ${req.method} ${req.path} | sessionId: ${sessionId}`);
    // Try to get user and email from req.user or JWT token
    let user = req.user?._id || null;
    let email = req.user?.email || undefined;
    if (!email) {
      const authHeader = req.headers['authorization'];
      const token = authHeader && authHeader.split(' ')[1];
      if (token) {
        try {
          const decoded = jwt.verify(token, process.env.JWT_SECRET);
          user = decoded._id || user;
          email = decoded.email || email;
        } catch (err) {
          // Ignore JWT errors
        }
      }
    }
    // Update lastActivity in SessionLog for this session
    await SessionLog.findOneAndUpdate(
      { sessionId },
      { $set: { lastActivity: new Date() } },
      { upsert: true }
    );
  } catch (err) {
    // Don't block request on logging error
    console.error('updateLastActivity error:', err);
  }
  next();
};
