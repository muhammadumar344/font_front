// backend/src/bot/handlers.js
const Teacher = require('../models/Teacher')
const Class = require('../models/Class')
const Student = require('../models/Student')
const TelegramParent = require('../models/TelegramParent')
const { classesKeyboard, studentsKeyboard, confirmKeyboard, backKeyboard } = require('./keyboards')

// Har bir chat uchun holat (RAM da saqlanadi)
// state: 'waiting_email' | 'waiting_class' | 'waiting_student' | 'confirming'
const userStates = {}

/**
 * /start komandasi
 */
const handleStart = async (bot, msg) => {
  const chatId = msg.chat.id

  // Avvalgi holatni tozalash
  userStates[chatId] = { state: 'waiting_email' }

  await bot.sendMessage(
    chatId,
    `👋 *Assalomu alaykum!*\n\n` +
    `Fond School to'lov eslatma botiga xush kelibsiz! 🏫\n\n` +
    `Farzandingiz o'qituvchisining *email manzilini* kiriting:\n` +
    `_(masalan: teacher@example.com)_`,
    { parse_mode: 'Markdown' }
  )
}

/**
 * Matn xabarlarni qayta ishlash
 */
const handleMessage = async (bot, msg) => {
  const chatId = msg.chat.id
  const text = msg.text?.trim()

  if (!text || text.startsWith('/')) return

  const state = userStates[chatId]

  // Holat yo'q bo'lsa — /start ni taklif et
  if (!state) {
    await bot.sendMessage(chatId, `Boshlash uchun /start ni bosing.`)
    return
  }

  // ── 1-qadam: Email kutilmoqda ──
  if (state.state === 'waiting_email') {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(text)) {
      await bot.sendMessage(chatId, `❌ Email noto'g'ri formatda.\n\nIltimos, to'g'ri email kiriting:\n_(masalan: teacher@example.com)_`, { parse_mode: 'Markdown' })
      return
    }

    try {
      const teacher = await Teacher.findOne({ email: text.toLowerCase() })

      if (!teacher) {
        await bot.sendMessage(
          chatId,
          `❌ *${text}* email bilan o'qituvchi topilmadi.\n\nIltimos, to'g'ri email kiriting:`,
          { parse_mode: 'Markdown' }
        )
        return
      }

      // O'qituvchi topildi — sinflarni ko'rsatish
      const classes = await Class.find({ teacher: teacher._id })

      if (classes.length === 0) {
        await bot.sendMessage(chatId, `⚠️ Bu o'qituvchida hozircha sinf yo'q.\n\nBoshqa email kiriting yoki /start bosing.`)
        return
      }

      // Holatni saqlash
      userStates[chatId] = {
        state: 'waiting_class',
        teacherId: teacher._id,
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
      console.error('handleMessage email error:', err)
      await bot.sendMessage(chatId, `❌ Xatolik yuz berdi. /start bosib qaytadan urinib ko'ring.`)
    }
  }
}

/**
 * Callback query (inline button) qayta ishlash
 */
const handleCallbackQuery = async (bot, query) => {
  const chatId = query.message.chat.id
  const data = query.data
  const state = userStates[chatId]

  // Callback ni tasdiqlash
  await bot.answerCallbackQuery(query.id)

  // ── Boshidan boshlash ──
  if (data === 'restart' || data === 'cancel') {
    userStates[chatId] = { state: 'waiting_email' }
    await bot.sendMessage(chatId, `🔄 Boshidan boshlaylik.\n\nO'qituvchi emailini kiriting:`)
    return
  }

  if (!state) {
    await bot.sendMessage(chatId, `Boshlash uchun /start ni bosing.`)
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
        await bot.sendMessage(chatId, `⚠️ Bu sinfda o'quvchi ro'yxati yo'q.`, { reply_markup: backKeyboard() })
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
        `📚 *${selectedClass.name}* sinfida o'quvchilar:\n\nFarzandingizni tanlang 👇`,
        {
          parse_mode: 'Markdown',
          reply_markup: studentsKeyboard(students),
        }
      )
    } catch (err) {
      console.error('handleCallbackQuery class error:', err)
      await bot.sendMessage(chatId, `❌ Xatolik yuz berdi. /start bosing.`)
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
      `Siz ushbu o'quvchining ota-onasi sifatida ro'yxatdan o'tmoqchimisiz?`,
      {
        parse_mode: 'Markdown',
        reply_markup: confirmKeyboard(studentId),
      }
    )
  }

  // ── Tasdiqlash ──
  if (data.startsWith('confirm_') && state.state === 'confirming') {
    const studentId = data.replace('confirm_', '')

    try {
      // Allaqachon ro'yxatdan o'tganmi?
      const existing = await TelegramParent.findOne({ telegramChatId: String(chatId) })

      if (existing) {
        // Yangilash
        existing.studentId = studentId
        existing.classId = state.classId
        existing.teacherId = state.teacherId
        existing.telegramUsername = query.from.username || ''
        await existing.save()
      } else {
        // Yangi yozuv
        await TelegramParent.create({
          telegramChatId: String(chatId),
          telegramUsername: query.from.username || '',
          studentId,
          classId: state.classId,
          teacherId: state.teacherId,
        })
      }

      // Holatni tozalash
      delete userStates[chatId]

      await bot.sendMessage(
        chatId,
        `✅ *Muvaffaqiyatli ro'yxatdan o'tdingiz!*\n\n` +
        `👤 O'quvchi: *${state.studentName}*\n` +
        `🏫 Sinf: *${state.className}*\n\n` +
        `Bundan buyon har oyning 1-sanasida to'lov eslatmalarini shu chatga yuboramiz. 🔔\n\n` +
        `_Ma'lumotlaringizni o'zgartirish uchun /start bosing._`,
        { parse_mode: 'Markdown' }
      )
    } catch (err) {
      console.error('handleCallbackQuery confirm error:', err)
      await bot.sendMessage(chatId, `❌ Ro'yxatdan o'tishda xatolik. /start bosib qaytadan urinib ko'ring.`)
    }
  }
}

module.exports = { handleStart, handleMessage, handleCallbackQuery }