const Notification = require('../models/Notification');
const User = require('../models/User');

/**
 * Send notification to a user
 * @param {ObjectId|String} userId - User ID
 * @param {String} message - Notification message
 * @param {String} type - Notification type (system, info, order, etc)
 */
async function sendNotification({ userId, message, type = 'system' }) {
  if (!userId || !message) return;
  await Notification.create({ user: userId, message, type });
}

/**
 * Send notification to all admins
 */
async function notifyAdmins({ message, type = 'system' }) {
  const admins = await User.find({ role: 'admin' }, '_id');
  for (const admin of admins) {
    await Notification.create({ user: admin._id, message, type });
  }
}

module.exports = { sendNotification, notifyAdmins };
