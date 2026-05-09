// src/services/smsService.js
// SMS integratsiya hozircha yo'q — Telegram ishlatilmoqda
// Bu fayl faqat teacherController.js crash bo'lmasligi uchun

const sendBulkReminders = async (students, className, month, year) => {
  console.log(`SMS service: ${students.length} ta o'quvchi uchun so'rov keldi (${className}, ${month}/${year})`)
  console.log('SMS integratsiya ulanmagan — Telegram ishlatilmoqda')

  // Hamma "failed" qaytaradi, lekin xato bermaydi
  return students.map(s => ({
    studentId: s._id,
    name: s.name,
    phone: s.parentPhone || '',
    status: 'failed',
    reason: 'SMS service ulanmagan',
  }))
}

const sendSingle = async (phone, message) => {
  console.log(`SMS: ${phone} ga xabar yuborish so'raldi (ulanmagan)`)
  return { success: false, reason: 'SMS service ulanmagan' }
}

module.exports = { sendBulkReminders, sendSingle }