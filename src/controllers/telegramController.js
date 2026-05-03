// src/controllers/telegramController.js
const TelegramParent = require('../models/TelegramParent')
const { getBot } = require('../bot/bot')
const { sendMonthlyReminders } = require('../cron/reminderCron')

// Bot havolasini olish
exports.getBotLink = async (req, res) => {
  try {
    const bot = getBot()
    if (!bot) {
      return res.status(503).json({ success: false, error: 'Bot hozirda ishlamayapti' })
    }
    const botInfo = await bot.getMe()
    res.json({
      success: true,
      botUsername: botInfo.username,
      botLink: `https://t.me/${botInfo.username}`,
    })
  } catch (err) {
    console.error('getBotLink xatosi:', err.message)
    res.status(500).json({ success: false, error: err.message })
  }
}

// Barcha ulangan ota-onalar ro'yxati
exports.getParents = async (req, res) => {
  try {
    const parents = await TelegramParent.find({
      teacherId: req.user.id,
      isActive: true,
    })
      .populate('studentId', 'name rollNumber parentPhone')
      .populate('classId', 'name')
      .sort({ registeredAt: -1 })

    res.json({
      success: true,
      total: parents.length,
      parents: parents.map((p) => ({
        id: p._id,
        telegramUsername: p.telegramUsername || null,
        student: p.studentId,
        class: p.classId,
        registeredAt: p.registeredAt,
        lastNotifiedAt: p.lastNotifiedAt,
      })),
    })
  } catch (err) {
    console.error('getParents xatosi:', err.message)
    res.status(500).json({ success: false, error: err.message })
  }
}

// Sinf bo'yicha ulangan ota-onalar
exports.getParentsByClass = async (req, res) => {
  try {
    const parents = await TelegramParent.find({
      teacherId: req.user.id,
      classId: req.params.classId,
      isActive: true,
    }).populate('studentId', 'name rollNumber')

    res.json({ success: true, total: parents.length, parents })
  } catch (err) {
    console.error('getParentsByClass xatosi:', err.message)
    res.status(500).json({ success: false, error: err.message })
  }
}

// Qo'lda eslatma yuborish
exports.sendRemindersNow = async (req, res) => {
  try {
    await sendMonthlyReminders()
    res.json({ success: true, message: 'Eslatmalar yuborildi' })
  } catch (err) {
    console.error('sendRemindersNow xatosi:', err.message)
    res.status(500).json({ success: false, error: err.message })
  }
}