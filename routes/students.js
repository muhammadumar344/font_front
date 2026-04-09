const express = require('express');
const router = express.Router();
const Student = require('../models/Student');

// Talaba qo'shish
router.post('/', async (req, res) => {
  try {
    const newStudent = new Student(req.body);
    await newStudent.save();
    res.status(201).json(newStudent);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Sinf uchun talabalarn chiqarish
router.get('/class/:classId', async (req, res) => {
  try {
    const students = await Student.find({ class: req.params.classId });
    res.json(students);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Hamma talabalarn chiqarish
router.get('/', async (req, res) => {
  try {
    const students = await Student.find().populate('class');
    res.json(students);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
