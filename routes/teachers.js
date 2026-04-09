const express = require('express');
const router = express.Router();
const Teacher = require('../models/Teacher');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// Teacher ro'yxatdan o'tish
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;
    
    const existingTeacher = await Teacher.findOne({ email });
    if (existingTeacher) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    const newTeacher = new Teacher({ name, email, password, phone });
    await newTeacher.save();
    
    res.status(201).json({ message: 'Teacher registered successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Teacher login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const teacher = await Teacher.findOne({ email });
    if (!teacher) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isPasswordValid = await bcrypt.compare(password, teacher.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: teacher._id, email: teacher.email },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({ token, teacher: { id: teacher._id, name: teacher.name, email: teacher.email } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
