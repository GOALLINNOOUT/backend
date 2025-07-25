const mongoose = require('mongoose');

const WebVitalsSchema = new mongoose.Schema({
  name: { type: String, required: true }, // e.g. LCP, FID, CLS, INP, TTFB, FCP
  value: { type: Number, required: true },
  delta: Number,
  id: String, // web-vitals id
  navigationType: String,
  page: String, // window.location.pathname
  url: String, // window.location.href
  userAgent: String,
  sessionId: String,
  userId: String,
  timestamp: { type: Date, default: Date.now },
  // Add more fields as needed (device, referrer, etc.)
});

module.exports = mongoose.model('WebVitals', WebVitalsSchema);
