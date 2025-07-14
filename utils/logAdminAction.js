// server/utils/logAdminAction.js
const UAParser = require('ua-parser-js');
const SecurityLog = require('../models/SecurityLog');

function getDeviceInfo(req) {
  const parser = new UAParser();
  parser.setUA(req.headers['user-agent'] || '');
  const ua = parser.getResult();
  return [
    ua.device.type || 'desktop',
    ua.os.name ? `${ua.os.name} ${ua.os.version || ''}`.trim() : '',
    ua.browser.name ? `${ua.browser.name} ${ua.browser.version || ''}`.trim() : ''
  ].filter(Boolean).join(' | ');
}

async function logAdminAction({ req, action }) {
  try {
    if (!req.user || !req.user._id) {
      console.warn('SecurityLog skipped: req.user or req.user._id missing');
      return;
    }
    await SecurityLog.create({
      admin: req.user._id,
      action,
      ip: req.ip,
      device: getDeviceInfo(req)
    });
  } catch (err) {
    console.error('SecurityLog error:', err);
  }
}

module.exports = { logAdminAction, getDeviceInfo };
