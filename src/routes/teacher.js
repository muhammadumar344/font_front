// src/routes/teacher.js
const express = require('express')
const router = express.Router()
const ctrl = require('../controllers/teacherController')
const telegramCtrl = require('../controllers/telegramController')
const auth = require('../middleware/auth')
const roles = require('../middleware/roles')

// Barcha teacher routelari autentifikatsiya talab qiladi
router.use(auth, roles('teacher'))

// ── Dashboard ─────────────────────────────────────────────────
router.get('/dashboard',                            ctrl.getDashboard)

// ── Subscription ──────────────────────────────────────────────
router.get('/subscription',                         ctrl.getSubscriptionInfo)

// ── Classes ───────────────────────────────────────────────────
router.post('/classes',                             ctrl.createClass)
router.get('/classes',                              ctrl.getMyClasses)
router.put('/classes/:classId/amount',              ctrl.updateClassDefaultAmount)
router.put('/classes/:classId/initial-balance',     ctrl.updateInitialBalance)
router.delete('/classes/:classId',                  ctrl.deleteClass)

// ── Students ──────────────────────────────────────────────────
router.post('/classes/:classId/students',           ctrl.addStudent)
router.get('/classes/:classId/students',            ctrl.getClassStudents)
router.delete('/students/:studentId',               ctrl.deleteStudent)

// ── Payments ──────────────────────────────────────────────────
// ⚠️ Aniq routelar parametrli routelardan OLDIN yoziladi
router.post('/payments/create-monthly',             ctrl.createMonthlyPayments)
router.get('/payments/class/:classId',              ctrl.getClassPayments)
router.get('/payments',                             ctrl.getMonthlyPayments)
router.put('/payments/:paymentId/status',           ctrl.updatePaymentStatus)

// ── Monthly Reminder (Pro/Premium) ────────────────────────────
router.get('/reminder',                             ctrl.getMonthlyReminder)

// ── SMS Reminder (Premium) ────────────────────────────────────
// router.post('/sms-reminder/send',                   ctrl.sendSmsReminders)

// ── Export (Premium) ──────────────────────────────────────────
router.get('/export/:classId',                      ctrl.exportPayments)

// ── Expenses ──────────────────────────────────────────────────
router.post('/expenses',                            ctrl.addExpense)
router.get('/expenses',                             ctrl.getExpenses)
router.delete('/expenses/:expenseId',               ctrl.deleteExpense)

// ── Telegram Bot ──────────────────────────────────────────────
router.get('/telegram/bot-link',                    telegramCtrl.getBotLink)
router.get('/telegram/parents',                     telegramCtrl.getParents)
router.get('/telegram/parents/class/:classId',      telegramCtrl.getParentsByClass)
router.post('/telegram/send-reminders',             telegramCtrl.sendRemindersNow)

module.exports = router