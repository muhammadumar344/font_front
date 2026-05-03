// server.js — VAQTINCHA DIAGNOSTIKA (keyin o'chiring)
require('dotenv').config()
const express = require('express')
const mongoose = require('mongoose')
const cors = require('cors')

const app = express()
app.use(cors())
app.use(express.json())

app.get('/api/health', (req, res) => res.json({ ok: true }))

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/fond-school')
  .then(async () => {
    console.log('✅ MongoDB ulandi')

    // ── Bot ──────────────────────────────────────────────────
    try {
      const { initBot } = require('./src/bot/bot')
      initBot(app)
      console.log('✅ Bot yuklandi')
    } catch (e) { console.error('❌ Bot xatosi:', e.message) }

    // ── Auth routes ──────────────────────────────────────────
    try {
      const authRoutes = require('./src/routes/auth')
      app.use('/api/auth', authRoutes)
      console.log('✅ auth routes ulandi')
    } catch (e) { console.error('❌ auth routes xatosi:', e.message) }

    // ── Admin routes ─────────────────────────────────────────
    try {
      const adminRoutes = require('./src/routes/admin')
      app.use('/api/admin', adminRoutes)
      console.log('✅ admin routes ulandi')
    } catch (e) { console.error('❌ admin routes xatosi:', e.message) }

    // ── Teacher routes ────────────────────────────────────────
    try {
      const teacherRoutes = require('./src/routes/teacher')
      app.use('/api/teacher', teacherRoutes)
      console.log('✅ teacher routes ulandi')
    } catch (e) { console.error('❌ teacher routes xatosi:', e.message) }

    // ── Cron ─────────────────────────────────────────────────
    try {
      const { startReminderCron } = require('./src/cron/reminderCron')
      startReminderCron()
      console.log('✅ Cron ishga tushdi')
    } catch (e) { console.error('❌ Cron xatosi:', e.message) }

    const PORT = process.env.PORT || 5000
    app.listen(PORT, () => console.log(`🚀 Server ${PORT} portda`))
  })
  .catch(err => {
    console.error('❌ MongoDB xatosi:', err.message)
    process.exit(1)
  })