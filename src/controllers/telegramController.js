// src/controllers/telegramController.js
const TelegramParent = require('../models/TelegramParent')
const MonthlyPayment = require('../models/MonthlyPayment')
const Student = require('../models/Student')
const { getBot } = require('../bot/bot')
const { sendMonthlyReminders } = require('../cron/reminderCron')
const { sendPaymentReminder } = require('../services/telegramService')

// Bot havolasi
exports.getBotLink = async (req, res) => {
  try {
    const bot = getBot()
    if (!bot) return res.status(503).json({ success: false, error: 'Bot ishlamayapti' })
    const info = await bot.getMe()
    res.json({ success: true, botUsername: info.username, botLink: `https://t.me/${info.username}` })
  } catch (e) {
    res.status(500).json({ success: false, error: e.message })
  }
}

// Barcha ulangan ota-onalar
exports.getParents = async (req, res) => {
  try {
    const parents = await TelegramParent.find({ teacherId: req.user.id, isActive: true })
      .populate('studentId', 'name rollNumber parentPhone')
      .populate('classId', 'name')
      .sort({ registeredAt: -1 })

    res.json({
      success: true,
      total: parents.length,
      parents: parents.map(p => ({
        id: p._id,
        telegramUsername: p.telegramUsername || null,
        student: p.studentId,
        class: p.classId,
        registeredAt: p.registeredAt,
        lastNotifiedAt: p.lastNotifiedAt,
      })),
    })
  } catch (e) {
    res.status(500).json({ success: false, error: e.message })
  }
}

// Sinf bo'yicha ota-onalar
exports.getParentsByClass = async (req, res) => {
  try {
    const parents = await TelegramParent.find({
      teacherId: req.user.id,
      classId: req.params.classId,
      isActive: true,
    }).populate('studentId', 'name rollNumber')
    res.json({ success: true, total: parents.length, parents })
  } catch (e) {
    res.status(500).json({ success: false, error: e.message })
  }
}

// Hammaga eslatma yuborish
exports.sendRemindersNow = async (req, res) => {
  try {
    const result = await sendMonthlyReminders()
    res.json({ success: true, message: 'Eslatmalar yuborildi', sent: result?.sent || 0 })
  } catch (e) {
    res.status(500).json({ success: false, error: e.message })
  }
}

// ✅ YANGI: Tanlangan o'quvchilar ota-onalariga yuborish
exports.sendToStudents = async (req, res) => {
  try {
    const { studentIds, month, year } = req.body
    const teacherId = req.user.id

    if (!studentIds?.length) {
      return res.status(400).json({ success: false, error: 'studentIds bo\'sh' })
    }

    let sentCount = 0
    let failedCount = 0

    for (const studentId of studentIds) {
      try {
        // Bu student uchun Telegram parent topish
        const parent = await TelegramParent.findOne({
          studentId,
          teacherId,
          isActive: true,
        }).populate('studentId', 'name').populate('classId', 'name')

        if (!parent) { failedCount++; continue }

        // To'lanmagan oylarni topish
        const query = {
          student: studentId,
          teacher: teacherId,
          status: 'not_paid',
        }
        if (month) query.month = Number(month)
        if (year)  query.year  = Number(year)

        const unpaidPayments = await MonthlyPayment.find(query).sort({ year: 1, month: 1 })

        if (!unpaidPayments.length) { failedCount++; continue }

        const sent = await sendPaymentReminder(
          parent.telegramChatId,
          parent.studentId.name,
          parent.classId.name,
          unpaidPayments.map(p => ({ month: p.month, year: p.year, amount: p.amount }))
        )

        if (sent) {
          parent.lastNotifiedAt = new Date()
          await parent.save()
          sentCount++
        } else {
          failedCount++
        }
      } catch (e) {
        console.error(`Student ${studentId} uchun xato:`, e.message)
        failedCount++
      }
    }

    res.json({
      success: true,
      sent: sentCount,
      failed: failedCount,
      message: `${sentCount} ta ota-onaga yuborildi`,
    })
  } catch (e) {
    res.status(500).json({ success: false, error: e.message })
  }
}