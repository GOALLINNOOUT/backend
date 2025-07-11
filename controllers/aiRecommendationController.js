const Perfume = require('../models/Perfume');

// Get relevant perfumes for AI recommendations
exports.getRecommendationPerfumes = async (req, res) => {
  try {
    // Get all available perfumes with their details
    const perfumes = await Perfume.find({ stock: { $gt: 0 } })
      .select('name description price categories')
      .lean();

    // Format perfumes for AI context
    const formattedPerfumes = perfumes.map(p => ({
      name: p.name,
      description: p.description,
      price: p.price,
      categories: p.categories.join(', ')
    }));

    res.json(formattedPerfumes);
  } catch (error) {
    console.error('Error fetching perfumes for recommendations:', error);
    res.status(500).json({ message: 'Error fetching perfume recommendations' });
  }
};
