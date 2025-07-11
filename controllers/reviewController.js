const Review = require('../models/Review');


// Get all reviews, or only approved if ?approved=true
exports.getReviews = async (req, res) => {
  try {
    const filter = {};
    if (req.query.approved === 'true') filter.approved = true;
    const reviews = await Review.find(filter).sort({ createdAt: -1 });
    res.json(reviews);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch reviews' });
  }
};

// Post a new review
exports.createReview = async (req, res) => {
  try {
    const { name, review, rating } = req.body;
    if (!name || !review) {
      return res.status(400).json({ error: 'Name and review are required' });
    }
    const newReview = new Review({ name, review, rating });
    await newReview.save();
    res.status(201).json(newReview);
  } catch (err) {
    res.status(500).json({ error: 'Failed to submit review' });
  }
};

// Approve a review
exports.approveReview = async (req, res) => {
  try {
    const review = await Review.findByIdAndUpdate(req.params.id, { approved: true }, { new: true });
    if (!review) return res.status(404).json({ error: 'Review not found' });
    res.json(review);
  } catch (err) {
    res.status(500).json({ error: 'Failed to approve review' });
  }
};

// Delete a review
exports.deleteReview = async (req, res) => {
  try {
    const review = await Review.findByIdAndDelete(req.params.id);
    if (!review) return res.status(404).json({ error: 'Review not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete review' });
  }
};
