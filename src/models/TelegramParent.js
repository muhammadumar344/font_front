// backend/src/models/TelegramParent.js
const mongoose = require('mongoose')

const telegramParentSchema = new mongoose.Schema({
  telegramChatId: {
    type: String,
    required: true,
    unique: true,
  },
  telegramUsername: {
    type: String,
    default: '',
  },
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true,
  },
  classId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class',
    required: true,
  },
  teacherId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Teacher',
    required: true,
  },
  registeredAt: {
    type: Date,
    default: Date.now,
  },
  lastNotifiedAt: {
    type: Date,
    default: null,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
})

module.exports = mongoose.model('TelegramParent', telegramParentSchema)