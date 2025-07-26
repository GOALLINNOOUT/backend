const Review = require('../models/Review');


// Get all reviews, or only approved if ?approved=true
exports.getReviews = async (req, res) => {
  try {
    const filter = {};
    if (req.query.approved === 'true') filter.approved = true;
    const reviews = await Review.find(filter).sort({ createdAt: -1 });
    res.json(reviews);
  } catch (err) {
    res.status(500).json({ error: 'Oops! We could not fetch reviews. Please try again later.' });
  }
};

// Post a new review
exports.createReview = async (req, res) => {
  try {
    const { name, review, rating } = req.body;
    if (!name || !review) {
      return res.status(400).json({ error: 'Please provide both your name and review.' });
    }
    const newReview = new Review({ name, review, rating });
    await newReview.save();
    res.status(201).json(newReview);
  } catch (err) {
    res.status(500).json({ error: 'Oops! We could not submit your review. Please try again later.' });
  }
};

// Approve a review
exports.approveReview = async (req, res) => {
  try {
    const review = await Review.findByIdAndUpdate(req.params.id, { approved: true }, { new: true });
    if (!review) return res.status(404).json({ error: 'Sorry, we could not find the requested review.' });
    res.json(review);
  } catch (err) {
    res.status(500).json({ error: 'Oops! We could not approve the review. Please try again later.' });
  }
};

// Delete a review
exports.deleteReview = async (req, res) => {
  try {
    const review = await Review.findByIdAndDelete(req.params.id);
    if (!review) return res.status(404).json({ error: 'Sorry, we could not find the requested review.' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Oops! We could not delete the review. Please try again later.' });
  }
};
