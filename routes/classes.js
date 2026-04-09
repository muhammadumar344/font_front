const express = require('express');
const router = express.Router();
const Class = require('../models/Class');
const Student = require('../models/Student');
const MonthlyPayment = require('../models/MonthlyPayment');

// Sinf uchun hammasini chiqarish (jadval bilan)
router.get('/:classId/report', async (req, res) => {
  try {
    const { classId } = req.params;
    const { month, year } = req.query;
    
    const currentMonth = month || new Date().getMonth() + 1;
    const currentYear = year || new Date().getFullYear();

    const students = await Student.find({ class: classId });
    
    const payments = await MonthlyPayment.find({
      class: classId,
      month: currentMonth,
      year: currentYear,
    }).populate('student');

    const report = students.map(student => {
      const payment = payments.find(p => p.student._id.toString() === student._id.toString());
      return {
        student: student.name,
        studentId: student._id,
        status: payment ? payment.status : 'not_paid',
        amount: payment ? payment.amount : 0,
      };
    });

    res.json({ month: currentMonth, year: currentYear, report });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Sinf yaratish
router.post('/', async (req, res) => {
  try {
    const newClass = new Class(req.body);
    await newClass.save();
    res.status(201).json(newClass);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Barcha sinflarni chiqarish
router.get('/', async (req, res) => {
  try {
    const classes = await Class.find().populate('teacher');
    res.json(classes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
