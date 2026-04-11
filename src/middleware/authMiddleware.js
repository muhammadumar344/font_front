// src/middleware/authMiddleware.js
const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ error: 'Token topilmadi' });
    }

    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token formati noto\'g\'ri' });
    }

    const token = authHeader.split(' ')[1];

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET_KEY || 'your-secret-key-123'
    );

    req.user = decoded;
    next();
  } catch (err) {
    console.error('Auth middleware xatosi:', err.message);
    return res.status(401).json({ error: 'Token yaroqsiz yoki muddati o\'tgan' });
  }
};

module.exports = authMiddleware;