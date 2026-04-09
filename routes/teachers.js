const express = require('express');
const router = express.Router();
const Teacher = require('../models/Teacher');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// ✅ Teacher ro'yxatdan o'tish
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Ism, email va parol majburiy' });
    }

    const existingTeacher = await Teacher.findOne({ email });
    if (existingTeacher) {
      return res.status(400).json({ error: 'Bu email allaqachon ro\'yxatdan o\'tgan' });
    }

    const newTeacher = new Teacher({ name, email, password, phone });
    await newTeacher.save();

    res.status(201).json({ message: 'Teacher muvaffaqiyatli ro\'yxatdan o\'tdi' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ✅ Teacher login — JWT_SECRET_KEY to'g'irlandi
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email va parol majburiy' });
    }

    const teacher = await Teacher.findOne({ email });
    if (!teacher) {
      return res.status(401).json({ error: 'Email yoki parol noto\'g\'ri' });
    }

    const isPasswordValid = await bcrypt.compare(password, teacher.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Email yoki parol noto\'g\'ri' });
    }

    const token = jwt.sign(
      { id: teacher._id, email: teacher.email },
      process.env.JWT_SECRET_KEY, // ✅ .env dagi nom bilan bir xil
      { expiresIn: '24h' }
    );

    res.json({
      token,
      teacher: {
        id: teacher._id,
        name: teacher.name,
        email: teacher.email,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ✅ Barcha teacherlarni ko'rish
router.get('/', async (req, res) => {
  try {
    const teachers = await Teacher.find().select('-password');
    res.json(teachers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;