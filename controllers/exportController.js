const { Parser } = require('json2csv');
const PDFDocument = require('pdfkit');
const Order = require('../models/Order');
const Perfume = require('../models/Perfume');
const User = require('../models/User');
const SecurityLog = require('../models/SecurityLog');
const SessionLog = require('../models/SessionLog');
const PageViewLog = require('../models/PageViewLog');

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

// Helper to get analytics data by tab
async function getAnalyticsData(tab, query) {
  const dateFilter = getDateFilter(query);
  switch (tab) {
    case 'sales': {
      // ...existing code for sales analytics...
      const matchPaid = { status: { $in: ['paid', 'shipped', 'delivered'] } };
      const totalSales = await Order.countDocuments({ ...matchPaid, ...dateFilter });
      const totalRevenueAgg = await Order.aggregate([
        { $match: { ...matchPaid, ...dateFilter } },
        { $group: { _id: null, total: { $sum: '$grandTotal' } } }
      ]);
      const totalRevenue = totalRevenueAgg[0]?.total || 0;
      const avgOrderValue = totalSales > 0 ? totalRevenue / totalSales : 0;
      const totalOrders = await Order.countDocuments(dateFilter);
      const returnedOrders = await Order.countDocuments({ status: 'cancelled', ...dateFilter });
      const returnRate = totalOrders > 0 ? ((returnedOrders / totalOrders) * 100).toFixed(2) : 0;
      const revenueTrends = await Order.aggregate([
        { $match: { ...matchPaid, ...dateFilter } },
        { $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          revenue: { $sum: '$grandTotal' },
          orders: { $sum: 1 }
        }},
        { $sort: { _id: 1 } }
      ]);
      return { totalSales, totalRevenue, avgOrderValue, returnRate, revenueTrends };
    }
    case 'orders': {
      // ...existing code for orders overview...
      const statusAgg = await Order.aggregate([
        { $match: dateFilter },
        { $group: { _id: '$status', count: { $sum: 1 } } },
        { $project: { status: '$_id', count: 1, _id: 0 } },
        { $sort: { count: -1 } }
      ]);
      const orderTrendsAgg = await Order.aggregate([
        { $match: dateFilter },
        { $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          orders: { $sum: 1 }
        }},
        { $sort: { _id: 1 } }
      ]);
      const deliveredOrders = await Order.find({ status: 'delivered', shippedAt: { $exists: true }, deliveredAt: { $exists: true }, ...dateFilter }, 'shippedAt deliveredAt').lean();
      let avgFulfillmentTime = 0;
      if (deliveredOrders.length > 0) {
        const totalDays = deliveredOrders.reduce((sum, o) => sum + ((o.deliveredAt - o.shippedAt) / (1000 * 60 * 60 * 24)), 0);
        avgFulfillmentTime = (totalDays / deliveredOrders.length).toFixed(2);
      }
      const cancelledCount = await Order.countDocuments({ status: 'cancelled', ...dateFilter });
      const returnedCount = await Order.countDocuments({ status: 'returned', ...dateFilter });
      return { statusBreakdown: statusAgg, orderTrends: orderTrendsAgg, avgFulfillmentTime, cancelledCount, returnedCount };
    }
    case 'traffic': {
      // ...existing code for traffic & engagement...
      const dateFilterTraffic = getDateFilter(query, 'timestamp');
      const visitsAgg = await PageViewLog.aggregate([
        { $match: dateFilterTraffic },
        { $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
          uniqueIps: { $addToSet: '$ip' }
        }},
        { $project: { date: '$_id', visits: { $size: '$uniqueIps' }, _id: 0 } },
        { $sort: { date: 1 } }
      ]);
      // Avg. session duration (from SessionLog)
      let start = new Date(query.startDate || (new Date(Date.now() - 29 * 24 * 60 * 60 * 1000)).toISOString().slice(0,10));
      let end = new Date(query.endDate || (new Date()).toISOString().slice(0,10));
      const sessions = await SessionLog.find({ startTime: { $gte: start }, endTime: { $exists: true } });
      let avgSessionDuration = 0;
      if (sessions.length > 0) {
        const totalDuration = sessions.reduce((sum, s) => sum + ((s.endTime - s.startTime) / 60000), 0); // in minutes
        avgSessionDuration = (totalDuration / sessions.length).toFixed(2);
      }
      return { visitsAgg, avgSessionDuration };
    }
    case 'products': {
      // ...existing code for product performance...
      const matchPaid = { status: { $in: ['paid', 'shipped', 'delivered'] } };
      const orders = await Order.find({ ...matchPaid, ...dateFilter }).lean();
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
      const statsArr = Object.values(productStats);
      return { statsArr };
    }
    case 'customers': {
      // ...existing code for customer behavior...
      const orders = await Order.find(dateFilter).lean();
      const allOrders = await Order.find({}).lean();
      const users = await User.find({ role: 'user' }).lean();
      const userOrderCounts = {};
      allOrders.forEach(order => {
        if (order.customer && order.customer.email) {
          userOrderCounts[order.customer.email] = (userOrderCounts[order.customer.email] || 0) + 1;
        }
      });
      let newCustomers = 0, returningCustomers = 0;
      orders.forEach(order => {
        if (order.customer && order.customer.email) {
          if (userOrderCounts[order.customer.email] === 1) newCustomers++;
          else returningCustomers++;
        }
      });
      return { newCustomers, returningCustomers };
    }
    case 'marketing': {
      // ...existing code for marketing performance...
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
      return { campaigns: campaignsAgg };
    }
    default:
      return {};
  }
}

exports.exportCSV = async (req, res) => {
  try {
    const tab = req.query.tab || 'orders';
    const data = await getAnalyticsData(tab, req.query);
    if (!data || (Array.isArray(data) && !data.length)) return res.status(404).send('No data to export');
    // Flatten data for CSV
    let csvData = data;
    if (tab === 'sales' && data.revenueTrends) csvData = data.revenueTrends;
    if (tab === 'orders' && data.orderTrends) csvData = data.orderTrends;
    if (tab === 'products' && data.statsArr) csvData = data.statsArr;
    if (tab === 'marketing' && data.campaigns) csvData = data.campaigns;
    const fields = Object.keys(csvData[0] || {});
    const parser = new Parser({ fields });
    const csv = parser.parse(csvData);
    res.header('Content-Type', 'text/csv');
    res.attachment('analytics-export.csv');
    res.send(csv);
  } catch (err) {
    res.status(500).send('Failed to export CSV');
  }
};

exports.exportPDF = async (req, res) => {
  try {
    const tab = req.query.tab || 'orders';
    const data = await getAnalyticsData(tab, req.query);
    if (!data || (Array.isArray(data) && !data.length)) return res.status(404).send('No data to export');
    const doc = new PDFDocument({ margin: 30 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="analytics-export.pdf"');
    doc.pipe(res);
    doc.fontSize(18).text(`Analytics Export: ${tab.charAt(0).toUpperCase() + tab.slice(1)}`, { align: 'center' });
    doc.moveDown();
    // If chart image is sent (for PDF), embed it
    if (req.method === 'POST' && req.body && req.body.chartImage) {
      const img = req.body.chartImage;
      const matches = img.match(/^data:image\/(png|jpeg);base64,(.+)$/);
      if (matches) {
        const ext = matches[1];
        const base64Data = matches[2];
        const buffer = Buffer.from(base64Data, 'base64');
        doc.image(buffer, { fit: [450, 250], align: 'center' });
        doc.moveDown();
      }
    }
    // Render all relevant arrays/objects for the selected tab as tables
    function renderTable(title, arr) {
      if (!Array.isArray(arr) || arr.length === 0) return;
      const fields = Object.keys(arr[0]);
      doc.fontSize(14).text(title, { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(10).fillColor('black');
      fields.forEach((field, idx) => {
        doc.text(field, { continued: idx < fields.length - 1, underline: true });
      });
      doc.moveDown(0.3);
      arr.forEach(row => {
        fields.forEach((field, idx) => {
          let value = row[field];
          if (typeof value === 'object' && value !== null) value = JSON.stringify(value);
          doc.text(value !== undefined ? value : '', { continued: idx < fields.length - 1 });
        });
        doc.moveDown(0.2);
      });
      doc.moveDown(1);
    }

    // SALES TAB
    if (tab === 'sales') {
      if (data.revenueTrends) renderTable('Revenue Trends', data.revenueTrends);
      if (data.topDays) renderTable('Top Performing Days', data.topDays);
      // Also show summary stats
      doc.fontSize(12).text(`Total Sales: ${data.totalSales}`);
      doc.fontSize(12).text(`Total Revenue: ₦${data.totalRevenue}`);
      doc.fontSize(12).text(`Avg Order Value: ₦${data.avgOrderValue}`);
      doc.fontSize(12).text(`Return Rate: ${data.returnRate}%`);
    }
    // ORDERS TAB
    else if (tab === 'orders') {
      if (data.statusBreakdown) renderTable('Order Status Breakdown', data.statusBreakdown);
      if (data.orderTrends) renderTable('Order Trends', data.orderTrends);
      doc.fontSize(12).text(`Avg Fulfillment Time: ${data.avgFulfillmentTime} days`);
      doc.fontSize(12).text(`Cancelled Orders: ${data.cancelledCount}`);
      doc.fontSize(12).text(`Returned Orders: ${data.returnedCount}`);
    }
    // PRODUCTS TAB
    else if (tab === 'products') {
      if (data.topSelling) renderTable('Top Selling Products', data.topSelling);
      if (data.leastPerforming) renderTable('Least Performing Products', data.leastPerforming);
      if (data.mostViewed) renderTable('Most Viewed Products', data.mostViewed);
      if (data.conversionRates) renderTable('Conversion Rates', data.conversionRates);
      if (data.stockAlerts) renderTable('Stock Alerts (≤5)', data.stockAlerts);
      if (data.stagnantProducts) renderTable('Stagnant Products (No Sales)', data.stagnantProducts);
    }
    // CUSTOMERS TAB
    else if (tab === 'customers') {
      doc.fontSize(12).text(`New Customers: ${data.newCustomers}`);
      doc.fontSize(12).text(`Returning Customers: ${data.returningCustomers}`);
      if (data.topBuyers) renderTable('Top Buyers', data.topBuyers);
      if (data.locations) renderTable('Customer Locations', data.locations);
      if (data.devices) renderTable('Devices Used', data.devices);
      doc.fontSize(12).text(`Retention Rate: ${data.retentionRate}%`);
      doc.fontSize(12).text(`Customer Lifetime Value: ₦${data.customerLifetimeValue}`);
      doc.fontSize(12).text(`Top Customer Lifetime Value: ₦${data.topCustomerLifetimeValue}`);
      doc.fontSize(12).text(`Average Spend: ₦${data.averageSpend}`);
      if (data.averageSpendPerCustomer) renderTable('Average Spend Per Customer', data.averageSpendPerCustomer);
      doc.fontSize(12).text(`Live Visitors: ${data.liveVisitors}`);
      doc.fontSize(12).text(`Live Carts: ${data.liveCarts}`);
    }
    // TRAFFIC TAB
    else if (tab === 'traffic') {
      if (data.visitsTrends) renderTable('Visits Trend', data.visitsTrends);
      doc.fontSize(12).text(`Avg Session Duration: ${data.avgSessionDuration} min`);
      doc.fontSize(12).text(`Bounce Rate: ${data.bounceRate}%`);
      if (data.topLandingPages) renderTable('Top Landing Pages', data.topLandingPages);
      if (data.topReferrers) renderTable('Top Referrers', data.topReferrers);
      if (data.topExitPages) renderTable('Top Exit Pages', data.topExitPages);
      if (data.pageViewsPerSession) renderTable('Page Views Per Session', data.pageViewsPerSession);
      if (data.topMostViewedPages) renderTable('Top Most Viewed Pages', data.topMostViewedPages);
      if (data.oses) renderTable('Operating Systems', data.oses);
      if (data.browsers) renderTable('Browsers', data.browsers);
    }
    // MARKETING TAB
    else if (tab === 'marketing') {
      if (data.campaigns) renderTable('Campaigns', data.campaigns);
      doc.fontSize(12).text(`Total Spend: ₦${data.totalSpend}`);
      doc.fontSize(12).text(`Total Revenue: ₦${data.totalRevenue}`);
    }
    // Add support for other tabs if needed (userflow, funnel, siteSpeed, errors)
    else if (tab === 'userflow' && data.topPaths) {
      renderTable('Top User Navigation Paths', data.topPaths);
    }
    else if (tab === 'funnel') {
      if (data.funnel) renderTable('Funnel', data.funnel);
      if (data.topCartProducts) renderTable('Top Added-to-Cart Products', data.topCartProducts);
    }
    else if (tab === 'siteSpeed' && data.metrics) {
      renderTable('Web Vitals Metrics', data.metrics);
    }
    else if (tab === 'errors' && data.errors) {
      renderTable('Error Events', data.errors);
    }
    else {
      // Fallback: show JSON
      doc.fontSize(12).text(JSON.stringify(data, null, 2));
    }
    doc.end();
  } catch (err) {
    res.status(500).send('Failed to export PDF');
  }
};
