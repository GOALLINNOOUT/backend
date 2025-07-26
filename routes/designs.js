const express = require('express');
const Design = require('../models/Design');
const router = express.Router();
const cloudinaryUpload = require('../utils/cloudinaryUpload');
const deleteCloudinaryImage = require('../utils/cloudinaryDelete');
const extractCloudinaryPublicId = require('../utils/extractCloudinaryPublicId');
const path = require('path');
const esClient = require('../utils/elasticsearch');
const auth = require('../middleware/auth');
const { logAdminAction } = require('../utils/logAdminAction');

// Admin role check middleware
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Sorry, you need admin access to perform this action.' });
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

// No longer serve local uploads; all images are on Cloudinary

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

// GET suggestions for design search (MongoDB, typo-tolerant)
router.get('/suggestions', async (req, res) => {
  try {
    const query = req.query.query ? req.query.query.toLowerCase() : '';
    if (!query) return res.json([]);
    // Broad regex to get candidates
    const candidates = await Design.find({
      $or: [
        { title: { $regex: query, $options: 'i' } },
        { desc: { $regex: query, $options: 'i' } }
      ]
    }).limit(20);
    // Fuzzy match and collect unique words from titles and descriptions
    const titleWords = [];
    const descWords = [];
    const maxDist = query.length <= 4 ? 1 : query.length <= 6 ? 2 : 3;
    candidates.forEach(d => {
      (d.title || '').split(/\s+/).forEach(w => {
        if (!titleWords.includes(w)) {
          const dist = levenshtein(w.toLowerCase(), query);
          if (w.toLowerCase().includes(query) || dist <= maxDist) titleWords.push(w);
        }
      });
    });
    candidates.forEach(d => {
      (d.desc || '').split(/\s+/).forEach(w => {
        if (!titleWords.includes(w) && !descWords.includes(w)) {
          const dist = levenshtein(w.toLowerCase(), query);
          if (w.toLowerCase().includes(query) || dist <= maxDist) descWords.push(w);
        }
      });
    });
    res.json([...titleWords, ...descWords].slice(0, 10));
  } catch (err) {
    res.status(500).json({ error: 'Oops! Something went wrong. Please try again later.' });
  }
});

// GET all designs (MongoDB, typo-tolerant search)
router.get('/', async (req, res) => {
  try {
    const search = req.query.search ? req.query.search.trim() : '';
    let designs = [];
    if (search) {
      // Broad regex to get candidates
      const candidates = await Design.find({
        $or: [
          { title: { $regex: search, $options: 'i' } },
          { desc: { $regex: search, $options: 'i' } }
        ]
      }).sort({ createdAt: -1 });
      // Fuzzy filter
      const maxDist = search.length <= 4 ? 1 : search.length <= 6 ? 2 : 3;
      let scored = [];
      candidates.forEach(d => {
        let minScore = Infinity;
        (d.title || '').split(/\s+/).forEach(word => {
          const dist = levenshtein(word.toLowerCase(), search.toLowerCase());
          if (dist < minScore) minScore = dist;
        });
        (d.desc || '').split(/\s+/).forEach(word => {
          const dist = levenshtein(word.toLowerCase(), search.toLowerCase());
          if (dist < minScore) minScore = dist;
        });
        if (minScore <= maxDist) {
          scored.push({ design: d, score: minScore });
        }
      });
      scored.sort((a, b) => a.score - b.score);
      designs = scored.map(s => s.design);
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
    if (!design) return res.status(404).json({ error: 'Sorry, we could not find the requested design.' });
    res.json(design);
  } catch (err) {
    res.status(500).json({ error: 'Server error', details: err.message, stack: err.stack });
  }
});

// CREATE a design with image upload (admin only)
router.post('/', auth, requireAdmin, cloudinaryUpload.array('images', 5), async (req, res) => {
  try {
    const { title, desc, details, sizes, categories, colors } = req.body;
    // Store Cloudinary URLs
    const imgs = req.files ? req.files.map(f => f.path) : [];
    // Parse JSON fields if sent as string
    const parsedSizes = sizes
      ? (typeof sizes === 'string' ? JSON.parse(sizes) : sizes)
      : [];
    const parsedCategories = categories ? (typeof categories === 'string' ? JSON.parse(categories) : categories) : [];
    const parsedColors = colors ? (typeof colors === 'string' ? JSON.parse(colors) : colors) : [];
    if (!parsedCategories || !Array.isArray(parsedCategories) || parsedCategories.length === 0) {
      return res.status(400).json({ error: 'Please select at least one category for your design.' });
    }
    const design = new Design({
      title,
      desc,
      details,
      imgs,
      sizes: Array.isArray(parsedSizes) ? parsedSizes : [],
      categories: parsedCategories,
      colors: parsedColors,
    });
    await design.save();
    await logAdminAction({ req, action: `Created design: ${design.title}` });
    res.status(201).json(design);
  } catch (err) {
    res.status(400).json({ error: 'The data provided is invalid. Please check your input and try again.' });
  }
});

// UPDATE a design (admin only)
router.put('/:id', auth, requireAdmin, cloudinaryUpload.array('images', 5), async (req, res) => {
  try {
    const { title, desc, details, sizes, categories, colors } = req.body;
    let imgs = req.body.imgs || [];
    if (typeof imgs === 'string') imgs = [imgs];
    if (req.files && req.files.length > 0) {
      imgs = imgs.concat(req.files.map(f => f.path));
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
    // Delete all images from Cloudinary
    if (Array.isArray(design.imgs)) {
      for (const url of design.imgs) {
        const publicId = extractCloudinaryPublicId(url);
        if (publicId) await deleteCloudinaryImage(publicId);
      }
    }
    await logAdminAction({ req, action: `Deleted design: ${design.title}` });
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error', details: err.message, stack: err.stack });
  }
});

module.exports = router;
