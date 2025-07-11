// sessionCleanup.js
// This script marks sessions as ended if they have been inactive for more than 30 minutes.

require('dotenv').config();
const mongoose = require('mongoose');
const SessionLog = require('./models/SessionLog');
const PageViewLog = require('./models/PageViewLog');
const cron = require('node-cron');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/jcscloset';
const INACTIVITY_MINUTES = 10;

async function cleanupSessions() {
  try {
    const cutoff = new Date(Date.now() - INACTIVITY_MINUTES * 60 * 1000);
    // Efficiently end sessions where lastActivity (or startTime fallback) is older than cutoff
    const result = await SessionLog.updateMany(
      {
        endTime: { $exists: false },
        $or: [
          { lastActivity: { $lte: cutoff } },
          { lastActivity: { $exists: false }, startTime: { $lte: cutoff } }
        ]
      },
      { $set: { endTime: new Date() } }
    );
    if (result.modifiedCount > 0) {
      console.log(`[sessionCleanup] Marked ${result.modifiedCount} sessions as ended (inactive > ${INACTIVITY_MINUTES} min)`);
    }
  } catch (err) {
    console.error('[sessionCleanup] Error:', err);
  }
}

async function main() {
  await mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  console.log('Connected to MongoDB for session cleanup');
  // Run immediately, then every 5 minutes
  await cleanupSessions();
  cron.schedule('*/5 * * * *', cleanupSessions);
}

main();
