// src/routes/teacher.js
const express = require('express')
const router = express.Router()
const ctrl = require('../controllers/teacherController')
const auth = require('../middleware/auth')
const roles = require('../middleware/roles')

router.use(auth, roles('teacher'))

// ── Dashboard ─────────────────────────────────────────────────
router.get('/dashboard', ctrl.getDashboard)

// ── Subscription ──────────────────────────────────────────────
router.get('/subscription', ctrl.getSubscriptionInfo)

// ── Classes ───────────────────────────────────────────────────
router.post('/classes', ctrl.createClass)
router.get('/classes', ctrl.getMyClasses)
router.put('/classes/:classId/amount', ctrl.updateClassDefaultAmount)
// ✅ YANGI: Boshlang'ich balansni yangilash
router.put('/classes/:classId/initial-balance', ctrl.updateInitialBalance)
router.delete('/classes/:classId', ctrl.deleteClass)

// ── Students ──────────────────────────────────────────────────
router.post('/classes/:classId/students', ctrl.addStudent)
router.get('/classes/:classId/students', ctrl.getClassStudents)
router.delete('/students/:studentId', ctrl.deleteStudent)

// ── Payments ──────────────────────────────────────────────────
router.post('/payments/create-monthly', ctrl.createMonthlyPayments)
router.get('/payments', ctrl.getMonthlyPayments)
router.get('/payments/class/:classId', ctrl.getClassPayments)
router.put('/payments/:paymentId/status', ctrl.updatePaymentStatus)

// ── SMS Reminder ──────────────────────────────────────────────
router.post('/sms-reminder/send', ctrl.sendSmsReminders)

// ── Monthly Reminder (Pro/Premium) ────────────────────────────
router.get('/reminder', ctrl.getMonthlyReminder)

// ── Export (Premium) ──────────────────────────────────────────
router.get('/export/:classId', ctrl.exportPayments)

// ── Expenses ──────────────────────────────────────────────────
router.post('/expenses', ctrl.addExpense)
router.get('/expenses', ctrl.getExpenses)
router.delete('/expenses/:expenseId', ctrl.deleteExpense)

module.exports = router 