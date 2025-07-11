const express = require('express');
const router = express.Router();
const Article = require('../models/Article');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const auth = require('../middleware/auth');
const requireAdmin = require('../middleware/requireAdmin');
const { logAdminAction } = require('../utils/logAdminAction');

// Multer setup for image uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath);
    }
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, ''));
  },
});
const upload = multer({ storage });

// Create Article
router.post('/', auth, requireAdmin, upload.single('image'), async (req, res) => {
  try {
    const { title, content, author, tags, published, image } = req.body;
    // Use image from body if present, otherwise from uploaded file
    const imageField = image || (req.file ? req.file.filename : undefined);
    const article = new Article({
      title,
      content,
      author,
      tags: tags ? (Array.isArray(tags) ? tags : tags.split(',')) : [],
      published,
      image: imageField,
    });
    await article.save();
    await logAdminAction({ req, action: `Created article: ${article.title}` });
    res.status(201).json(article);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Upload image only (no article creation)
router.post('/uploads', upload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    res.status(201).json({ filename: req.file.filename, url: `/uploads/${req.file.filename}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all articles (with pagination and search)
router.get('/', async (req, res) => {
  try {
    const skip = parseInt(req.query.skip) || 0;
    const limit = parseInt(req.query.limit) || 6;
    // Updated: support searchField and searchQuery
    const searchField = req.query.searchField || 'title';
    const searchQuery = req.query.searchQuery ? req.query.searchQuery.trim() : '';
    let query = {};
    if (searchQuery) {
      if (searchField === 'tags') {
        query.tags = { $elemMatch: { $regex: searchQuery, $options: 'i' } };
      } else if (searchField === 'author') {
        query.author = { $regex: searchQuery, $options: 'i' };
      } else {
        // Default to title
        query.title = { $regex: searchQuery, $options: 'i' };
      }
    }
    const articles = await Article.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    const total = await Article.countDocuments(query);
    res.json({ articles, total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Suggestions endpoint for article search
router.get('/suggestions', async (req, res) => {
  try {
    const query = req.query.query ? req.query.query.trim() : '';
    const field = req.query.field || 'title';
    if (!query) return res.json([]);
    let articles;
    const regex = new RegExp(query, 'i');
    if (field === 'tags') {
      articles = await Article.find({ tags: { $regex: regex } })
        .limit(8)
        .select('tags');
    } else if (field === 'author') {
      articles = await Article.find({ author: regex })
        .limit(8)
        .select('author');
    } else {
      // Default to title
      articles = await Article.find({ title: regex })
        .limit(8)
        .select('title');
    }
    // Collect unique suggestions
    const suggestionsSet = new Set();
    articles.forEach(a => {
      if (field === 'tags' && Array.isArray(a.tags)) {
        a.tags.forEach(tag => {
          if (tag && tag.toLowerCase().includes(query.toLowerCase())) suggestionsSet.add(tag);
        });
      } else if (field === 'author' && a.author && a.author.toLowerCase().includes(query.toLowerCase())) {
        suggestionsSet.add(a.author);
      } else if (field === 'title' && a.title && a.title.toLowerCase().includes(query.toLowerCase())) {
        suggestionsSet.add(a.title);
      }
    });
    res.json(Array.from(suggestionsSet).slice(0, 8));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single article
router.get('/:id', async (req, res) => {
  try {
    const article = await Article.findById(req.params.id);
    if (!article) return res.status(404).json({ error: 'Not found' });
    res.json(article);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update article
router.put('/:id', auth, requireAdmin, upload.single('image'), async (req, res) => {
  try {
    const { title, content, author, tags, published } = req.body;
    const update = {
      title,
      content,
      author,
      tags: tags ? tags.split(',') : [],
      published,
      updatedAt: Date.now(),
    };
    if (req.file) {
      update.image = req.file.filename;
    }
    const article = await Article.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!article) return res.status(404).json({ error: 'Not found' });
    await logAdminAction({ req, action: `Updated article: ${article.title}` });
    res.json(article);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete article
router.delete('/:id', auth, requireAdmin, async (req, res) => {
  try {
    const article = await Article.findByIdAndDelete(req.params.id);
    if (!article) return res.status(404).json({ error: 'Not found' });
    await logAdminAction({ req, action: `Deleted article: ${article.title}` });
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
