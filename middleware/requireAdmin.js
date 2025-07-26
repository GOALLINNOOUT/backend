// server/middleware/requireAdmin.js
module.exports = function (req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Sorry, you need admin access to perform this action.' });
  }
  next();
};
