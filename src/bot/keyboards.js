// backend/src/bot/keyboards.js

/**
 * Inline keyboard — sinflar ro'yxati uchun
 * @param {Array} classes - [{_id, name}]
 */
const classesKeyboard = (classes) => ({
  inline_keyboard: classes.map((cls, i) => ([{
    text: `${i + 1}️⃣ ${cls.name}`,
    callback_data: `class_${cls._id}`,
  }])),
})

/**
 * Inline keyboard — o'quvchilar ro'yxati uchun
 * @param {Array} students - [{_id, name, rollNumber}]
 */
const studentsKeyboard = (students) => ({
  inline_keyboard: students.map((s) => ([{
    text: `${s.rollNumber}. ${s.name}`,
    callback_data: `student_${s._id}`,
  }])),
})

/**
 * Tasdiqlash keyboard
 * @param {string} studentId
 */
const confirmKeyboard = (studentId) => ({
  inline_keyboard: [[
    { text: '✅ Ha, tasdiqlash', callback_data: `confirm_${studentId}` },
    { text: '❌ Bekor qilish', callback_data: 'cancel' },
  ]],
})

/**
 * Orqaga qaytish tugmasi
 */
const backKeyboard = () => ({
  inline_keyboard: [[
    { text: '⬅️ Boshidan boshlash', callback_data: 'restart' },
  ]],
})

module.exports = {
  classesKeyboard,
  studentsKeyboard,
  confirmKeyboard,
  backKeyboard,
}