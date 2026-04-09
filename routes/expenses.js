const express = require('express');
const router = express.Router();
const Expense = require('../models/Expense');

// Xarajat qo'shish
router.post('/', async (req, res) => {
  try {
    const newExpense = new Expense(req.body);
    await newExpense.save();
    res.status(201).json(newExpense);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Oy uchun barcha xarajatlar
router.get('/:classId/:month/:year', async (req, res) => {
  try {
    const { classId, month, year } = req.params;
    const expenses = await Expense.find({
      class: classId,
      month: parseInt(month),
      year: parseInt(year),
    });
    
    const totalAmount = expenses.reduce((sum, exp) => sum + exp.amount, 0);
    
    res.json({ expenses, totalAmount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
