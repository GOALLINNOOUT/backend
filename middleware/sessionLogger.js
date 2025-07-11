const { v4: uuidv4 } = require('uuid');

// Middleware to log session start only, using x-session-id header (SPA style)
// Usage: app.use(sessionLogger);
module.exports = async function sessionLogger(req, res, next) {
  try {
    // Only log for HTML page requests (not static or API)
    if (req.method !== 'GET' || req.path.startsWith('/api') || req.path.match(/\.(js|css|png|jpg|jpeg|svg|webp|ico)$/i)) {
      return next();
    }
    // Only attach sessionId to response if present, do not create session
    let sessionId = req.headers['x-session-id'];
    if (sessionId) {
      res.setHeader && res.setHeader('x-session-id', sessionId);
      console.log(`[sessionLogger] Existing sessionId: ${sessionId}`);
    }
    // No session creation here; handled by /session/start endpoint
  } catch (err) {
    // Don't block request on logging error
    console.error('SessionLog error:', err);
  }
  next();
};
