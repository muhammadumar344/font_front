// src/controllers/authController.js
const jwt = require('jsonwebtoken')
const Admin = require('../models/Admin')
const Teacher = require('../models/Teacher')

// ✅ Barcha controllerlar shu JWT_SECRET dan foydalanadi — .env da belgilang
const JWT_SECRET = process.env.JWT_SECRET || 'fond-school-secret-2024'

const generateToken = (id, role) => {
  return jwt.sign({ id, role }, JWT_SECRET, { expiresIn: '30d' })
}

// Setup tekshirish (admin yaratilganmi?)
exports.checkSetup = async (req, res) => {
  try {
    const admin = await Admin.findOne()
    res.json({ setupRequired: !admin })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// Birinchi admin yaratish (faqat bir marta, setup vaqtida)
exports.createAdmin = async (req, res) => {
  try {
    const existing = await Admin.findOne()
    if (existing) {
      return res.status(400).json({ error: 'Admin allaqachon mavjud' })
    }

    const { name, email, password } = req.body

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Ism majburiy' })
    }
    if (!email || !email.trim()) {
      return res.status(400).json({ error: 'Email majburiy' })
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ error: "Parol kamita 6 belgidan iborat bo'lishi kerak" })
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: "Email to'g'ri formatda emas" })
    }

    const admin = new Admin({ name: name.trim(), email: email.toLowerCase(), password })
    await admin.save()

    const token = generateToken(admin._id, 'admin')

    res.status(201).json({
      message: 'Admin muvaffaqiyatli yaratildi',
      token,
      admin: { id: admin._id, name: admin.name, email: admin.email, role: 'admin' },
    })
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ error: "Bu email allaqachon ro'yxatdan o'tgan" })
    }
    res.status(500).json({ error: err.message })
  }
}

// Admin login
exports.adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({ error: 'Email va parol majburiy' })
    }

    const admin = await Admin.findOne({ email }).select('+password')
    if (!admin || !(await admin.comparePassword(password))) {
      return res.status(401).json({ error: "Email yoki parol noto'g'ri" })
    }

    const token = generateToken(admin._id, 'admin')

    res.json({
      token,
      user: { id: admin._id, name: admin.name, email: admin.email, role: 'admin' },
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// Teacher login
exports.teacherLogin = async (req, res) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({ error: 'Email va parol majburiy' })
    }

    const teacher = await Teacher.findOne({ email }).select('+password')
    if (!teacher || !(await teacher.comparePassword(password))) {
      return res.status(401).json({ error: "Email yoki parol noto'g'ri" })
    }

    if (!teacher.isActive) {
      return res.status(403).json({ error: 'Akkaunt bloklangan' })
    }

    const token = generateToken(teacher._id, 'teacher')

    res.json({
      token,
      user: {
        id: teacher._id,
        name: teacher.name,
        email: teacher.email,
        role: 'teacher',
        plan: teacher.plan,
        planActive: teacher.isPlanActive(),
        daysLeft: teacher.daysLeft(),
      },
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}