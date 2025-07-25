
const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const requireAdmin = require('../middleware/requireAdmin');
const auth = require('../middleware/auth');


router.get('/sales', auth, requireAdmin, analyticsController.getSalesAnalytics);

// Color mode analytics (update color mode for session)
router.post('/color-mode', analyticsController.postColorMode);
router.get('/products', auth, requireAdmin, analyticsController.getProductPerformance);
router.get('/customers', auth, requireAdmin, analyticsController.getCustomerBehavior);
router.get('/traffic', auth, requireAdmin, analyticsController.getTrafficEngagement);
router.get('/orders', auth, requireAdmin, analyticsController.getOrdersOverview);
router.get('/marketing', auth, requireAdmin, analyticsController.getMarketingPerformance);
// User Flow / Path Analysis
router.get('/userflow', auth, requireAdmin, analyticsController.getUserFlow);
// New: Visits per page (not unique IP)
router.get('/page-visits-trend', auth, requireAdmin, analyticsController.getPageVisitsTrend);
// Funnel and Cart Analytics
router.get('/funnel', auth, requireAdmin, analyticsController.getFunnelAnalytics);
// Live Visitors Trend (last N minutes)
router.get('/live-visitors-trend', auth, requireAdmin, analyticsController.getLiveVisitorsTrend);
module.exports = router;
// Web Vitals (Site Speed & Performance)
router.post('/web-vitals', analyticsController.postWebVitals);
router.get('/web-vitals', analyticsController.getWebVitals);
// Error Boundary Analytics
router.post('/log-error', analyticsController.logErrorEvent);
router.get('/errors', auth, requireAdmin, analyticsController.getErrorEvents);