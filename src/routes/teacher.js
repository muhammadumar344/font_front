const express = require('express')
const router = express.Router()
const teacherController = require('../controllers/teacherController')
const expenseController = require('../controllers/expenseController')
const authMiddleware = require('../middleware/authMiddleware')
const subscriptionMiddleware = require('../middleware/subscriptionMiddleware')

router.use(authMiddleware)

// ─── SETUP ────────────────────────────────────────────────────────────────
router.get('/amount-check', teacherController.checkAmountConfigured)
router.post('/set-amount', teacherController.setDefaultAmount)

// ─── DASHBOARD ────────────────────────────────────────────────────────────
router.get('/dashboard', subscriptionMiddleware, teacherController.getTeacherDashboard)

// ─── HISOBOT ─────────────────────────────────────────────────────────────
router.get('/report', subscriptionMiddleware, teacherController.getMyClassReport)

// ─── TO'LOVLAR ────────────────────────────────────────────────────────────
router.post('/payments/create', subscriptionMiddleware, teacherController.createMonthlyPaymentsForMyClass)
router.put('/payments/:paymentId/status', subscriptionMiddleware, teacherController.updateMyPaymentStatus)

// ─── XARAJATLAR ───────────────────────────────────────────────────────────
router.post('/expenses', subscriptionMiddleware, expenseController.createExpense)
router.get('/expenses', subscriptionMiddleware, expenseController.getExpensesByMonth)
router.get('/expenses/yearly', subscriptionMiddleware, expenseController.getYearlySummary)
router.delete('/expenses/:expenseId', subscriptionMiddleware, expenseController.deleteExpense)

module.exports = router