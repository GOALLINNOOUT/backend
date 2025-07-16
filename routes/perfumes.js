const express = require('express');
const router = express.Router();
const Perfume = require('../models/Perfume');
const Order = require('../models/Order');
const CartActionLog = require('../models/CartActionLog');
const cloudinaryUpload = require('../utils/cloudinaryUpload');
const path = require('path');
const esClient = require('../utils/elasticsearch');
const auth = require('../middleware/auth');
const { logAdminAction } = require('../utils/logAdminAction');
const deleteImage = require('../utils/cloudinaryDelete');
const extractCloudinaryPublicId = require('../utils/extractCloudinaryPublicId');

// DELETE a perfume image (admin only)
router.delete('/:id/image', auth, requireAdmin, async (req, res) => {
  try {
    const { publicId } = req.body;
    if (!publicId) return res.status(400).json({ error: 'Missing publicId' });
    // Delete from Cloudinary
    const result = await deleteImage(publicId);
    if (result.result !== 'ok') return res.status(500).json({ error: 'Failed to delete image from Cloudinary', details: result });
    // Remove from perfume's images array
    const perfume = await Perfume.findByIdAndUpdate(
      req.params.id,
      { $pull: { images: { $regex: publicId } } },
      { new: true }
    );
    if (!perfume) return res.status(404).json({ error: 'Perfume not found' });
    await logAdminAction({ req, action: `Deleted image from perfume: ${perfume.name}` });
    res.json({ success: true, perfume });
  } catch (err) {
    res.status(500).json({ error: 'Server error', details: err.message, stack: err.stack });
  }
});


// Serve uploaded images statically
router.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Admin role check middleware
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// Optional auth for public/checkout endpoints
function optionalAuth(req, res, next) {
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    return auth(req, res, next);
  }
  next();
}

// Utility: Levenshtein distance for fuzzy matching
function levenshtein(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1).toLowerCase() === a.charAt(j - 1).toLowerCase()) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

// GET suggestions for perfume search
router.get('/suggestions', async (req, res) => {
  try {
    const query = req.query.query ? req.query.query.toLowerCase() : '';
    if (!query) return res.json([]);
    // Search names and descriptions for suggestions
    const perfumes = await Perfume.find({
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { description: { $regex: query, $options: 'i' } }
      ]
    }).limit(5);
    // Collect unique words from names first, then descriptions, with fuzzy match and scoring
    const nameWords = [];
    const descWords = [];
    const nameScores = {};
    const descScores = {};
    const isFuzzyMatch = (word, q) => {
      const w = word.toLowerCase();
      if (w.includes(q)) return true;
      // Fuzzy: allow Levenshtein distance <= 2 for short queries, <= 3 for longer
      const maxDist = q.length <= 4 ? 1 : q.length <= 6 ? 2 : 3;
      return levenshtein(w, q) <= maxDist;
    };
    // Collect name-based suggestions with scores
    perfumes.forEach(p => {
      p.name.split(/\s+/).forEach(w => {
        const lw = w.toLowerCase();
        if (isFuzzyMatch(lw, query) && !nameWords.includes(w)) {
          nameWords.push(w);
          // Score: 0 if startsWith, 1 if includes, else Levenshtein
          if (lw.startsWith(query)) nameScores[w] = 0;
          else if (lw.includes(query)) nameScores[w] = 1;
          else nameScores[w] = levenshtein(lw, query) + 2;
        }
      });
    });
    // Collect description-based suggestions with scores, skipping any already in nameWords
    perfumes.forEach(p => {
      p.description.split(/\s+/).forEach(w => {
        const lw = w.toLowerCase();
        if (isFuzzyMatch(lw, query) && !nameWords.includes(w) && !descWords.includes(w)) {
          descWords.push(w);
          if (lw.startsWith(query)) descScores[w] = 0;
          else if (lw.includes(query)) descScores[w] = 1;
          else descScores[w] = levenshtein(lw, query) + 2;
        }
      });
    });
    // Sort by score (lower is better)
    const sortedNameWords = nameWords.sort((a, b) => nameScores[a] - nameScores[b]);
    const sortedDescWords = descWords.sort((a, b) => descScores[a] - descScores[b]);
    // Return up to 10 suggestions, prioritizing name/title words, all sorted by best match
    res.json([...sortedNameWords, ...sortedDescWords].slice(0, 10));
  } catch (err) {
    res.status(500).json({ error: 'Server error', details: err.message, stack: err.stack });
  }
});

// GET all perfumes with pagination and Elasticsearch search
router.get('/', async (req, res) => {
  try {
    const page = Math.max(1, Math.min(parseInt(req.query.page) || 1, 120));
    const limit = Math.max(1, Math.min(parseInt(req.query.limit) || 3, 6));
    const skip = (page - 1) * limit;
    const search = req.query.search ? req.query.search.trim() : '';
    const category = req.query.category && req.query.category !== 'all' ? req.query.category : null;

    let query = {};
    if (search && category) {
      query = {
        $and: [
          {
            $or: [
              { name: { $regex: search, $options: 'i' } },
              { description: { $regex: search, $options: 'i' } },
              { categories: { $regex: search, $options: 'i' } }
            ]
          },
          { categories: category }
        ]
      };
    } else if (search) {
      query = {
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } },
          { categories: { $regex: search, $options: 'i' } }
        ]
      };
    } else if (category) {
      query = { categories: category };
    }

    let perfumes = [];
    let total = 0;
    // If search or category, use normal algorithm
    if (search || category) {
      perfumes = await Perfume.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);
      total = await Perfume.countDocuments(query);
    } else {
      // Personalized scoring if user is authenticated and has order history
      let userId = req.user && req.user._id ? req.user._id : null;
      let userPerfumeIds = [];
      let userCategories = [];
      if (userId) {
        // Get user's past orders
        const userOrders = await Order.find({ user: userId });
        userOrders.forEach(order => {
          if (order.cart && Array.isArray(order.cart)) {
            order.cart.forEach(item => {
              if (item._id) userPerfumeIds.push(item._id.toString());
            });
          }
        });
        // Get categories from user's purchased perfumes
        if (userPerfumeIds.length > 0) {
          const purchasedPerfumes = await Perfume.find({ _id: { $in: userPerfumeIds } });
          purchasedPerfumes.forEach(p => {
            if (Array.isArray(p.categories)) {
              userCategories.push(...p.categories);
            }
          });
        }
      }
      // Popularity sort: aggregate order counts, cart-adds, merge with perfumes, sort by score
      const orderCounts = await Order.aggregate([
        { $unwind: '$cart' },
        { $group: { _id: '$cart._id', orderCount: { $sum: '$cart.quantity' } } }
      ]);
      const cartAdds = await CartActionLog.aggregate([
        { $match: { action: 'add' } },
        { $group: { _id: '$productId', addCount: { $sum: 1 } } }
      ]);
      const orderCountMap = {};
      orderCounts.forEach(item => { orderCountMap[item._id] = item.orderCount; });
      const cartAddMap = {};
      cartAdds.forEach(item => { cartAddMap[item._id.toString()] = item.addCount; });
      const allPerfumes = await Perfume.find();
      const now = new Date();
      // Calculate score
      const scored = allPerfumes.map(p => {
        const orderCount = orderCountMap[p._id.toString()] || 0;
        const addCount = cartAddMap[p._id.toString()] || 0;
        let score = orderCount * 3 + (p.views || 0) + addCount * 2;
        let suggested = false;
        // Promo bonus
        if (p.promoEnabled && p.promoStart && p.promoEnd && now >= p.promoStart && now <= p.promoEnd) {
          score += 5;
        }
        // Recentness bonus (created in last 14 days)
        const daysSinceCreated = (now - p.createdAt) / (1000 * 60 * 60 * 24);
        if (daysSinceCreated <= 14) {
          score += 20;
        }
        // Stock prioritization: deprioritize out-of-stock, boost by stock
        if (p.stock <= 0) {
          score -= 1000;
        } else {
          score += Math.min(p.stock, 20);
        }
        // Personalized boost: if user has history
        if (userPerfumeIds.length > 0) {
          // Direct match: user bought this perfume before
          if (userPerfumeIds.includes(p._id.toString())) {
            score += 50; // Strong boost for previously purchased
            suggested = true;
          } else if (Array.isArray(p.categories) && p.categories.some(cat => userCategories.includes(cat))) {
            score += 30; // Moderate boost for similar category
            suggested = true;
          }
        }
        return { ...p.toObject(), orderCount, addCount, score, suggested };
      });
      scored.sort((a, b) => b.score - a.score);
      total = scored.length;
      perfumes = scored.slice(skip, skip + limit);
    }
    const hasMore = page * limit < Math.min(total, 720);
    res.json({ data: perfumes, hasMore });
  } catch (err) {
    res.status(500).json({ error: 'Server error', details: err.message, stack: err.stack });
  }
});

// GET one perfume
router.get('/:id', async (req, res) => {
  try {
    const perfume = await Perfume.findById(req.params.id);
    if (!perfume) return res.status(404).json({ error: 'Not found' });
    res.json(perfume);
  } catch (err) {
    res.status(500).json({ error: 'Server error', details: err.message, stack: err.stack });
  }
});

// CREATE a perfume (admin only)
router.post('/', auth, requireAdmin, cloudinaryUpload.array('images', 5), async (req, res) => {
  try {
    const { name, description, price, stock, mainImageIndex, promoEnabled, promoType, promoValue, promoStart, promoEnd } = req.body;
    let categories = req.body.categories || [];
    if (typeof categories === 'string') categories = [categories];
    const images = req.files ? req.files.map(f => f.path) : [];
    const perfume = new Perfume({
      name,
      description,
      price,
      stock,
      images,
      mainImageIndex: mainImageIndex || 0,
      promoEnabled: promoEnabled === 'true' || promoEnabled === true,
      promoType,
      promoValue,
      promoStart: promoStart ? new Date(promoStart) : undefined,
      promoEnd: promoEnd ? new Date(promoEnd) : undefined,
      categories
    });
    await perfume.save();
    await logAdminAction({ req, action: `Created perfume: ${perfume.name}` });
    res.status(201).json(perfume);
  } catch (err) {
    res.status(400).json({ error: 'Invalid data', details: err.message, stack: err.stack });
  }
});

// UPDATE a perfume (admin only)
router.put('/:id', auth, requireAdmin, cloudinaryUpload.array('images', 5), async (req, res) => {
  try {
    const { name, description, price, stock, mainImageIndex, promoEnabled, promoType, promoValue, promoStart, promoEnd } = req.body;
    let images = req.body.images || [];
    let categories = req.body.categories || [];
    if (typeof images === 'string') images = [images];
    if (typeof categories === 'string') categories = [categories];
    if (req.files && req.files.length > 0) {
      images = images.concat(req.files.map(f => f.path));
    }
    const update = {
      name,
      description,
      price,
      stock,
      images,
      mainImageIndex: mainImageIndex || 0,
      promoEnabled: promoEnabled === 'true' || promoEnabled === true,
      promoType,
      promoValue,
      promoStart: promoStart ? new Date(promoStart) : undefined,
      promoEnd: promoEnd ? new Date(promoEnd) : undefined,
      categories
    };
    const perfume = await Perfume.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true }
    );
    if (!perfume) return res.status(404).json({ error: 'Not found' });
    await logAdminAction({ req, action: `Updated perfume: ${perfume.name}` });
    res.json(perfume);
  } catch (err) {
    res.status(400).json({ error: 'Invalid data', details: err.message, stack: err.stack });
  }
});

// DELETE a perfume (admin only)
router.delete('/:id', auth, requireAdmin, async (req, res) => {
  try {
    const perfume = await Perfume.findByIdAndDelete(req.params.id);
    if (!perfume) return res.status(404).json({ error: 'Not found' });
    // Delete all images from Cloudinary
    if (perfume.images && perfume.images.length > 0) {
      for (const url of perfume.images) {
        const publicId = extractCloudinaryPublicId(url);
        if (publicId) {
          await require('../utils/cloudinaryDelete')(publicId);
        }
      }
    }
    await logAdminAction({ req, action: `Deleted perfume: ${perfume.name}` });
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error', details: err.message, stack: err.stack });
  }
});

// PATCH: Adjust perfume stock (admin only)
router.patch('/:id/stock', auth, requireAdmin, async (req, res) => {
  try {
    const { quantity } = req.body;
    if (!quantity || typeof quantity !== 'number' || quantity === 0) return res.status(400).json({ error: 'Invalid quantity' });
    const perfume = await Perfume.findById(req.params.id);
    if (!perfume) return res.status(404).json({ error: 'Not found' });
    if (quantity > 0) {
      if (perfume.stock < quantity) return res.status(400).json({ error: 'Not enough stock' });
      perfume.stock -= quantity;
    } else {
      perfume.stock -= quantity; // quantity is negative, so this adds
    }
    await perfume.save();
    res.json({ stock: perfume.stock });
  } catch (err) {
    res.status(500).json({ error: 'Server error', details: err.message, stack: err.stack });
  }
});

// DECREMENT perfume stock (for checkout, guest or user)
router.post('/:id/decrement-stock', optionalAuth, async (req, res) => {
  try {
    const { quantity } = req.body;
    if (!quantity || typeof quantity !== 'number' || quantity < 1) return res.status(400).json({ error: 'Invalid quantity' });
    const perfume = await Perfume.findById(req.params.id);
    if (!perfume) return res.status(404).json({ error: 'Not found' });
    if (perfume.stock < quantity) return res.status(400).json({ error: 'Not enough stock' });
    perfume.stock -= quantity;
    await perfume.save();
    res.json({ stock: perfume.stock });
  } catch (err) {
    res.status(500).json({ error: 'Server error', details: err.message, stack: err.stack });
  }
});

// Increment perfume view count
router.post('/:id/view', async (req, res) => {
  try {
    const { id } = req.params;
    await Perfume.findByIdAndUpdate(id, { $inc: { views: 1 } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to increment view count' });
  }
});

module.exports = router;
