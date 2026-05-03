// src/middleware/auth.js
const jwt = require('jsonwebtoken')

const JWT_SECRET = process.env.JWT_SECRET || 'fond-school-secret-2024'

module.exports = (req, res, next) => {
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token topilmadi' })
  }

  const token = authHeader.split(' ')[1]

  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    req.user = { id: decoded.id, role: decoded.role }
    next()
  } catch (err) {
    return res.status(401).json({ error: 'Token yaroqsiz yoki muddati tugagan' })
  }
}