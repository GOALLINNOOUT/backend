const express = require('express');
const router = express.Router();
const aiRecommendationController = require('../controllers/aiRecommendationController');

router.get('/perfumes', aiRecommendationController.getRecommendationPerfumes);

module.exports = router;
