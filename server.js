// src/server.js
require('dotenv').config()
const express = require('express')
const mongoose = require('mongoose')
const cors = require('cors')

const app = express()

// ── Middleware ─────────────────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true,
}))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// ── Health check ───────────────────────────────────────────────
app.get('/', (req, res) => res.json({ status: 'ok', app: 'Fond School API' }))
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }))

// ── MongoDB ulanish ────────────────────────────────────────────
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/fond-school')
  .then(async () => {
    console.log('✅ MongoDB ulandi')

    // ✅ 1-qadam: Botni ishga tushirish (routes dan OLDIN)
    const { initBot } = require('./src/bot/bot')
    initBot(app)   // app — webhook uchun kerak

    // ✅ 2-qadam: Routelarni ulash
    app.use('/api/auth',    require('./src/routes/auth'))
    app.use('/api/admin',   require('./src/routes/admin'))
    app.use('/api/teacher', require('./src/routes/teacher'))

    // 404 handler
    app.use((req, res) => {
      res.status(404).json({ error: `Route topilmadi: ${req.method} ${req.originalUrl}` })
    })

    // Global error handler
    app.use((err, req, res, next) => {
      console.error('Server xatosi:', err.message)
      res.status(500).json({ error: 'Ichki server xatosi' })
    })

    // ✅ 3-qadam: Cron job (eslatmalar)
    const { startReminderCron } = require('./src/cron/reminderCron')
    startReminderCron()

    // ✅ 4-qadam: Serverni ishga tushirish
    const PORT = process.env.PORT || 5000
    app.listen(PORT, () => {
      console.log(`🚀 Server http://localhost:${PORT} da ishlamoqda`)
      console.log(`🌍 NODE_ENV: ${process.env.NODE_ENV || 'development'}`)
    })
  })
  .catch((err) => {
    console.error('❌ MongoDB ulanish xatosi:', err.message)
    process.exit(1)
  })

module.exports = app