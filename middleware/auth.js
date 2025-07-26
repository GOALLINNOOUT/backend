const jwt = require('jsonwebtoken');

module.exports = function (req, res, next) {
  // Check for token in cookie or Authorization header
  let token = req.cookies && req.cookies.token;
  if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }
  if (!token) return res.status(401).json({ error: 'You are not logged in. Please log in to continue.' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Your login session has expired or is invalid. Please log in again.' });
  }
};
