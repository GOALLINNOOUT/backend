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
    const doc = new PDFDocument();
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
    // Render data as table or summary
    if (tab === 'sales' && data.revenueTrends) {
      doc.fontSize(14).text('Revenue Trends:', { underline: true });
      data.revenueTrends.forEach(row => {
        doc.fontSize(10).text(`Date: ${row._id || row.date}, Revenue: ₦${row.revenue}, Orders: ${row.orders}`);
      });
    } else if (tab === 'orders' && data.orderTrends) {
      doc.fontSize(14).text('Order Trends:', { underline: true });
      data.orderTrends.forEach(row => {
        doc.fontSize(10).text(`Date: ${row._id || row.date}, Orders: ${row.orders}`);
      });
    } else if (tab === 'products' && data.statsArr) {
      doc.fontSize(14).text('Product Performance:', { underline: true });
      data.statsArr.forEach(row => {
        doc.fontSize(10).text(`Product: ${row.name}, Sold: ${row.quantity}, Revenue: ₦${row.revenue}, Views: ${row.views}, Stock: ${row.stock}`);
      });
    } else if (tab === 'traffic' && data.visitsAgg) {
      doc.fontSize(14).text('Traffic Trends:', { underline: true });
      data.visitsAgg.forEach(row => {
        doc.fontSize(10).text(`Date: ${row.date}, Visits: ${row.visits}`);
      });
      doc.fontSize(12).text(`Avg. Session Duration: ${data.avgSessionDuration} min`);
    } else if (tab === 'marketing' && data.campaigns) {
      doc.fontSize(14).text('Marketing Campaigns:', { underline: true });
      data.campaigns.forEach(row => {
        doc.fontSize(10).text(`Campaign: ${row.name}, Conversions: ${row.conversions}, Revenue: ₦${row.revenue}, Spend: ₦${row.spend}, ROI: ${row.roi}%`);
      });
    } else {
      doc.fontSize(12).text(JSON.stringify(data, null, 2));
    }
    doc.end();
  } catch (err) {
    res.status(500).send('Failed to export PDF');
  }
};
