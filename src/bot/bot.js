// src/bot/bot.js
// @SchoolfondsBot
const TelegramBot = require('node-telegram-bot-api')

let bot = null
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8551931126:AAFIuDbzMBZqSdiEWY1g8NaDhm0J-6mY4BA'

/**
 * Botni ishga tushirish.
 * Render (production) da webhook, localda polling ishlaydi.
 */
const initBot = (app) => {
  if (!BOT_TOKEN) {
    console.warn('⚠️  TELEGRAM_BOT_TOKEN topilmadi')
    return null
  }

  try {
    const isProduction = process.env.NODE_ENV === 'production'
    const webhookUrl = process.env.WEBHOOK_URL  // masalan: https://yourapp.onrender.com

    if (isProduction && webhookUrl && app) {
      // ── PRODUCTION: Webhook mode (Render uchun ideal) ──────
      bot = new TelegramBot(BOT_TOKEN, { webHook: { port: false } })

      const path = `/bot${BOT_TOKEN}`
      const fullUrl = `${webhookUrl}${path}`

      // Webhook yo'lini Express ga ulash
      app.post(path, (req, res) => {
        bot.processUpdate(req.body)
        res.sendStatus(200)
      })

      // Telegramga webhook URL ni yuborish
      bot.setWebHook(fullUrl)
        .then(() => console.log(`✅ Webhook o'rnatildi: ${fullUrl}`))
        .catch((err) => console.error('Webhook xatosi:', err.message))

    } else {
      // ── DEVELOPMENT: Polling mode ──────────────────────────
      // Avval webhookni o'chirish (agar avval production ishlatilgan bo'lsa)
      bot = new TelegramBot(BOT_TOKEN, { polling: false })
      bot.deleteWebHook().then(() => {
        bot = new TelegramBot(BOT_TOKEN, {
          polling: {
            interval: 300,
            autoStart: true,
            params: { timeout: 10 },
          },
        })
        _attachHandlers()
        console.log('🤖 @SchoolfondsBot polling mode da ishga tushdi')
      }).catch(() => {
        // Webhook o'chirishda xato bo'lsa ham polling boshlash
        bot = new TelegramBot(BOT_TOKEN, { polling: true })
        _attachHandlers()
        console.log('🤖 @SchoolfondsBot ishga tushdi')
      })
      return bot
    }

    _attachHandlers()
    console.log('🤖 @SchoolfondsBot ishga tushdi (webhook)')
    return bot

  } catch (err) {
    console.error('Bot ishga tushishda xato:', err.message)
    return null
  }
}

/**
 * Handler larni bot ga ulash — polling va webhook uchun bir xil
 */
const _attachHandlers = () => {
  if (!bot) return

  const { handleStart, handleMessage, handleCallbackQuery } = require('./handlers')

  bot.onText(/\/start/, (msg) => {
    console.log(`📨 /start — chatId: ${msg.chat.id}`)
    handleStart(bot, msg)
  })

  bot.onText(/\/help/, async (msg) => {
    await bot.sendMessage(
      msg.chat.id,
      `ℹ️ *Yordam*\n\n` +
      `Bu bot orqali maktab fond to'lovlari haqida eslatma olasiz.\n\n` +
      `📌 *Buyruqlar:*\n` +
      `/start — Ro'yxatdan o'tish\n` +
      `/help — Yordam\n\n` +
      `❓ Muammo bo'lsa o'qituvchingiz bilan bog'laning.`,
      { parse_mode: 'Markdown' }
    )
  })

  bot.on('message', (msg) => {
    if (msg.text && !msg.text.startsWith('/')) {
      handleMessage(bot, msg)
    }
  })

  bot.on('callback_query', (query) => {
    handleCallbackQuery(bot, query)
  })

  bot.on('polling_error', (err) => {
    if (err?.response?.body?.error_code === 409) {
      console.warn('⚠️  Boshqa polling sessiya bor, bu o\'chirildi')
      bot.stopPolling()
    } else {
      console.error('Polling xatosi:', err.message)
    }
  })

  bot.on('error', (err) => {
    console.error('Bot xatosi:', err.message)
  })
}

const getBot = () => bot

module.exports = { initBot, getBot, BOT_TOKEN }