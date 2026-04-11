// src/controllers/authController.js
const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const Teacher = require('../models/Teacher');

const generateToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_SECRET_KEY || 'secret-key', { expiresIn: '30d' });
};

exports.adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email va parol majburiy' });
    }

    const admin = await Admin.findOne({ email }).select('+password');
    if (!admin) {
      return res.status(401).json({ error: 'Email yoki parol noto\'g\'ri' });
    }

    const isValid = await admin.comparePassword(password);
    if (!isValid) {
      return res.status(401).json({ error: 'Email yoki parol noto\'g\'ri' });
    }

    const token = generateToken({ id: admin._id, email: admin.email, role: 'admin' });

    res.json({
      token,
      user: { id: admin._id, name: admin.name, email: admin.email, role: 'admin' },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.teacherLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email va parol majburiy' });
    }

    const teacher = await Teacher.findOne({ email }).select('+password');
    if (!teacher) {
      return res.status(401).json({ error: 'Email yoki parol noto\'g\'ri' });
    }

    if (teacher.selfDeactivated) {
      return res.status(403).json({
        error: 'self_deactivated',
        message: 'Sizning akkauntingiz o\'chirilgan',
      });
    }

    if (!teacher.isActive) {
      return res.status(403).json({ error: 'Akkauntingiz bloklangan' });
    }

    const isValid = await teacher.comparePassword(password);
    if (!isValid) {
      return res.status(401).json({ error: 'Email yoki parol noto\'g\'ri' });
    }

    const now = new Date();
    const isExpired = teacher.subscriptionExpiryDate < now;

    if (!teacher.subscriptionIsActive || isExpired) {
      return res.status(403).json({
        error: 'subscription_expired',
        message: 'Saytdan foydalanish vaqtingiz tugadi. Iltimos to\'lov qiling',
        daysLeft: 0,
      });
    }

    const token = generateToken({ id: teacher._id, email: teacher.email, role: 'teacher', plan: teacher.plan });

    res.json({
      token,
      user: { id: teacher._id, name: teacher.name, email: teacher.email, role: 'teacher', plan: teacher.plan },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getMe = async (req, res) => {
  try {
    const { id, role } = req.user;
    let user;

    if (role === 'admin') {
      user = await Admin.findById(id).select('-password');
    } else {
      user = await Teacher.findById(id).select('-password');
    }

    if (!user) return res.status(404).json({ error: 'Foydalanuvchi topilmadi' });

    res.json({ user: { ...user.toObject(), role } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};