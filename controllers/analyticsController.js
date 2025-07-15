const Order = require('../models/Order');
const Perfume = require('../models/Perfume');
const User = require('../models/User');
const mongoose = require('mongoose');
const SecurityLog = require('../models/SecurityLog');
const SessionLog = require('../models/SessionLog');
const PageViewLog = require('../models/PageViewLog');
const CartActionLog = require('../models/CartActionLog');
const CheckoutEventLog = require('../models/CheckoutEventLog');

// Helper to get date filter from query
function getDateFilter(query, field = 'createdAt') {
  let { startDate, endDate } = query;
  if (startDate && endDate) {
    return { [field]: { $gte: new Date(startDate), $lte: new Date(endDate) } };
  } else {
    const start = new Date();
    start.setDate(start.getDate() - 29);
    return { [field]: { $gte: start } };
  }
}

// Analytics Controller: Handles all business logic for admin analytics endpoints
// Each function should aggregate and return relevant analytics data

exports.getSalesAnalytics = async (req, res) => {
  try {
    // Exclude admin users from analytics
    const adminUsers = await User.find({ role: 'admin' }, '_id email');
    const adminUserIds = adminUsers.map(u => u._id.toString());
    const adminEmails = adminUsers.map(u => u.email);
    const matchPaid = { status: { $in: ['paid', 'shipped', 'delivered'] } };
    const dateFilter = getDateFilter(req.query);
    // Total sales (number of orders)
    const totalSales = await Order.countDocuments({ ...matchPaid, ...dateFilter, 'customer._id': { $nin: adminUserIds }, 'customer.email': { $nin: adminEmails } });
    // Total revenue (sum of grandTotal)
    const totalRevenueAgg = await Order.aggregate([
      { $match: { ...matchPaid, ...dateFilter, 'customer._id': { $nin: adminUserIds }, 'customer.email': { $nin: adminEmails } } },
      { $group: { _id: null, total: { $sum: '$grandTotal' } } }
    ]);
    const totalRevenue = totalRevenueAgg[0]?.total || 0;
    // Average Order Value
    const avgOrderValue = totalSales > 0 ? totalRevenue / totalSales : 0;
    // Return rate (cancelled orders / total orders)
    const totalOrders = await Order.countDocuments({ ...dateFilter, 'customer._id': { $nin: adminUserIds }, 'customer.email': { $nin: adminEmails } });
    const returnedOrders = await Order.countDocuments({ status: 'cancelled', ...dateFilter, 'customer._id': { $nin: adminUserIds }, 'customer.email': { $nin: adminEmails } });
    const returnRate = totalOrders > 0 ? ((returnedOrders / totalOrders) * 100).toFixed(2) : 0;
    // Revenue trends (by day)
    const revenueTrends = await Order.aggregate([
      { $match: { ...matchPaid, ...dateFilter, 'customer._id': { $nin: adminUserIds }, 'customer.email': { $nin: adminEmails } } },
      { $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        revenue: { $sum: '$grandTotal' },
        orders: { $sum: 1 }
      }},
      { $sort: { _id: 1 } }
    ]);
    // Fill missing days
    const trendsMap = {};
    revenueTrends.forEach(rt => { trendsMap[rt._id] = rt; });
    // Get date range
    let start = new Date(req.query.startDate || (new Date(Date.now() - 29 * 24 * 60 * 60 * 1000)).toISOString().slice(0,10));
    let end = new Date(req.query.endDate || (new Date()).toISOString().slice(0,10));
    const trends = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const key = d.toISOString().slice(0, 10);
      trends.push({
        date: key,
        revenue: trendsMap[key]?.revenue || 0,
        orders: trendsMap[key]?.orders || 0
      });
    }
    // Top performing days
    const topDays = [...trends].sort((a, b) => b.revenue - a.revenue).slice(0, 10).map(d => ({ date: d.date, revenue: d.revenue, orders: d.orders }));
    res.json({
      totalSales,
      totalRevenue,
      avgOrderValue,
      returnRate,
      revenueTrends: trends,
      topDays
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch sales analytics' });
  }
};

exports.getProductPerformance = async (req, res) => {
  try {
    // Exclude admin users from analytics
    const adminUsers = await User.find({ role: 'admin' }, '_id email');
    const adminUserIds = adminUsers.map(u => u._id.toString());
    const adminEmails = adminUsers.map(u => u.email);
    const matchPaid = { status: { $in: ['paid', 'shipped', 'delivered'] } };
    const dateFilter = getDateFilter(req.query);
    const orders = await Order.find({ ...matchPaid, ...dateFilter, 'customer._id': { $nin: adminUserIds }, 'customer.email': { $nin: adminEmails } }).lean();

    // Map product sales and views
    const productStats = {};
    orders.forEach(order => {
      (order.cart || []).forEach(item => {
        if (!productStats[item._id]) {
          productStats[item._id] = {
            _id: item._id,
            name: item.name,
            quantity: 0,
            revenue: 0,
            views: 0, // Will be updated below
            stock: null,
          };
        }
        productStats[item._id].quantity += item.quantity || 1;
        productStats[item._id].revenue += (item.price || 0) * (item.quantity || 1);
      });
    });

    // Get all perfumes for stock and views
    const perfumes = await Perfume.find({}).lean();
    perfumes.forEach(p => {
      if (!productStats[p._id]) {
        productStats[p._id] = {
          _id: p._id.toString(),
          name: p.name,
          quantity: 0,
          revenue: 0,
          views: p.views || 0,
          stock: p.stock,
        };
      } else {
        productStats[p._id].stock = p.stock;
        productStats[p._id].views = p.views || 0;
      }
    });

    // Convert to array
    const statsArr = Object.values(productStats);

    // Top-selling products
    const topSelling = [...statsArr].sort((a, b) => b.quantity - a.quantity).slice(0, 10);
    // Least performing products
    const leastPerforming = [...statsArr].sort((a, b) => a.quantity - b.quantity).slice(0, 10);
    // Most viewed products
    const mostViewed = [...statsArr].sort((a, b) => b.views - a.views).slice(0, 10);
    // Conversion rate (views vs purchases)
    const conversionRates = statsArr.map(p => ({
      name: p.name,
      conversionRate: p.views > 0 ? ((p.quantity / p.views) * 100).toFixed(2) : null
    }));
    // Stock alerts
    const stockAlerts = statsArr.filter(p => p.stock !== null && p.stock <= 5);
    const stagnant = statsArr.filter(p => p.quantity === 0);

    res.json({
      topSelling,
      leastPerforming,
      mostViewed,
      conversionRates,
      stockAlerts,
      stagnantProducts: stagnant
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch product performance analytics' });
  }
};

exports.getCustomerBehavior = async (req, res) => {
  try {
    // Exclude admin users from analytics
    const adminUsers = await User.find({ role: 'admin' }, '_id email');
    const adminUserIds = adminUsers.map(u => u._id.toString());
    const adminEmails = adminUsers.map(u => u.email);
    const dateFilter = getDateFilter(req.query);
    // Extract startDate for device log filtering
    let startDate;
    if (req.query.startDate) {
      startDate = new Date(req.query.startDate);
    } else {
      startDate = new Date();
      startDate.setDate(startDate.getDate() - 29);
    }
    // Only include orders from non-admin users
    const orders = await Order.find({ ...dateFilter, 'customer._id': { $nin: adminUserIds }, 'customer.email': { $nin: adminEmails } }).lean();
    const allOrders = await Order.find({ 'customer._id': { $nin: adminUserIds }, 'customer.email': { $nin: adminEmails } }).lean();
    const users = await User.find({ role: 'user', _id: { $nin: adminUserIds }, email: { $nin: adminEmails } }).lean();

    // Map user order counts and spend
    const userOrderCounts = {};
    const userSpend = {};
    allOrders.forEach(order => {
      if (order.customer && order.customer.email) {
        userOrderCounts[order.customer.email] = (userOrderCounts[order.customer.email] || 0) + 1;
        userSpend[order.customer.email] = (userSpend[order.customer.email] || 0) + (order.grandTotal || 0);
      }
    });

    // New vs Returning (last 30 days)
    let newCustomers = 0, returningCustomers = 0;
    orders.forEach(order => {
      if (order.customer && order.customer.email) {
        if (userOrderCounts[order.customer.email] === 1) newCustomers++;
        else returningCustomers++;
      }
    });

    // Top Buyers (by spend)
    const buyerSpend = {};
    allOrders.forEach(order => {
      if (order.customer && order.customer.email) {
        buyerSpend[order.customer.email] = (buyerSpend[order.customer.email] || 0) + (order.grandTotal || 0);
      }
    });
    const topBuyers = Object.entries(buyerSpend)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([email, spend]) => {
        const user = users.find(u => u.email === email);
        return { email, name: user?.name || email, spend };
      });

    // Customer Retention Rate (users with >1 order / total users)
    const retained = Object.values(userOrderCounts).filter(c => c > 1).length;
    const retentionRate = users.length > 0 ? ((retained / users.length) * 100).toFixed(2) : 0;

    // Customer Locations (by state)
    const locationCounts = {};
    users.forEach(u => {
      if (u.state) locationCounts[u.state] = (locationCounts[u.state] || 0) + 1;
    });
    const locations = Object.entries(locationCounts).map(([state, count]) => ({ state, count }));
    locations.sort((a, b) => b.count - a.count);

    // Devices Used (aggregate device info from both SecurityLog and PageViewLog for all non-admin users in the date range)
    const allUserIds = users.map(u => u._id.toString());
    // Get device logs from SecurityLog
    const securityDeviceLogs = await SecurityLog.find({
      user: { $in: allUserIds.map(id => new mongoose.Types.ObjectId(id)) },
      device: { $exists: true, $ne: null },
      timestamp: { $gte: startDate }
    }).lean();
    // Get device info from PageViewLog
    const pageViewDeviceLogs = await PageViewLog.find({
      sessionId: { $exists: true, $ne: null },
      userAgent: { $exists: true, $ne: '' },
      timestamp: { $gte: startDate },
      email: { $nin: adminEmails }
    }, 'sessionId userAgent email').lean();
    // Helper to parse device type from user-agent
    function parseDeviceType(ua) {
      if (!ua) return 'unknown';
      const uaLower = ua.toLowerCase();
      // Tablet detection: iPad, Android tablets, Samsung tablets (SM-P*, SM-T*), Sony tablets (SGP*), LG tablets (LG-V*), Amazon Kindle Fire (KF*), Silk browser, Lenovo tablets, Nvidia Shield, generic 'tab', Google Nest Hub, Chromecast built-in, etc.
      if (/ipad|tablet|sm-p|sm-t|sgp|lg-v|kf[a-z0-9]+|silk|lenovo yt-|shield tablet|k1 build|gt-p|tab|playbook|crkey|nest hub/.test(uaLower)) return 'tablet';
      if (/mobile/.test(uaLower)) return 'mobile';
      return 'desktop';
    }

    // Helper to parse OS from user-agent string
    function parseOS(ua) {
      const s = ua.toLowerCase();
      if (s.includes('android')) return 'Android';
      // iOS detection: covers iPhone, iPad, iPod, iOS, iPhone OS
      if (s.includes('iphone') || s.includes('ipad') || s.includes('ipod') || s.includes('ios') || s.includes('iphone os')) return 'iOS';
      // Windows detection: covers windows nt, windows, win32, win64
      if (s.includes('windows nt') || s.includes('windows') || s.includes('win32') || s.includes('win64')) return 'Windows';

      // MacOS detection: covers mac os x, macintosh, macos
      if (s.includes('mac os x') || s.includes('macintosh') || s.includes('macos')) return 'MacOS';
      return 'Other';
    }
    // Map userId/email to set of device categories
    const userDeviceCategories = {};
    // SecurityLog device info
    securityDeviceLogs.forEach(log => {
      const userId = log.user?.toString();
      const category = log.device?.split(' | ')[0] || 'unknown';
      if (userId) {
        if (!userDeviceCategories[userId]) userDeviceCategories[userId] = new Set();
        userDeviceCategories[userId].add(category);
      }
    });
    // PageViewLog device info
    pageViewDeviceLogs.forEach(log => {
      // Try to match user by email (since PageViewLog may not have userId)
      const email = log.email;
      const user = users.find(u => u.email === email);
      const userId = user?._id?.toString();
      const category = parseDeviceType(log.userAgent);
      if (userId) {
        if (!userDeviceCategories[userId]) userDeviceCategories[userId] = new Set();
        userDeviceCategories[userId].add(category);
      }
    });
    // Count all device usages (not deduplicated per user)
    const deviceCounts = {};
    let totalDeviceUsages = 0;
    Object.values(userDeviceCategories).forEach(categorySet => {
      categorySet.forEach(category => {
        deviceCounts[category] = (deviceCounts[category] || 0) + 1;
        totalDeviceUsages++;
      });
    });

    // Calculate percentage of total device usages
    const devices = Object.entries(deviceCounts).map(([type, count]) => ({
      type,
      percent: totalDeviceUsages > 0 ? ((count / totalDeviceUsages) * 100).toFixed(2) : 0
    }));
    devices.sort((a, b) => b.percent - a.percent);

    // --- Customer Lifetime Value (CLV) and Average Spend ---
    const spendValues = Object.values(userSpend);
    const customerLifetimeValue = spendValues.length > 0 ? (spendValues.reduce((a, b) => a + b, 0) / spendValues.length) : 0;
    const topCustomerLifetimeValue = spendValues.length > 0 ? Math.max(...spendValues) : 0;
    const averageSpend = spendValues.length > 0 ? (spendValues.reduce((a, b) => a + b, 0) / spendValues.length) : 0;

    // --- Average Spend Per Customer (for chart) ---
    const averageSpendPerCustomer = Object.entries(userSpend).map(([email, spend]) => {
      const user = users.find(u => u.email === email);
      return {
        email,
        name: user?.name || email,
        spend
      };
    });
    averageSpendPerCustomer.sort((a, b) => b.spend - a.spend);

    // --- Live Visitors & Live Carts ---
    // Live Visitors: sessions started in last 10 minutes and not ended, and not admin
    const now = new Date();
    const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);
    // Get session logs for non-admin users only
    const liveVisitors = await SessionLog.countDocuments({ startTime: { $gte: tenMinutesAgo }, $or: [ { endTime: null }, { endTime: { $exists: false } } ], user: { $nin: adminUserIds } });

    // Live Carts: unique sessionIds in CartActionLog in last 10 minutes, not admin
    const liveCartSessions = await CartActionLog.distinct('sessionId', { timestamp: { $gte: tenMinutesAgo }, user: { $nin: adminUserIds } });
    const liveCarts = liveCartSessions.length;

    res.json({
      newCustomers,
      returningCustomers,
      topBuyers,
      retentionRate,
      locations,
      devices,
      customerLifetimeValue,
      topCustomerLifetimeValue,
      averageSpend,
      averageSpendPerCustomer,
      liveVisitors,
      liveCarts
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch customer behavior analytics' });
  }
};

exports.getTrafficEngagement = async (req, res) => {
  try {
    // Exclude admin users from analytics
    const adminUsers = await User.find({ role: 'admin' }, '_id email');
    const adminUserIds = adminUsers.map(u => u._id.toString());
    const adminEmails = adminUsers.map(u => u.email);
    const dateFilter = getDateFilter(req.query, 'timestamp');
    // Visits trend: count unique IPs per day from PageViewLog (exclude admin sessions)
    const visitsAgg = await PageViewLog.aggregate([
      { $match: { ...dateFilter, user: { $nin: adminUserIds }, email: { $nin: adminEmails } } },
      { $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
        uniqueIps: { $addToSet: '$ip' }
      }},
      { $project: { date: '$_id', visits: { $size: '$uniqueIps' }, _id: 0 } },
      { $sort: { date: 1 } }
    ]);
    // Fill missing days
    const trendsMap = {};
    visitsAgg.forEach(rt => { trendsMap[rt.date] = rt; });
    let start = new Date(req.query.startDate || (new Date(Date.now() - 29 * 24 * 60 * 60 * 1000)).toISOString().slice(0,10));
    let end = new Date(req.query.endDate || (new Date()).toISOString().slice(0,10));
    const visitsTrends = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const key = d.toISOString().slice(0, 10);
      visitsTrends.push({ date: key, visits: trendsMap[key]?.visits || 0 });
    }

    // Avg. session duration (from SessionLog, exclude admin users)
    const sessions = await SessionLog.find({ startTime: { $gte: start }, endTime: { $exists: true }, user: { $nin: adminUserIds } });
    let avgSessionDuration = 0;
    if (sessions.length > 0) {
      const totalDuration = sessions.reduce((sum, s) => sum + ((s.endTime - s.startTime) / 60000), 0); // in minutes
      avgSessionDuration = (totalDuration / sessions.length).toFixed(2);
    }

    // Bounce rate (from PageViewLog: sessions with only 1 page view, exclude admin)
    const sessionCounts = await PageViewLog.aggregate([
      { $match: { ...dateFilter, user: { $nin: adminUserIds }, email: { $nin: adminEmails } } },
      { $group: { _id: '$sessionId', count: { $sum: 1 } } }
    ]);
    const totalSessions = sessionCounts.length;
    const bouncedSessions = sessionCounts.filter(s => s.count === 1).length;
    const bounceRate = totalSessions > 0 ? ((bouncedSessions / totalSessions) * 100).toFixed(2) : 0;

    // Top landing pages (first page per session, exclude admin)
    const firstPages = await PageViewLog.aggregate([
      { $match: { ...dateFilter, user: { $nin: adminUserIds }, email: { $nin: adminEmails } } },
      { $sort: { sessionId: 1, timestamp: 1 } },
      { $group: { _id: '$sessionId', page: { $first: '$page' } } },
      { $group: { _id: '$page', visits: { $sum: 1 } } },
      { $project: { page: '$_id', visits: 1, _id: 0 } },
      { $sort: { visits: -1 } },
      { $limit: 10 }
    ]);

    // Top Referrers (site sources) - normalize before grouping, exclude admin
    const topReferrersAgg = await PageViewLog.aggregate([
      { $match: { ...dateFilter, user: { $nin: adminUserIds }, email: { $nin: adminEmails } } },
      { $addFields: {
          normalizedReferrer: {
            $cond: [
              { $or: [
                { $eq: ['$referrer', ''] },
                { $eq: ['$referrer', null] },
                { $regexMatch: { input: '$referrer', regex: 'localhost', options: 'i' } },
                { $regexMatch: { input: '$referrer', regex: 'jccloset', options: 'i' } }
              ] },
              'Direct',
              {
                $replaceAll: {
                  input: {
                    $replaceAll: {
                      input: {
                        $replaceAll: {
                          input: '$referrer',
                          find: 'https://',
                          replacement: ''
                        }
                      },
                      find: 'http://',
                      replacement: ''
                    }
                  },
                  find: '/',
                  replacement: ''
                }
              }
            ]
          }
        }
      },
      { $group: { _id: '$normalizedReferrer', visits: { $sum: 1 } } },
      { $project: { referrer: '$_id', visits: 1, _id: 0 } },
      { $sort: { visits: -1 } },
      { $limit: 10 }
    ]);
    const topReferrers = topReferrersAgg.map(r => ({
      referrer: (!r.referrer || r.referrer === null || r.referrer === '') ? 'Direct' : r.referrer,
      visits: r.visits
    }));

    // Top exit pages (last page per session, exclude admin)
    const lastPages = await PageViewLog.aggregate([
      { $match: { ...dateFilter, user: { $nin: adminUserIds }, email: { $nin: adminEmails } } },
      { $sort: { sessionId: 1, timestamp: 1 } },
      { $group: { _id: '$sessionId', page: { $last: '$page' } } },
      { $group: { _id: '$page', exits: { $sum: 1 } } },
      { $project: { page: '$_id', exits: 1, _id: 0 } },
      { $sort: { exits: -1 } },
      { $limit: 10 }
    ]);

    // Page Views Per Session (with email if present, exclude admin)
    const pageViewsPerSessionAgg = await PageViewLog.aggregate([
      { $match: { ...dateFilter, user: { $nin: adminUserIds }, email: { $nin: adminEmails } } },
      { $group: {
          _id: '$sessionId',
          pageViews: { $sum: 1 },
          email: { $first: '$email' } // Get the email for the session if present
        }
      },
      { $project: { sessionId: '$_id', pageViews: 1, email: 1, _id: 0 } },
      { $sort: { pageViews: -1 } },
      { $limit: 10 }
    ]);

    // Top most viewed pages (by total views, exclude admin)
    const topMostViewedPagesAgg = await PageViewLog.aggregate([
      { $match: { ...dateFilter, user: { $nin: adminUserIds }, email: { $nin: adminEmails } } },
      { $group: { _id: '$page', views: { $sum: 1 } } },
      { $project: { page: '$_id', views: 1, _id: 0 } },
      { $sort: { views: -1 } },
      { $limit: 10 }
    ]);

    // --- OS Usage Aggregation (now only in traffic endpoint) ---
    const users = await User.find({ role: 'user', _id: { $nin: adminUserIds }, email: { $nin: adminEmails } }).lean();
    const allUserIds = users.map(u => u._id.toString());
    const securityDeviceLogs = await SecurityLog.find({
      user: { $in: allUserIds.map(id => new mongoose.Types.ObjectId(id)) },
      device: { $exists: true, $ne: null },
      timestamp: { $gte: start }
    }).lean();
    const pageViewDeviceLogs = await PageViewLog.find({
      sessionId: { $exists: true, $ne: null },
      userAgent: { $exists: true, $ne: '' },
      timestamp: { $gte: start, $lte: end },
      email: { $nin: adminEmails }
    }, 'sessionId userAgent email').lean();
    // Debug: log the PageViewLog query filter and time range
    console.log('PageViewLog OS usage query filter:', {
      sessionId: { $exists: true, $ne: null },
      userAgent: { $exists: true, $ne: '' },
      timestamp: { $gte: start },
      email: { $nin: adminEmails }
    });
    console.log('OS usage PageViewLog time range start:', start, 'end:', end);
    function parseOS(ua) {
      const s = ua.toLowerCase();
      if (s.includes('android')) return 'Android';
      if (s.includes('iphone') || s.includes('ipad') || s.includes('ipod') || s.includes('ios') || s.includes('iphone os')) return 'iOS';
      if (s.includes('windows nt') || s.includes('windows') || s.includes('win32') || s.includes('win64')) return 'Windows';
      if (s.includes('mac os x') || s.includes('macintosh') || s.includes('macos')) return 'MacOS';
      return 'Other';
    }
    const osCounts = { Android: 0, iOS: 0, Windows: 0, MacOS: 0, Other: 0 };
    let totalOSUsages = 0;
    // SecurityLog: device field may contain user-agent after ' | '
    securityDeviceLogs.forEach(log => {
      let ua = null;
      if (log.device && log.device.includes(' | ')) {
        ua = log.device.split(' | ')[1];
      }
      if (ua) {
        const os = parseOS(ua);
        osCounts[os] = (osCounts[os] || 0) + 1;
        totalOSUsages++;
      }
    });
    // PageViewLog: userAgent field
    // Debug: log number of PageViewLog entries and a sample
    console.log('PageViewLog entries for OS usage:', pageViewDeviceLogs.length);
    if (pageViewDeviceLogs.length > 0) {
      console.log('Sample PageViewLog entry:', pageViewDeviceLogs[0]);
    }
    pageViewDeviceLogs.forEach(log => {
      if (log.userAgent) {
        const os = parseOS(log.userAgent);
        // Debug: log user agent and detected OS
        console.log('UserAgent:', log.userAgent, 'Detected OS:', os);
        osCounts[os] = (osCounts[os] || 0) + 1;
        totalOSUsages++;
      }
    });
    const oses = Object.entries(osCounts).map(([type, count]) => ({
      type,
      percent: totalOSUsages > 0 ? ((count / totalOSUsages) * 100).toFixed(2) : 0
    }));
    oses.sort((a, b) => b.percent - a.percent);

    res.json({
      visitsTrends,
      avgSessionDuration,
      bounceRate,
      topLandingPages: firstPages,
      topReferrers, // <-- new field
      topExitPages: lastPages, // <-- new field
      pageViewsPerSession: pageViewsPerSessionAgg, // <-- new field
      topMostViewedPages: topMostViewedPagesAgg, // <-- new field
      oses
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch traffic & engagement analytics' });
  }
};

exports.getOrdersOverview = async (req, res) => {
  try {
    const dateFilter = getDateFilter(req.query);
    // Status breakdown
    const statusAgg = await Order.aggregate([
      { $match: dateFilter },
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $project: { status: '$_id', count: 1, _id: 0 } },
      { $sort: { count: -1 } }
    ]);
    // Order trends
    let start = new Date(req.query.startDate || (new Date(Date.now() - 29 * 24 * 60 * 60 * 1000)).toISOString().slice(0,10));
    let end = new Date(req.query.endDate || (new Date()).toISOString().slice(0,10));
    const orderTrendsAgg = await Order.aggregate([
      { $match: dateFilter },
      { $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        orders: { $sum: 1 }
      }},
      { $sort: { _id: 1 } }
    ]);
    const trendsMap = {};
    orderTrendsAgg.forEach(rt => { trendsMap[rt._id] = rt; });
    const orderTrends = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const key = d.toISOString().slice(0, 10);
      orderTrends.push({ date: key, orders: trendsMap[key]?.orders || 0 });
    }
    // Average fulfillment time (delivered orders only, from paidAt to deliveredAt)
    const deliveredOrders = await Order.find({ status: 'delivered', paidAt: { $exists: true }, deliveredAt: { $exists: true }, ...dateFilter }, 'paidAt deliveredAt').lean();
    let avgFulfillmentTime = 0;
    if (deliveredOrders.length > 0) {
      const totalDays = deliveredOrders.reduce((sum, o) => sum + ((o.deliveredAt - o.paidAt) / (1000 * 60 * 60 * 24)), 0);
      avgFulfillmentTime = (totalDays / deliveredOrders.length).toFixed(2);
    }
    const cancelledCount = await Order.countDocuments({ status: 'cancelled', ...dateFilter });
    const returnedCount = await Order.countDocuments({ status: 'returned', ...dateFilter });
    res.json({
      statusBreakdown: statusAgg,
      orderTrends,
      avgFulfillmentTime,
      cancelledCount,
      returnedCount
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch orders overview analytics' });
  }
};

exports.getMarketingPerformance = async (req, res) => {
  try {
    const dateFilter = getDateFilter(req.query);
    const campaignsAgg = await Order.aggregate([
      { $match: { campaign: { $exists: true, $ne: null }, ...dateFilter } },
      { $group: {
        _id: '$campaign',
        conversions: { $sum: 1 },
        revenue: { $sum: '$grandTotal' },
        spend: { $sum: '$campaignSpend' }
      }},
      { $project: {
        name: '$_id',
        conversions: 1,
        revenue: 1,
        spend: 1,
        roi: { $cond: [ { $gt: ['$spend', 0] }, { $multiply: [ { $divide: ['$revenue', '$spend'] }, 100 ] }, 0 ] }
      }},
      { $sort: { revenue: -1 } }
    ]);
    const totalSpend = campaignsAgg.reduce((sum, c) => sum + (c.spend || 0), 0);
    const totalRevenue = campaignsAgg.reduce((sum, c) => sum + (c.revenue || 0), 0);
    res.json({
      campaigns: campaignsAgg,
      totalSpend,
      totalRevenue
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch marketing performance analytics' });
  }
};

// New: Visits per page (not unique IP)
exports.getPageVisitsTrend = async (req, res) => {
  try {
    // Exclude admin users from analytics
    const adminUsers = await User.find({ role: 'admin' }, '_id email');
    const adminUserIds = adminUsers.map(u => u._id.toString());
    const adminEmails = adminUsers.map(u => u.email);
    const dateFilter = getDateFilter(req.query, 'timestamp');
    // Parse start and end for filling missing days
    let start = req.query.startDate ? new Date(req.query.startDate) : null;
    let end = req.query.endDate ? new Date(req.query.endDate) : null;
    // Aggregate total visits per page per day, exclude admin
    const visitsAgg = await PageViewLog.aggregate([
      { $match: { ...dateFilter, user: { $nin: adminUserIds }, email: { $nin: adminEmails } } },
      { $group: {
        _id: { date: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } }, page: '$page' },
        visits: { $sum: 1 }
      }},
      { $project: { date: '$_id.date', page: '$_id.page', visits: 1, _id: 0 } },
      { $sort: { date: 1, page: 1 } }
    ]);
    // Structure: { [page]: [{ date, visits }, ...] }
    const pageMap = {};
    // Fill missing days for each page if date range is provided
    if (start && end) {
      // Group by page
      const grouped = {};
      visitsAgg.forEach(row => {
        if (!grouped[row.page]) grouped[row.page] = {};
        grouped[row.page][row.date] = row.visits;
      });
      for (const page of Object.keys(grouped)) {
        pageMap[page] = [];
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          const key = d.toISOString().slice(0, 10);
          pageMap[page].push({ date: key, visits: grouped[page][key] || 0 });
        }
      }
    } else {
      // No date range, just use what we have
      visitsAgg.forEach(row => {
        if (!pageMap[row.page]) pageMap[row.page] = [];
        pageMap[row.page].push({ date: row.date, visits: row.visits });
      });
    }
    res.json({ pageVisitsTrends: pageMap });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch page visits trend' });
  }
};

// Funnel and Cart Analytics
exports.getFunnelAnalytics = async (req, res) => {
  try {
    // Exclude admin users from analytics
    const adminUsers = await User.find({ role: 'admin' }, '_id email');
    const adminUserIds = adminUsers.map(u => u._id.toString());
    const adminEmails = adminUsers.map(u => u.email);
    // Date filter for all logs
    const dateFilter = getDateFilter(req.query);
    const startDate = req.query.startDate ? new Date(req.query.startDate) : new Date(Date.now() - 29 * 24 * 60 * 60 * 1000);
    const endDate = req.query.endDate ? new Date(req.query.endDate) : new Date();

    // 1. Funnel: Visit → Add to Cart → Checkout → Purchase
    // Visits: unique sessions in PageViewLog (exclude admin)
    const visitSessions = await PageViewLog.distinct('sessionId', { timestamp: { $gte: startDate, $lte: endDate }, user: { $nin: adminUserIds }, email: { $nin: adminEmails } });
    const visitCount = visitSessions.length;

    // Add to Cart: unique sessions in CartActionLog (action: 'add', exclude admin)
    const cartActionSessions = await CartActionLog.distinct('sessionId', {
      action: 'add',
      timestamp: { $gte: startDate, $lte: endDate },
      user: { $nin: adminUserIds },
      email: { $nin: adminEmails }
    });
    const addToCartCount = cartActionSessions.length;

    // Checkout: unique sessions in CheckoutEventLog (exclude admin)
    const checkoutSessions = await CheckoutEventLog.distinct('sessionId', {
      timestamp: { $gte: startDate, $lte: endDate },
      user: { $nin: adminUserIds },
      email: { $nin: adminEmails }
    });
    const checkoutCount = checkoutSessions.length;

    // Purchase: completed orders (paid/shipped/delivered, exclude admin)
    const purchaseOrders = await Order.find({ ...dateFilter, status: { $in: ['paid', 'shipped', 'delivered'] }, 'customer._id': { $nin: adminUserIds }, 'customer.email': { $nin: adminEmails } }, 'sessionId').lean();
    const purchaseSessionIds = Array.from(new Set(purchaseOrders.map(o => o.sessionId).filter(Boolean)));
    const purchaseCount = purchaseSessionIds.length;

    // 2. Top Added-to-Cart Products (by frequency in cart actions, exclude admin)
    const cartActions = await CartActionLog.find({ action: 'add', timestamp: { $gte: startDate, $lte: endDate }, user: { $nin: adminUserIds }, email: { $nin: adminEmails } }).lean();
    const cartProductCounts = {};
    cartActions.forEach(action => {
      const key = action.productId.toString();
      cartProductCounts[key] = (cartProductCounts[key] || 0) + (action.quantity || 1);
    });
    // Optionally, join with Perfume for product names
    const productIds = Object.keys(cartProductCounts);
    let topCartProducts = [];
    if (productIds.length) {
      const perfumes = await Perfume.find({ _id: { $in: productIds } }).lean();
      topCartProducts = perfumes.map(p => ({
        name: p.name,
        count: cartProductCounts[p._id.toString()] || 0
      })).sort((a, b) => b.count - a.count).slice(0, 10);
    }

    // Funnel data for chart
    const funnel = [
      { stage: 'Visited', count: visitCount },
      { stage: 'Added to Cart', count: addToCartCount },
      { stage: 'Checkout', count: checkoutCount },
      { stage: 'Purchase', count: purchaseCount },
    ];

    res.json({ funnel, topCartProducts });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch funnel analytics' });
  }
};
