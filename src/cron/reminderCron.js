// backend/src/cron/reminderCron.js
const cron = require('node-cron')
const TelegramParent = require('../models/TelegramParent')
const MonthlyPayment = require('../models/MonthlyPayment')
const { sendPaymentReminder } = require('../services/telegramService')

/**
 * Oldingi oyni hisoblash
 */
const getPreviousMonth = () => {
  const now = new Date()
  let month = now.getMonth() // 0-indexed, shuning uchun oldingi oy
  let year = now.getFullYear()

  if (month === 0) {
    month = 12
    year -= 1
  }

  return { month, year }
}

/**
 * Barcha ulangan ota-onalarga eslatma yuborish
 */
const sendMonthlyReminders = async () => {
  console.log('📬 Oylik Telegram eslatma boshlandi...')

  try {
    const parents = await TelegramParent.find({ isActive: true })
      .populate('studentId', 'name')
      .populate('classId', 'name')

    if (parents.length === 0) {
      console.log('📭 Ulangan ota-ona yo\'q')
      return
    }

    const { month, year } = getPreviousMonth()
    let sentCount = 0
    let skippedCount = 0

    for (const parent of parents) {
      try {
        // Bu student uchun to'lanmagan oylarni topish (oxirgi 3 oy)
        const unpaidPayments = await MonthlyPayment.find({
          student: parent.studentId._id,
          status: 'not_paid',
          // Oxirgi 3 oyni tekshirish
          $or: [
            { year, month: { $lte: month } },
            { year: year - 1, month: { $gt: month } },
          ],
        }).sort({ year: 1, month: 1 })

        if (unpaidPayments.length === 0) {
          skippedCount++
          continue
        }

        const sent = await sendPaymentReminder(
          parent.telegramChatId,
          parent.studentId.name,
          parent.classId.name,
          unpaidPayments.map((p) => ({
            month: p.month,
            year: p.year,
            amount: p.amount,
          }))
        )

        if (sent) {
          // Oxirgi bildirishni saqlash
          parent.lastNotifiedAt = new Date()
          await parent.save()
          sentCount++
        }
      } catch (err) {
        console.error(`Parent ${parent._id} uchun xato:`, err.message)
      }
    }

    console.log(`✅ Telegram eslatma: ${sentCount} ta yuborildi, ${skippedCount} ta o'tkazib yuborildi`)
  } catch (err) {
    console.error('sendMonthlyReminders xatosi:', err)
  }
}

/**
 * Cron job ishga tushirish
 * Har oyning 1-sanasi, soat 09:00 da ishlaydi
 */
const startReminderCron = () => {
  // '0 9 1 * *' = Har oy 1-sana, 09:00
  cron.schedule('0 9 1 * *', async () => {
    await sendMonthlyReminders()
  }, {
    timezone: 'Asia/Tashkent',
  })

  console.log('⏰ Oylik eslatma cron job ishga tushdi (har oy 1-sana, 09:00)')
}

module.exports = { startReminderCron, sendMonthlyReminders }