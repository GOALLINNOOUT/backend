require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const fetch = require('node-fetch');
const newsletterRoutes = require('./routes/newsletter');
const appointmentsRoutes = require('./routes/appointments');
const contactRoutes = require('./routes/contact');
const designsRouter = require('./routes/designs');
const perfumesRouter = require('./routes/perfumes');
const authRouter = require('./routes/auth');
const userRouter = require('./routes/user');
const ordersRouter = require('./routes/orders');
const cartRoutes = require('./routes/cart');
const adminRouter = require('./routes/admin');
const path = require('path');
const customLookRequestRouter = require('./routes/customLookRequest');
const analyticsRouter = require('./routes/analytics');
const exportRouter = require('./routes/export');
const aiRecommendationsRouter = require('./routes/aiRecommendations');
const notificationsRouter = require('./routes/notifications');
const pushRouter = require('./routes/push');
const cookieParser = require('cookie-parser');
const updateLastActivity = require('./middleware/updateLastActivity');
const sessionLogger = require('./middleware/sessionLogger');
const pageViewLogger = require('./middleware/pageViewLogger');
const sessionRouter = require('./routes/session');
const pageViewsRouter = require('./routes/pageViews');
const cartActionsRouter = require('./routes/cartActions');


const http = require('http');
const app = express();
const server = http.createServer(app);
const { Server } = require('socket.io');
const io = new Server(server, {
  cors: {
    origin: [
      'http://localhost:5173',
      'https://frontend-pearl-tau-37.vercel.app',
      'https://jccloset.vercel.app'
    ],
    credentials: true
  }
});

// Socket.IO connection
io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);
  // Listen for user identification (e.g., userId)
  socket.on('identify', (userId) => {
    socket.join(`user_${userId}`);
  });
  // Listen for admin identification
  socket.on('admin', () => {
    socket.join('admins');
  });
  socket.on('disconnect', () => {
    console.log('Socket disconnected:', socket.id);
  });
});

// Make io accessible in routes
app.set('io', io);
// Trust proxy to get real client IP from X-Forwarded-For
app.set('trust proxy', true);
app.use(cors({
  origin: [
    'http://localhost:5173',
    'https://frontend-pearl-tau-37.vercel.app',
    'https://jccloset.vercel.app'
  ],
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());
app.use(updateLastActivity); // Update lastActivity for any backend/API request
app.use(sessionLogger);
app.use(pageViewLogger);
app.use('/api/notifications', notificationsRouter);
app.use('/api/push', pushRouter);

// Serve uploads folder statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/jcscloset', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

mongoose.connection.on('connected', () => {
  console.log('MongoDB connected');
});

// Start server with Socket.IO
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`JC's Closet API running on port ${PORT}`);
});

// --- Session Cleanup Cron ---
const SessionLog = require('./models/SessionLog');
const PageViewLog = require('./models/PageViewLog');
const cron = require('node-cron');
const INACTIVITY_MINUTES = 10;

async function cleanupSessions() {
  try {
    const cutoff = new Date(Date.now() - INACTIVITY_MINUTES * 60 * 1000);
    const sessions = await SessionLog.find({ endTime: { $exists: false } });
    let endedSessions = [];
    for (const session of sessions) {
      // Skip sessions missing startTime (required by schema)
      if (!session.startTime) {
        console.warn(`[sessionCleanup] Skipping session with missing startTime: ${session.sessionId}`);
        continue;
      }
      const lastPageView = await PageViewLog.findOne(
        { sessionId: session.sessionId },
        {},
        { sort: { timestamp: -1 } }
      );
      let lastActivity = session.lastActivity || lastPageView?.timestamp || session.startTime;
      if (lastActivity <= cutoff) {
        session.endTime = new Date();
        session.lastActivity = lastActivity;
        await session.save();
        endedSessions.push(session.sessionId);
      } else if (!session.lastActivity || (lastPageView && lastPageView.timestamp > (session.lastActivity || session.startTime))) {
        session.lastActivity = lastPageView?.timestamp || session.lastActivity;
        await session.save();
      }
    }
    if (endedSessions.length > 0) {
      console.log(`[sessionCleanup] Ended sessions (inactive > ${INACTIVITY_MINUTES} min):`, endedSessions);
    }
  } catch (err) {
    console.error('[sessionCleanup] Error:', err);
  }
}

// Start cron after MongoDB connects
mongoose.connection.on('connected', () => {
  console.log('MongoDB connected to cron job');
  cleanupSessions();
  cron.schedule('*/10 * * * *', cleanupSessions);
});

// Basic route
app.get('/', (req, res) => {
  res.send('JC\'s Closet API is running');
});

app.post('/api/suggest-perfume', async (req, res) => {
  try {
    // Forward the request body to the ML backend (Flask, usually on port 8000)
    const mlResponse = await fetch('http://localhost:8000/api/suggest-perfume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });
    if (!mlResponse.ok) {
      return res.status(mlResponse.status).json({ error: 'ML backend error' });
    }
    const data = await mlResponse.json();
    res.json(data);
  } catch (error) {
    console.error('Error forwarding to ML backend:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Serve uploaded images globally
app.use('/api/designs/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/api/perfumes/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/api/articles/uploads', express.static(path.join(__dirname, 'uploads')));

// Newsletter routes
app.use('/api/newsletter', newsletterRoutes);
// Appointments routes
app.use('/api/appointments', appointmentsRoutes);
// Contact routes
app.use('/api/contact', contactRoutes);
// Designs routes
app.use('/api/designs', designsRouter);
// Perfumes routes
app.use('/api/perfumes', perfumesRouter);
// AI Recommendations route
app.use('/api/ai-recommendations', aiRecommendationsRouter);
// Auth routes
app.use('/api/auth', authRouter);
// User routes
app.use('/api/users', userRouter);
// Orders routes
app.use('/api/orders', ordersRouter);
// Cart routes
app.use('/api/cart', cartRoutes);
// Admin routes
app.use('/api/admin', adminRouter);
// Article (blog) routes
const articlesRouter = require('./routes/articles');
app.use('/api/articles', articlesRouter);
// Custom look request routes
app.use('/api/custom-look-request', customLookRequestRouter);
// Analytics routes
app.use('/api/v1/analytics', analyticsRouter);
app.use('/api/v1/analytics/export', exportRouter);
// Session routes
app.use('/api/session', sessionRouter);
// Page views routes
app.use('/api/v1/page-views', pageViewsRouter);
// Cart actions routes
app.use('/api/v1/cart-actions', cartActionsRouter);
// Checkout events routes
app.use('/api/v1/checkout-events', require('./routes/checkoutEvents'));
// AI recommendations routes
app.use('/api/ai-recommendations', aiRecommendationsRouter);
app.use('/api/reviews', require('./routes/reviews'));
// TODO: Add routes for fashion, e-commerce, admin, etc.

// Route to train ADEL using data from MongoDB
app.post('/api/train-adel-from-db', async (req, res) => {
  try {
    // Example: Use perfumes and orders collections for training data
    const Perfume = require('./models/Perfume');
    const Order = require('./models/Order');
    // Fetch all perfumes
    const perfumes = await Perfume.find();
    // Fetch all orders
    const orders = await Order.find();
    // Prepare training records (customize as needed)
    // For demo: use each order's cart and map to perfume name
    let records = [];
    for (const order of orders) {
      for (const item of order.cart) {
        // Example: treat 'style' and 'occasion' as unknown, use perfume name
        records.push({
          style: 'default', // Replace with actual style if available
          occasion: 'default', // Replace with actual occasion if available
          perfume: item.name
        });
      }
    }
    // Optionally, add more records from perfumes
    for (const perfume of perfumes) {
      records.push({
        style: 'default',
        occasion: 'default',
        perfume: perfume.name
      });
    }
    // Send to ML backend
    const fetch = require('node-fetch');
    const mlRes = await fetch('http://localhost:8000/api/train-adel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: records })
    });
    const mlData = await mlRes.json();
    if (!mlRes.ok) {
      return res.status(mlRes.status).json({ error: mlData.error || 'ML backend error' });
    }
    res.json({ message: 'ADEL trained with DB data', ml: mlData });
  } catch (error) {
    console.error('Error training ADEL from DB:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Forward manual ADEL training data from frontend to ML backend
app.post('/api/train-adel', async (req, res) => {
  try {
    // If request is for bulk retrain, load from bulk_training_data.json
    if (req.body && req.body.from === 'bulk') {
      const fs = require('fs');
      const path = require('path');
      const bulkPath = path.join(__dirname, '../ml-backend/bulk_training_data.json');
      const raw = fs.readFileSync(bulkPath, 'utf-8');
      const bulk = JSON.parse(raw);
      if (!bulk.data || !Array.isArray(bulk.data)) {
        return res.status(400).json({ error: 'Bulk data missing or invalid' });
      }
      // Forward to ML backend
      const fetch = require('node-fetch');
      const mlResponse = await fetch('http://localhost:8000/api/train-adel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: bulk.data })
      });
      const data = await mlResponse.json();
      if (!mlResponse.ok) {
        return res.status(mlResponse.status).json({ error: data.error || 'ML backend error' });
      }
      return res.json(data);
    }
    const mlResponse = await fetch('http://localhost:8000/api/train-adel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });
    const data = await mlResponse.json();
    if (!mlResponse.ok) {
      return res.status(mlResponse.status).json({ error: data.error || 'ML backend error' });
    }
    res.json(data);
  } catch (error) {
    console.error('Error forwarding to ML backend:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Log page views from SPA route changes
app.post('/api/log-pageview', async (req, res) => {
  try {
    const PageViewLog = require('./models/PageViewLog');
    const { page } = req.body;
    // Get or create sessionId from cookie or header
    let sessionId = req.cookies?.sessionId || req.headers['x-session-id'];
    if (!sessionId) {
      const { v4: uuidv4 } = require('uuid');
      sessionId = uuidv4();
      res.cookie && res.cookie('sessionId', sessionId, { httpOnly: true, maxAge: 1000 * 60 * 60 * 24 * 7 });
    }
    // Get user if logged in (if using JWT, decode here)
    let user = null;
    if (req.user?._id) user = req.user._id;
    // Device info
    const device = req.headers['user-agent'] || 'Unknown';
    // IP
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    await PageViewLog.create({ sessionId, user, ip, device, page });
    res.status(201).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to log page view' });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
