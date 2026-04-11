// src/middleware/adminMiddleware.js
const adminMiddleware = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Faqat admin uchun ruxsat' });
  }
  next();
};

module.exports = adminMiddleware;