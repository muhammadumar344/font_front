// backend/src/services/smsService.js
const axios = require('axios');

// SMS provider - ESKIZ.UZ (Uzbekistan)
const SMS_API_URL = 'https://api.eskiz.uz/api/message/send';
const SMS_API_KEY = process.env.SMS_API_KEY || 'your-api-key';
const SMS_FROM = 'School Fund';

// ✅ OTA-ONALARGA SMS YUBORISH
exports.sendSmsReminder = async (parentPhone, studentName, amount, dueDate) => {
  try {
    if (!parentPhone || !parentPhone.startsWith('+')) {
      console.warn('Invalid phone number:', parentPhone);
      return { success: false, message: 'Invalid phone number' };
    }

    const message = `School Fund: ${studentName} o'quvchisining to'lov muddati: ${dueDate}. Jami: ${amount} so'm. +998912345678 bilan bog'laning.`;

    const response = await axios.post(SMS_API_URL, {
      mobile_phone: parentPhone,
      message: message,
      from4ja: SMS_FROM,
    }, {
      headers: {
        'Authorization': `Bearer ${SMS_API_KEY}`,
      }
    });

    return { success: true, message: 'SMS sent successfully', data: response.data };
  } catch (error) {
    console.error('SMS sending error:', error.message);
    return { success: false, message: 'Failed to send SMS', error: error.message };
  }
};

// ✅ GURUHLASHTIRIB SMS YUBORISH
exports.sendBulkReminders = async (students, className, month, year) => {
  try {
    const results = [];

    for (const student of students) {
      if (!student.parentPhone) continue;

      const dueDate = `${month}/${year}`;
      const result = await exports.sendSmsReminder(
        student.parentPhone,
        student.name,
        student.amount,
        dueDate
      );

      results.push({
        studentId: student._id,
        phone: student.parentPhone,
        status: result.success ? 'sent' : 'failed',
        message: result.message,
      });

      // API rate limit uchun delay
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    return results;
  } catch (error) {
    console.error('Bulk SMS error:', error);
    return [];
  }
};