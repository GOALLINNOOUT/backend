const express = require('express');
const router = express.Router();
const PageViewLog = require('../models/PageViewLog');
const SessionLog = require('../models/SessionLog');
const jwt = require('jsonwebtoken'); // DEBUG: Add JWT for decoding

// POST /api/v1/page-views - Log a page view
router.post('/', async (req, res) => {
  try {
    const { page, referrer, sessionId, ip, userAgent, timestamp } = req.body;
    // Basic validation
    if (!page) return res.status(400).json({ error: 'Page is required' });

    // Validate session: must exist and not be ended
    if (sessionId) {
      const session = await SessionLog.findOne({ sessionId });
      if (!session || session.endTime) {
        return res.status(440).json({ error: 'Session expired' });
      }
    }

    // Use current time if not provided
    let email = req.user?.email || undefined;
    if (!email) {
      const authHeader = req.headers['authorization'];
      const token = authHeader && authHeader.split(' ')[1];
      if (token) {
        try {
          const decoded = jwt.verify(token, process.env.JWT_SECRET);
          email = decoded.email || email;
          console.log('[PageViews API] Decoded JWT:', decoded); // DEBUG
        } catch (err) {
          console.log('[PageViews API] JWT decode error:', err); // DEBUG
        }
      } else {
        console.log('[PageViews API] No token found in Authorization header'); // DEBUG
      }
    }
    console.log('[PageViews API] Logging page view:', { page, referrer, sessionId, ip, userAgent, timestamp, email }); // DEBUG
    const log = new PageViewLog({
      page,
      referrer: referrer || '',
      sessionId: sessionId || null,
      ip: ip || req.ip,
      userAgent: userAgent || req.headers['user-agent'] || '',
      timestamp: timestamp ? new Date(timestamp) : new Date(),
      email // Log email if available
    });
    await log.save();
    // Update lastActivity in SessionLog for this session
    if (sessionId) {
      await SessionLog.findOneAndUpdate(
        { sessionId },
        { $set: { lastActivity: new Date() } }
      );
    }
    res.status(201).json({ message: 'Page view logged' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to log page view' });
  }
});

module.exports = router;
