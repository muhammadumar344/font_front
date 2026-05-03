// src/cron/reminderCron.js
const cron = require('node-cron')
const TelegramParent = require('../models/TelegramParent')
const MonthlyPayment = require('../models/MonthlyPayment')
const { sendPaymentReminder } = require('../services/telegramService')

const MONTH_NAMES = [
  'Yanvar','Fevral','Mart','Aprel','May','Iyun',
  'Iyul','Avgust','Sentabr','Oktabr','Noyabr','Dekabr',
]

const getPreviousMonth = () => {
  const now = new Date()
  let month = now.getMonth() // 0-indexed = oldingi oy
  let year = now.getFullYear()
  if (month === 0) { month = 12; year -= 1 }
  return { month, year }
}

const sendMonthlyReminders = async () => {
  console.log('📬 Oylik Telegram eslatma boshlandi...')
  try {
    const parents = await TelegramParent.find({ isActive: true })
      .populate('studentId', 'name')
      .populate('classId', 'name')

    if (!parents.length) {
      console.log('📭 Ulangan ota-ona yo\'q')
      return
    }

    let sentCount = 0
    let skippedCount = 0

    for (const parent of parents) {
      try {
        if (!parent.studentId || !parent.classId) continue

        // Oxirgi 3 oyda to'lanmagan to'lovlar
        const unpaidPayments = await MonthlyPayment.find({
          student: parent.studentId._id,
          status: 'not_paid',
        }).sort({ year: 1, month: 1 }).limit(3)

        if (!unpaidPayments.length) { skippedCount++; continue }

        const sent = await sendPaymentReminder(
          parent.telegramChatId,
          parent.studentId.name,
          parent.classId.name,
          unpaidPayments.map((p) => ({ month: p.month, year: p.year, amount: p.amount }))
        )

        if (sent) {
          parent.lastNotifiedAt = new Date()
          await parent.save()
          sentCount++
        }
      } catch (err) {
        console.error(`Parent ${parent._id} uchun xato:`, err.message)
      }
    }

    console.log(`✅ Telegram: ${sentCount} yuborildi, ${skippedCount} o'tkazildi`)
  } catch (err) {
    console.error('sendMonthlyReminders xatosi:', err)
  }
}

const startReminderCron = () => {
  // Har oy 1-sana soat 09:00 (Toshkent vaqti)
  cron.schedule('0 9 1 * *', sendMonthlyReminders, { timezone: 'Asia/Tashkent' })
  console.log('⏰ Oylik eslatma cron ishga tushdi (1-sana, 09:00 Toshkent)')
}

module.exports = { startReminderCron, sendMonthlyReminders }