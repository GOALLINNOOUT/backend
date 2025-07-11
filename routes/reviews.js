const express = require('express');
const router = express.Router();
const { getReviews, createReview, approveReview, deleteReview } = require('../controllers/reviewController');

// GET /api/reviews
router.get('/', getReviews);

// POST /api/reviews
router.post('/', createReview);


// PATCH /api/reviews/:id/approve
router.patch('/:id/approve', approveReview);

// DELETE /api/reviews/:id
router.delete('/:id', deleteReview);

module.exports = router;
