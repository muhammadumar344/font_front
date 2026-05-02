// backend/src/bot/bot.js
// Bot: @SchoolfondsBot
const TelegramBot = require('node-telegram-bot-api')
const { handleStart, handleMessage, handleCallbackQuery } = require('./handlers')

let bot = null

// .env dan yoki to'g'ridan-to'g'ri token
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8551931126:AAFIuDbzMBZqSdiEWY1g8NaDhm0J-6mY4BA'

const initBot = () => {
  if (!BOT_TOKEN) {
    console.warn('⚠️  TELEGRAM_BOT_TOKEN topilmadi — bot ishlamaydi')
    return null
  }

  try {
    bot = new TelegramBot(BOT_TOKEN, {
      polling: {
        interval: 300,
        autoStart: true,
        params: { timeout: 10 },
      },
    })

    console.log('🤖 @SchoolfondsBot ishga tushdi')

    // /start
    bot.onText(/\/start/, (msg) => handleStart(bot, msg))

    // /help
    bot.onText(/\/help/, async (msg) => {
      await bot.sendMessage(
        msg.chat.id,
        `ℹ️ *Yordam*\n\n` +
        `Bu bot orqali maktab fond to'lovlari haqida eslatma olasiz.\n\n` +
        `📌 *Buyruqlar:*\n` +
        `/start — Ro'yxatdan o'tish yoki ma'lumot yangilash\n` +
        `/help — Yordam\n\n` +
        `❓ Muammo bo'lsa o'qituvchingiz bilan bog'laning.`,
        { parse_mode: 'Markdown' }
      )
    })

    // Matn xabarlar
    bot.on('message', (msg) => {
      if (msg.text && !msg.text.startsWith('/')) {
        handleMessage(bot, msg)
      }
    })

    // Inline keyboard
    bot.on('callback_query', (query) => handleCallbackQuery(bot, query))

    // Polling xato — 409 bo'lsa boshqa instansiya bor
    bot.on('polling_error', (err) => {
      if (err?.response?.body?.error_code === 409) {
        console.warn('⚠️  Boshqa polling sessiya bor — bu instansiya to\'xtatildi')
        bot.stopPolling()
      } else {
        console.error('Telegram polling xatosi:', err.message)
      }
    })

    bot.on('error', (err) => {
      console.error('Telegram bot xatosi:', err.message)
    })

    return bot
  } catch (err) {
    console.error('Bot ishga tushishda xato:', err.message)
    return null
  }
}

const getBot = () => bot

module.exports = { initBot, getBot, BOT_TOKEN }