// src/services/telegramService.js
const { getBot } = require('../bot/bot')

const MONTHS = ['Yanvar','Fevral','Mart','Aprel','May','Iyun','Iyul','Avgust','Sentabr','Oktabr','Noyabr','Dekabr']

// ── Oylik eslatma (to'lanmagan oylar uchun) ──────────────────
const sendPaymentReminder = async (chatId, studentName, className, unpaidMonths) => {
  const bot = getBot()
  if (!bot || !unpaidMonths?.length) return false

  const total = unpaidMonths.reduce((s, p) => s + p.amount, 0)
  const lines = unpaidMonths.map(p => `   • ${MONTHS[p.month - 1]} ${p.year} — ${p.amount.toLocaleString('uz-UZ')} so'm`).join('\n')

  const msg =
    `🔔 *To'lov eslatmasi*\n\n` +
    `Hurmatli ota-ona!\n\n` +
    `👤 Farzandingiz: *${studentName}*\n` +
    `🏫 Sinf: *${className}*\n\n` +
    `❌ *To'lov qilinmagan oylar:*\n${lines}\n\n` +
    `💰 *Jami to'lash kerak:* ${total.toLocaleString('uz-UZ')} so'm\n\n` +
    `📞 To'lov haqida o'qituvchi bilan bog'laning.`

  try {
    await bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' })
    return true
  } catch (e) {
    console.error(`Telegram xabar xatosi (chatId: ${chatId}):`, e.message)
    return false
  }
}

// ── To'lov qilinganda bildirishnoma ─────────────────────────
const sendPaymentConfirmation = async (chatId, studentName, className, paidMonths, remainingMonths) => {
  const bot = getBot()
  if (!bot) return false

  let msg = ''

  if (remainingMonths.length === 0) {
    // Hammasi to'langan
    msg =
      `✅ *To'lov tasdiqlandi!*\n\n` +
      `👤 *${studentName}* (${className})\n\n` +
      `📅 To'langan oylar:\n` +
      paidMonths.map(m => `   ✓ ${MONTHS[m.month - 1]} ${m.year}`).join('\n') +
      `\n\n🎉 *Barcha qarzdorliklar yo'q!*\n` +
      `Fond pulini o'z vaqtida berganingiz uchun rahmat! 🙏`
  } else {
    // Qisman to'langan
    const remaining = remainingMonths.reduce((s, m) => s + m.amount, 0)
    msg =
      `✅ *To'lov tasdiqlandi!*\n\n` +
      `👤 *${studentName}* (${className})\n\n` +
      `📅 To'langan oylar:\n` +
      paidMonths.map(m => `   ✓ ${MONTHS[m.month - 1]} ${m.year}`).join('\n') +
      `\n\n⏳ *Hali to'lanmagan oylar:*\n` +
      remainingMonths.map(m => `   • ${MONTHS[m.month - 1]} ${m.year} — ${m.amount.toLocaleString('uz-UZ')} so'm`).join('\n') +
      `\n\n💰 Qolgan qarz: *${remaining.toLocaleString('uz-UZ')} so'm*`
  }

  try {
    await bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' })
    return true
  } catch (e) {
    console.error('To\'lov tasdiqlash xabari xatosi:', e.message)
    return false
  }
}

// ── Freeze ogohlantrish ─────────────────────────────────────
const sendFreezeNotification = async (chatId, teacherName, reason) => {
  const bot = getBot()
  if (!bot) return false
  try {
    await bot.sendMessage(
      chatId,
      `❄️ *Obuna vaqtinchalik muzlatildi*\n\n` +
      `Hurmatli *${teacherName}* ustoz!\n\n` +
      `📌 Sabab: *${reason || 'Yozgi tatil'}*\n\n` +
      `Sizning obunangiz kuni to'xtatib qo'yildi. ` +
      `Tatil tugashi bilan obuna qaytadan ishlaydi va ` +
      `qolgan kunlar davom etadi.\n\n` +
      `_Savollar uchun administratorga murojaat qiling._`,
      { parse_mode: 'Markdown' }
    )
    return true
  } catch (e) {
    console.error('Freeze xabari xatosi:', e.message)
    return false
  }
}

// ── Unfreeze ogohlantrish ────────────────────────────────────
const sendUnfreezeNotification = async (chatId, teacherName, daysLeft) => {
  const bot = getBot()
  if (!bot) return false
  try {
    await bot.sendMessage(
      chatId,
      `🌟 *Obuna qayta faollashdi!*\n\n` +
      `Hurmatli *${teacherName}* ustoz!\n\n` +
      `✅ Muzlatish bekor qilindi — obunangiz davom etmoqda.\n` +
      `📅 Obunada qolgan kunlar: *${daysLeft} kun*\n\n` +
      `_Fond School bilan samarali ishlashingizni tilaymiz!_`,
      { parse_mode: 'Markdown' }
    )
    return true
  } catch (e) {
    console.error('Unfreeze xabari xatosi:', e.message)
    return false
  }
}

// ── Umumiy xabar ────────────────────────────────────────────
const sendMessage = async (chatId, message) => {
  const bot = getBot()
  if (!bot) return false
  try {
    await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' })
    return true
  } catch (e) {
    console.error('Telegram xabar xatosi:', e.message)
    return false
  }
}

module.exports = {
  sendPaymentReminder,
  sendPaymentConfirmation,
  sendFreezeNotification,
  sendUnfreezeNotification,
  sendMessage,
}