// src/bot/handlers.js
const Teacher = require('../models/Teacher')
const Class = require('../models/Class')
const Student = require('../models/Student')
const TelegramParent = require('../models/TelegramParent')
const { classesKeyboard, studentsKeyboard, confirmKeyboard, backKeyboard } = require('./keyboards')

// Har bir chat uchun holat (memory da)
// { state, teacherId, teacherName, classes, classId, className, students, studentId, studentName }
const userStates = {}

// ── /start ────────────────────────────────────────────────────
const handleStart = async (bot, msg) => {
  const chatId = msg.chat.id
  userStates[chatId] = { state: 'waiting_email' }

  try {
    await bot.sendMessage(
      chatId,
      `👋 *Assalomu alaykum!*\n\n` +
      `@SchoolfondsBot ga xush kelibsiz! 🏫\n\n` +
      `Bu bot orqali farzandingizning maktab fond to'lovlari haqida *oylik eslatmalar* olasiz.\n\n` +
      `▶️ Boshlash uchun farzandingiz o'qituvchisining *email manzilini* yuboring:\n` +
      `_(masalan: teacher@email.com)_`,
      { parse_mode: 'Markdown' }
    )
  } catch (err) {
    console.error('handleStart xatosi:', err.message)
  }
}

// ── Matn xabarlar ─────────────────────────────────────────────
const handleMessage = async (bot, msg) => {
  const chatId = msg.chat.id
  const text = msg.text?.trim()

  if (!text) return

  const state = userStates[chatId]

  if (!state) {
    await bot.sendMessage(chatId, `Boshlash uchun /start bosing.`)
    return
  }

  // ── Email kutilmoqda ──
  if (state.state === 'waiting_email') {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(text)) {
      await bot.sendMessage(
        chatId,
        `❌ Bu to'g'ri email emas.\n\nIltimos, to'g'ri email kiriting:\n_(masalan: teacher@email.com)_`,
        { parse_mode: 'Markdown' }
      )
      return
    }

    try {
      const teacher = await Teacher.findOne({ email: text.toLowerCase() })

      if (!teacher) {
        await bot.sendMessage(
          chatId,
          `❌ *${text}* emailli o'qituvchi topilmadi.\n\nIltimos, to'g'ri email kiriting:`,
          { parse_mode: 'Markdown' }
        )
        return
      }

      if (!teacher.isActive) {
        await bot.sendMessage(chatId, `⚠️ Bu o'qituvchining akkaunt hozirda faol emas.`)
        return
      }

      const classes = await Class.find({ teacher: teacher._id }).sort({ name: 1 })

      if (classes.length === 0) {
        await bot.sendMessage(
          chatId,
          `⚠️ *${teacher.name}* o'qituvchida hozircha sinf yo'q.\n\nBoshqa email kiriting:`,
          { parse_mode: 'Markdown' }
        )
        return
      }

      userStates[chatId] = {
        state: 'waiting_class',
        teacherId: teacher._id.toString(),
        teacherName: teacher.name,
        classes,
      }

      await bot.sendMessage(
        chatId,
        `✅ *${teacher.name}* o'qituvchi topildi!\n\nFarzandingiz qaysi sinfda o'qiydi? 👇`,
        {
          parse_mode: 'Markdown',
          reply_markup: classesKeyboard(classes),
        }
      )
    } catch (err) {
      console.error('Email search xatosi:', err.message)
      await bot.sendMessage(chatId, `❌ Xatolik yuz berdi. /start bosib qaytadan urinib ko'ring.`)
    }
  }
}

// ── Inline tugmalar ────────────────────────────────────────────
const handleCallbackQuery = async (bot, query) => {
  const chatId = query.message.chat.id
  const data = query.data
  const state = userStates[chatId]

  // Har doim callback ni tasdiqlash (loading animatsiyasini to'xtatadi)
  try {
    await bot.answerCallbackQuery(query.id)
  } catch (_) {}

  // ── Boshidan boshlash ──
  if (data === 'restart' || data === 'cancel') {
    userStates[chatId] = { state: 'waiting_email' }
    await bot.sendMessage(chatId, `🔄 Boshidan boshlaylik.\n\nO'qituvchi emailini kiriting:`)
    return
  }

  if (!state) {
    await bot.sendMessage(chatId, `/start bosing.`)
    return
  }

  // ── Sinf tanlandi ──
  if (data.startsWith('class_') && state.state === 'waiting_class') {
    const classId = data.replace('class_', '')
    const selectedClass = state.classes?.find((c) => c._id.toString() === classId)

    if (!selectedClass) {
      await bot.sendMessage(chatId, `❌ Sinf topilmadi. /start bosing.`)
      return
    }

    try {
      const students = await Student.find({ class: classId }).sort({ rollNumber: 1 })

      if (students.length === 0) {
        await bot.sendMessage(
          chatId,
          `⚠️ *${selectedClass.name}* sinfida o'quvchi ro'yxati yo'q.`,
          { parse_mode: 'Markdown', reply_markup: backKeyboard() }
        )
        return
      }

      userStates[chatId] = {
        ...state,
        state: 'waiting_student',
        classId,
        className: selectedClass.name,
        students,
      }

      await bot.sendMessage(
        chatId,
        `📚 *${selectedClass.name}* sinfi o'quvchilari:\n\nFarzandingizni tanlang 👇`,
        {
          parse_mode: 'Markdown',
          reply_markup: studentsKeyboard(students),
        }
      )
    } catch (err) {
      console.error('Sinf tanlash xatosi:', err.message)
      await bot.sendMessage(chatId, `❌ Xatolik. /start bosing.`)
    }
  }

  // ── O'quvchi tanlandi ──
  if (data.startsWith('student_') && state.state === 'waiting_student') {
    const studentId = data.replace('student_', '')
    const selectedStudent = state.students?.find((s) => s._id.toString() === studentId)

    if (!selectedStudent) {
      await bot.sendMessage(chatId, `❌ O'quvchi topilmadi. /start bosing.`)
      return
    }

    userStates[chatId] = {
      ...state,
      state: 'confirming',
      studentId,
      studentName: selectedStudent.name,
    }

    await bot.sendMessage(
      chatId,
      `📋 *Tasdiqlash*\n\n` +
      `👤 O'quvchi: *${selectedStudent.name}*\n` +
      `🏫 Sinf: *${state.className}*\n` +
      `👨‍🏫 O'qituvchi: *${state.teacherName}*\n\n` +
      `Ushbu o'quvchining ota-onasi sifatida ro'yxatdan o'tmoqchimisiz?`,
      {
        parse_mode: 'Markdown',
        reply_markup: confirmKeyboard(studentId),
      }
    )
  }

  // ── Tasdiqlash ──
  if (data.startsWith('confirm_') && state.state === 'confirming') {
    try {
      // Allaqachon ulangan chatId bormi?
      const existing = await TelegramParent.findOne({ telegramChatId: String(chatId) })

      if (existing) {
        existing.studentId = state.studentId
        existing.classId = state.classId
        existing.teacherId = state.teacherId
        existing.telegramUsername = query.from.username || ''
        existing.isActive = true
        await existing.save()
      } else {
        await TelegramParent.create({
          telegramChatId: String(chatId),
          telegramUsername: query.from.username || '',
          studentId: state.studentId,
          classId: state.classId,
          teacherId: state.teacherId,
        })
      }

      delete userStates[chatId]

      await bot.sendMessage(
        chatId,
        `✅ *Muvaffaqiyatli ro'yxatdan o'tdingiz!*\n\n` +
        `👤 O'quvchi: *${state.studentName}*\n` +
        `🏫 Sinf: *${state.className}*\n\n` +
        `📅 Endi har oyning *1-sanasida* to'lov eslatmalarini olasiz.\n\n` +
        `_Ma'lumotlarni o'zgartirish uchun /start bosing._`,
        { parse_mode: 'Markdown' }
      )
    } catch (err) {
      console.error("Ro'yxatdan o'tishda xato:", err.message)
      await bot.sendMessage(chatId, `❌ Saqlashda xatolik. /start bosib qaytadan urinib ko'ring.`)
    }
  }
}

module.exports = { handleStart, handleMessage, handleCallbackQuery }