const express = require('express');
const router = express.Router();
const Article = require('../models/Article');
const cloudinaryUpload = require('../utils/cloudinaryUpload');
const deleteCloudinaryImage = require('../utils/cloudinaryDelete');
const extractCloudinaryPublicId = require('../utils/extractCloudinaryPublicId');
const auth = require('../middleware/auth');
const requireAdmin = require('../middleware/requireAdmin');
const { logAdminAction } = require('../utils/logAdminAction');

// Use Cloudinary for image uploads

// Create Article
router.post('/', auth, requireAdmin, cloudinaryUpload.single('image'), async (req, res) => {
  try {
    const { title, content, author, tags, published, image } = req.body;
    // Use image from body if present, otherwise from uploaded file
    const imageField = image || (req.file ? req.file.path : undefined);
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
router.post('/uploads', cloudinaryUpload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    res.status(201).json({ url: req.file.path });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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

// Get all articles (with pagination and typo-tolerant search)
router.get('/', async (req, res) => {
  try {
    const skip = parseInt(req.query.skip) || 0;
    const limit = parseInt(req.query.limit) || 6;
    const searchField = req.query.searchField || 'title';
    const searchQuery = req.query.searchQuery ? req.query.searchQuery.trim() : '';
    let query = {};
    let articles = [];
    let total = 0;
    if (searchQuery) {
      // Broad regex to get candidates
      let mongoQuery;
      if (searchField === 'tags') {
        mongoQuery = { tags: { $elemMatch: { $regex: searchQuery, $options: 'i' } } };
      } else if (searchField === 'author') {
        mongoQuery = { author: { $regex: searchQuery, $options: 'i' } };
      } else {
        mongoQuery = { title: { $regex: searchQuery, $options: 'i' } };
      }
      const candidates = await Article.find(mongoQuery).sort({ createdAt: -1 });
      // Fuzzy filter
      const maxDist = searchQuery.length <= 4 ? 1 : searchQuery.length <= 6 ? 2 : 3;
      let scored = [];
      candidates.forEach(a => {
        let fieldValue = '';
        if (searchField === 'tags' && Array.isArray(a.tags)) {
          fieldValue = a.tags.join(' ');
        } else if (searchField === 'author') {
          fieldValue = a.author || '';
        } else {
          fieldValue = a.title || '';
        }
        // Split into words and check each
        let minScore = Infinity;
        fieldValue.split(/\s+/).forEach(word => {
          const dist = levenshtein(word.toLowerCase(), searchQuery.toLowerCase());
          if (dist < minScore) minScore = dist;
        });
        if (minScore <= maxDist) {
          scored.push({ article: a, score: minScore });
        }
      });
      scored.sort((a, b) => a.score - b.score);
      articles = scored.slice(skip, skip + limit).map(s => s.article);
      total = scored.length;
    } else {
      articles = await Article.find().sort({ createdAt: -1 }).skip(skip).limit(limit);
      total = await Article.countDocuments();
    }
    res.json({ articles, total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Suggestions endpoint for article search with typo tolerance
router.get('/suggestions', async (req, res) => {
  try {
    const query = req.query.query ? req.query.query.trim() : '';
    const field = req.query.field || 'title';
    if (!query) return res.json([]);
    let articles;
    const regex = new RegExp(query, 'i');
    if (field === 'tags') {
      articles = await Article.find({ tags: { $regex: regex } }).limit(20).select('tags');
    } else if (field === 'author') {
      articles = await Article.find({ author: regex }).limit(20).select('author');
    } else {
      articles = await Article.find({ title: regex }).limit(20).select('title');
    }
    // Collect unique suggestions with fuzzy match
    const suggestionsSet = new Set();
    const maxDist = query.length <= 4 ? 1 : query.length <= 6 ? 2 : 3;
    articles.forEach(a => {
      if (field === 'tags' && Array.isArray(a.tags)) {
        a.tags.forEach(tag => {
          if (tag) {
            const dist = levenshtein(tag.toLowerCase(), query.toLowerCase());
            if (dist <= maxDist) suggestionsSet.add(tag);
          }
        });
      } else if (field === 'author' && a.author) {
        const dist = levenshtein(a.author.toLowerCase(), query.toLowerCase());
        if (dist <= maxDist) suggestionsSet.add(a.author);
      } else if (field === 'title' && a.title) {
        const dist = levenshtein(a.title.toLowerCase(), query.toLowerCase());
        if (dist <= maxDist) suggestionsSet.add(a.title);
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
router.put('/:id', auth, requireAdmin, cloudinaryUpload.single('image'), async (req, res) => {
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
      update.image = req.file.path;
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
    // Delete image from Cloudinary
    if (article.image) {
      const publicId = extractCloudinaryPublicId(article.image);
      if (publicId) await deleteCloudinaryImage(publicId);
    }
    await logAdminAction({ req, action: `Deleted article: ${article.title}` });
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
