const express = require('express');
const router = express.Router();
const SessionLog = require('../models/SessionLog');
const { v4: uuidv4 } = require('uuid');

// Start a session (create SessionLog)
router.post('/start', async (req, res) => {
  try {
    const user = req.user?._id || null;
    const device = req.headers['user-agent'] || 'Unknown';
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    // Check for existing active session for this device/ip in the last 2 minutes
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
    const existingSession = await SessionLog.findOne({
      user: user || null,
      ip,
      device,
      endTime: { $exists: false },
      startTime: { $gte: twoMinutesAgo }
    });
    if (existingSession) {
      console.log(`[session/start] Returning existing SessionLog for sessionId: ${existingSession.sessionId}`);
      return res.json({ success: true, sessionId: existingSession.sessionId });
    }
    const sessionId = uuidv4();
    await SessionLog.create({ sessionId, user, ip, device, startTime: new Date() });
    console.log(`[session/start] Created new SessionLog for sessionId: ${sessionId}`);
    res.json({ success: true, sessionId });
  } catch (err) {
    console.error('[session/start] Error starting session:', err);
    res.status(500).json({ error: 'Failed to start session' });
  }
});

// End a session (set endTime)
router.post('/end', async (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) {
    console.log('[session/end] No sessionId provided');
    return res.status(400).json({ error: 'No sessionId' });
  }
  try {
    const result = await SessionLog.findOneAndUpdate(
      { sessionId, endTime: { $exists: false } },
      { endTime: new Date() },
      { new: true }
    );
    if (!result) {
      console.log(`[session/end] No active session found for sessionId: ${sessionId}`);
    } else {
      console.log(`[session/end] Session ended for sessionId: ${sessionId}`);
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[session/end] Error ending session:', err);
    res.status(500).json({ error: 'Failed to end session' });
  }
});

module.exports = router;
