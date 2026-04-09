const express = require('express');
const router = express.Router();
const MonthlyPayment = require('../models/MonthlyPayment');
const Student = require('../models/Student');

// Oylik to'lovni belgilash (paid/not_paid)
router.put('/:paymentId/status', async (req, res) => {
  try {
    const { status } = req.body;
    const payment = await MonthlyPayment.findByIdAndUpdate(
      req.params.paymentId,
      { 
        status,
        paidDate: status === 'paid' ? new Date() : null
      },
      { new: true }
    );
    res.json(payment);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Yangi oy uchun to'lovlarni yaratish (hamma not_paid)
router.post('/create-monthly', async (req, res) => {
  try {
    const { classId, month, year, amount } = req.body;
    
    const students = await Student.find({ class: classId });
    
    const payments = students.map(student => ({
      student: student._id,
      class: classId,
      month,
      year,
      status: 'not_paid',
      amount,
    }));

    await MonthlyPayment.insertMany(payments);
    res.status(201).json({ message: 'Oylik to\'lovlar yaratildi', count: payments.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Tolangan bo'lmagan talabalar
router.get('/unpaid/:classId', async (req, res) => {
  try {
    const { month, year } = req.query;
    const unpaidPayments = await MonthlyPayment.find({
      class: req.params.classId,
      status: 'not_paid',
      month: parseInt(month),
      year: parseInt(year),
    }).populate('student');
    
    res.json(unpaidPayments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
