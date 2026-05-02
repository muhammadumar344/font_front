const express = require('express')
const router = express.Router()
const ctrl = require('../controllers/teacherController')
const auth = require('../middleware/auth')
const roles = require('../middleware/roles')
const TelegramParent = require('../models/TelegramParent')
const { getBot } = require('../bot/bot')
const { sendMonthlyReminders } = require('../cron/reminderCron')

// Protect
router.use(auth, roles('teacher'))

// Dashboard
router.get('/dashboard', ctrl.getDashboard)

// Subscription
router.get('/subscription', ctrl.getSubscriptionInfo)

// Classes
router.post('/classes', ctrl.createClass)
router.get('/classes', ctrl.getMyClasses)
router.put('/classes/:classId/amount', ctrl.updateClassDefaultAmount)
router.put('/classes/:classId/initial-balance', ctrl.updateInitialBalance)
router.delete('/classes/:classId', ctrl.deleteClass)

// Students
router.post('/classes/:classId/students', ctrl.addStudent)
router.get('/classes/:classId/students', ctrl.getClassStudents)
router.delete('/students/:studentId', ctrl.deleteStudent)

// Payments
router.post('/payments/create-monthly', ctrl.createMonthlyPayments)
router.get('/payments/class/:classId', ctrl.getClassPayments)
router.get('/payments', ctrl.getMonthlyPayments)
router.put('/payments/:paymentId/status', ctrl.updatePaymentStatus)

// Reminder
router.get('/reminder', ctrl.getMonthlyReminder)

// ❗ AGAR BU YO‘Q BO‘LSA ERROR BO‘LADI
router.post('/sms-reminder/send', (req, res) => {
  res.json({ success: true, message: 'SMS vaqtincha o‘chirilgan' })
})

// Export
router.get('/export/:classId', ctrl.exportPayments)

// Expenses
router.post('/expenses', ctrl.addExpense)
router.get('/expenses', ctrl.getExpenses)
router.delete('/expenses/:expenseId', ctrl.deleteExpense)

// Telegram
router.get('/telegram/bot-link', async (req, res) => {
  try {
    const bot = getBot()
    if (!bot) return res.status(503).json({ success: false, error: 'Bot ishlamayapti' })

    const botInfo = await bot.getMe()
    res.json({
      success: true,
      botUsername: botInfo.username,
      botLink: `https://t.me/${botInfo.username}`,
    })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.post('/telegram/send-reminders', async (req, res) => {
  try {
    await sendMonthlyReminders()
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

module.exports = router