// backend/src/services/telegramService.js
const { getBot } = require('../bot/bot')

const MONTH_NAMES = [
  'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun',
  'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr',
]

/**
 * Bitta ota-onaga eslatma yuborish
 * @param {string} chatId
 * @param {string} studentName
 * @param {string} className
 * @param {Array} unpaidMonths - [{month, year, amount}]
 */
const sendPaymentReminder = async (chatId, studentName, className, unpaidMonths) => {
  const bot = getBot()
  if (!bot) {
    console.warn('Bot ishlamayapti — xabar yuborilmadi')
    return false
  }

  if (!unpaidMonths || unpaidMonths.length === 0) return false

  const totalAmount = unpaidMonths.reduce((sum, p) => sum + p.amount, 0)
  const monthsText = unpaidMonths
    .map((p) => `   • ${MONTH_NAMES[p.month - 1]} ${p.year} — ${p.amount.toLocaleString('uz-UZ')} so'm`)
    .join('\n')

  const message =
    `🔔 *To'lov eslatmasi*\n\n` +
    `Hurmatli ota-ona!\n\n` +
    `👤 Farzandingiz: *${studentName}*\n` +
    `🏫 Sinf: *${className}*\n\n` +
    `❌ *To'lov qilinmagan oylar:*\n${monthsText}\n\n` +
    `💰 *Jami to'lash kerak:* ${totalAmount.toLocaleString('uz-UZ')} so'm\n\n` +
    `📞 To'lov haqida o'qituvchi bilan bog'laning.`

  try {
    await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' })
    return true
  } catch (err) {
    console.error(`Telegram xabar yuborishda xato (chatId: ${chatId}):`, err.message)
    return false
  }
}

/**
 * Test xabari yuborish (admin/teacher uchun)
 * @param {string} chatId
 * @param {string} message
 */
const sendTestMessage = async (chatId, message) => {
  const bot = getBot()
  if (!bot) return false

  try {
    await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' })
    return true
  } catch (err) {
    console.error('Test xabar xatosi:', err.message)
    return false
  }
}

module.exports = { sendPaymentReminder, sendTestMessage }