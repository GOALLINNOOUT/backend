const jwt = require('jsonwebtoken');

function generateSetupToken(user) {
  // Expires in 1 hour
  return jwt.sign({
    _id: user._id,
    email: user.email,
    type: 'setup',
  }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

function verifySetupToken(token) {
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.type !== 'setup') throw new Error('Invalid token type');
    return payload;
  } catch (err) {
    return null;
  }
}

module.exports = { generateSetupToken, verifySetupToken };
