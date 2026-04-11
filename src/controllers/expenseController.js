const Expense = require('../models/Expense')
const Class = require('../models/Class')
const MonthlyPayment = require('../models/MonthlyPayment')

const getTeacherClass = async (teacherId) => {
  return await Class.findOne({ teacher: teacherId })
}

exports.createExpense = async (req, res) => {
  try {
    if (req.user.role !== 'teacher') {
      return res.status(403).json({ error: 'Xarajat faqat teacher tomonidan qo\'shiladi' })
    }

    const { reason, amount, month, year, description } = req.body

    if (!reason || !amount || !month || !year) {
      return res.status(400).json({ error: 'reason, amount, month, year majburiy' })
    }

    if (amount <= 0) {
      return res.status(400).json({ error: 'Summa 0 dan katta bo\'lishi kerak' })
    }

    const cls = await getTeacherClass(req.user.id)
    if (!cls) return res.status(404).json({ error: 'Sizga tegishli sinf topilmadi' })

    const expense = new Expense({
      class: cls._id,
      reason,
      amount,
      month: parseInt(month),
      year: parseInt(year),
      description,
    })
    await expense.save()

    const allPaid = await MonthlyPayment.find({ class: cls._id, status: 'paid' })
    const allExpenses = await Expense.find({ class: cls._id })
    const balance =
      allPaid.reduce((s, p) => s + p.amount, 0) -
      allExpenses.reduce((s, e) => s + e.amount, 0)

    res.status(201).json({ expense, updatedBalance: balance })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

exports.getExpensesByMonth = async (req, res) => {
  try {
    const { month, year } = req.query
    const currentMonth = parseInt(month) || new Date().getMonth() + 1
    const currentYear = parseInt(year) || new Date().getFullYear()

    let classId
    if (req.user.role === 'admin') {
      classId = req.params.classId
    } else {
      const cls = await getTeacherClass(req.user.id)
      if (!cls) return res.status(404).json({ error: 'Sinf topilmadi' })
      classId = cls._id
    }

    const expenses = await Expense.find({
      class: classId,
      month: currentMonth,
      year: currentYear,
    }).sort({ createdAt: -1 })

    const totalAmount = expenses.reduce((s, e) => s + e.amount, 0)
    res.json({ month: currentMonth, year: currentYear, expenses, totalAmount })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

exports.getYearlySummary = async (req, res) => {
  try {
    const { year } = req.query
    const currentYear = parseInt(year) || new Date().getFullYear()

    let classId
    if (req.user.role === 'admin') {
      classId = req.params.classId
    } else {
      const cls = await getTeacherClass(req.user.id)
      if (!cls) return res.status(404).json({ error: 'Sinf topilmadi' })
      classId = cls._id
    }

    const expenses = await Expense.find({ class: classId, year: currentYear })
    const byMonth = Array.from({ length: 12 }, (_, i) => {
      const me = expenses.filter((e) => e.month === i + 1)
      return { month: i + 1, total: me.reduce((s, e) => s + e.amount, 0), count: me.length }
    })

    res.json({ year: currentYear, yearlyTotal: expenses.reduce((s, e) => s + e.amount, 0), byMonth })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

exports.deleteExpense = async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.expenseId)
    if (!expense) return res.status(404).json({ error: 'Xarajat topilmadi' })

    if (req.user.role === 'teacher') {
      const cls = await getTeacherClass(req.user.id)
      if (!cls || expense.class.toString() !== cls._id.toString()) {
        return res.status(403).json({ error: 'Ruxsat yo\'q' })
      }
    }

    await expense.deleteOne()

    const allPaid = await MonthlyPayment.find({ class: expense.class, status: 'paid' })
    const allExp = await Expense.find({ class: expense.class })
    const balance =
      allPaid.reduce((s, p) => s + p.amount, 0) - allExp.reduce((s, e) => s + e.amount, 0)

    res.json({ message: 'Xarajat o\'chirildi', updatedBalance: balance })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

module.exports = exports