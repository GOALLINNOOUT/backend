const PageViewLog = require('../models/PageViewLog');
const SessionLog = require('../models/SessionLog');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');

// Middleware to log each page view
// Usage: app.use(pageViewLogger);
module.exports = function pageViewLogger(req, res, next) {
  try {
    if (!req.path) return next();
    if (
      req.method !== 'GET' ||
      req.path.startsWith('/api') ||
      req.path.match(/\.(js|css|png|jpg|jpeg|svg|webp|ico)$/i)
    ) {
      return next();
    }
    let sessionId = req.cookies?.sessionId || req.headers['x-session-id'];
    if (!sessionId) {
      sessionId = uuidv4();
      res.cookie && res.cookie('sessionId', sessionId, { httpOnly: true, maxAge: 1000 * 60 * 60 * 24 * 7 });
    }
    // Validate session: must exist and not be ended
    SessionLog.findOne({ sessionId })
      .then(session => {
        if (!session || session.endTime) {
          // Session is invalid or ended; respond with session expired
          return res.status(440).json({ error: 'Session expired' });
        }
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
              console.log('[PageViewLogger] Decoded JWT:', decoded); // DEBUG
            } catch (err) {
              console.log('[PageViewLogger] JWT decode error:', err); // DEBUG
            }
          } else {
            console.log('[PageViewLogger] No token found in Authorization header'); // DEBUG
          }
        }
        const device = req.headers['user-agent'] || 'Unknown';
        const ip = req.ip;
        console.log('[PageViewLogger] Logging page view:', { sessionId, user, email, ip, device, page: req.path }); // DEBUG
        return PageViewLog.create({
          sessionId,
          user,
          email,
          ip,
          device,
          userAgent: device,
          page: req.path
        })
          .then(() => SessionLog.findOneAndUpdate(
            { sessionId },
            { $set: { lastActivity: new Date() } }
          ))
          .then(() => next())
          .catch(err => {
            console.error('PageViewLog error:', err);
            next();
          });
      })
      .catch(err => {
        console.error('SessionLog error:', err);
        next();
      });
  } catch (err) {
    console.error('PageViewLog error:', err);
    next();
  }
};

