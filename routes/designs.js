const express = require('express');
const Design = require('../models/Design');
const router = express.Router();
const upload = require('../utils/upload');
const path = require('path');
const esClient = require('../utils/elasticsearch');
const auth = require('../middleware/auth');
const { logAdminAction } = require('../utils/logAdminAction');

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

// Serve uploaded images statically
router.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// GET suggestions for design search (Elasticsearch)
router.get('/suggestions', async (req, res) => {
  try {
    const query = req.query.query ? req.query.query.toLowerCase() : '';
    if (!query) return res.json([]);
    // Elasticsearch query for suggestions
    const esQuery = {
      index: 'designs',
      size: 5,
      body: {
        query: {
          multi_match: {
            query,
            fields: ['title^3', 'desc'],
            fuzziness: 'AUTO',
          }
        }
      }
    };
    let hits = [];
    try {
      const result = await esClient.search(esQuery);
      hits = result.hits.hits.map(hit => hit._source);
    } catch (e) {
      // fallback to MongoDB if ES fails
      hits = await Design.find({
        $or: [
          { title: { $regex: query, $options: 'i' } },
          { desc: { $regex: query, $options: 'i' } }
        ]
      }).limit(5);
    }
    // Collect unique words from titles first, then descriptions
    const titleWords = [];
    const descWords = [];
    hits.forEach(d => {
      (d.title || '').split(/\s+/).forEach(w => {
        if (w.toLowerCase().includes(query) && !titleWords.includes(w)) titleWords.push(w);
      });
    });
    hits.forEach(d => {
      (d.desc || '').split(/\s+/).forEach(w => {
        if (w.toLowerCase().includes(query) && !titleWords.includes(w) && !descWords.includes(w)) descWords.push(w);
      });
    });
    res.json([...titleWords, ...descWords].slice(0, 10));
  } catch (err) {
    res.status(500).json({ error: 'Server error', details: err.message, stack: err.stack });
  }
});

// GET all designs (Elasticsearch with fallback)
router.get('/', async (req, res) => {
  try {
    const search = req.query.search ? req.query.search.trim() : '';
    let designs = [];
    if (search) {
      // Elasticsearch query
      const esQuery = {
        index: 'designs',
        size: 50,
        body: {
          query: {
            multi_match: {
              query: search,
              fields: ['title^3', 'desc'],
              fuzziness: 'AUTO',
            }
          },
          sort: [ { createdAt: { order: 'desc' } } ]
        }
      };
      try {
        const result = await esClient.search(esQuery);
        designs = result.hits.hits.map(hit => ({ _id: hit._id, ...hit._source }));
      } catch (e) {
        // fallback to MongoDB if ES fails
        designs = await Design.find({
          $or: [
            { title: { $regex: search, $options: 'i' } },
            { desc: { $regex: search, $options: 'i' } }
          ]
        }).sort({ createdAt: -1 });
      }
    } else {
      designs = await Design.find().sort({ createdAt: -1 });
    }
    res.json(designs);
  } catch (err) {
    res.status(500).json({ error: 'Server error', details: err.message, stack: err.stack });
  }
});

// Move this paginated route ABOVE the '/:id' route to prevent conflict
router.get('/paginated', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 6;
    const skip = (page - 1) * limit;
    const total = await Design.countDocuments();
    const designs = await Design.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    res.json({
      designs,
      total,
      page,
      pages: Math.ceil(total / limit)
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error', details: err.message, stack: err.stack });
  }
});

// GET one design
router.get('/:id', async (req, res) => {
  try {
    const design = await Design.findById(req.params.id);
    if (!design) return res.status(404).json({ error: 'Not found' });
    res.json(design);
  } catch (err) {
    res.status(500).json({ error: 'Server error', details: err.message, stack: err.stack });
  }
});

// CREATE a design with image upload (admin only)
router.post('/', auth, requireAdmin, upload.array('images', 5), async (req, res) => {
  try {
    const { title, desc, details, sizes, categories, colors } = req.body;
    const imgs = req.files ? req.files.map(f => `/api/designs/uploads/${f.filename}`) : [];
    // Parse JSON fields if sent as string
    const parsedSizes = sizes
      ? (typeof sizes === 'string' ? JSON.parse(sizes) : sizes)
      : []; // sizes is optional, default to [] if not provided
    const parsedCategories = categories ? (typeof categories === 'string' ? JSON.parse(categories) : categories) : [];
    const parsedColors = colors ? (typeof colors === 'string' ? JSON.parse(colors) : colors) : [];
    if (!parsedCategories || !Array.isArray(parsedCategories) || parsedCategories.length === 0) {
      return res.status(400).json({ error: 'At least one category is required' });
    }
    const design = new Design({
      title,
      desc,
      details,
      imgs,
      sizes: Array.isArray(parsedSizes) ? parsedSizes : [], // always array
      categories: parsedCategories,
      colors: parsedColors,
    });
    await design.save();
    await logAdminAction({ req, action: `Created design: ${design.title}` });
    res.status(201).json(design);
  } catch (err) {
    res.status(400).json({ error: 'Invalid data', details: err.message, stack: err.stack });
  }
});

// UPDATE a design (admin only)
router.put('/:id', auth, requireAdmin, upload.array('images', 5), async (req, res) => {
  try {
    const { title, desc, details, sizes, categories, colors } = req.body;
    let imgs = req.body.imgs || [];
    if (typeof imgs === 'string') imgs = [imgs]; // handle single string
    if (req.files && req.files.length > 0) {
      imgs = imgs.concat(req.files.map(f => `/api/designs/uploads/${f.filename}`));
    }
    // Parse JSON fields if sent as string
    const parsedSizes = sizes ? (typeof sizes === 'string' ? JSON.parse(sizes) : sizes) : [];
    const parsedCategories = categories ? (typeof categories === 'string' ? JSON.parse(categories) : categories) : [];
    const parsedColors = colors ? (typeof colors === 'string' ? JSON.parse(colors) : colors) : [];
    if (!parsedCategories || !Array.isArray(parsedCategories) || parsedCategories.length === 0) {
      return res.status(400).json({ error: 'At least one category is required' });
    }
    const design = await Design.findByIdAndUpdate(
      req.params.id,
      { title, desc, details, imgs, sizes: parsedSizes, categories: parsedCategories, colors: parsedColors },
      { new: true }
    );
    if (!design) return res.status(404).json({ error: 'Not found' });
    await logAdminAction({ req, action: `Updated design: ${design.title}` });
    res.json(design);
  } catch (err) {
    res.status(400).json({ error: 'Invalid data', details: err.message, stack: err.stack });
  }
});

// DELETE a design (admin only)
router.delete('/:id', auth, requireAdmin, async (req, res) => {
  try {
    const design = await Design.findByIdAndDelete(req.params.id);
    if (!design) return res.status(404).json({ error: 'Not found' });
    await logAdminAction({ req, action: `Deleted design: ${design.title}` });
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error', details: err.message, stack: err.stack });
  }
});

module.exports = router;
