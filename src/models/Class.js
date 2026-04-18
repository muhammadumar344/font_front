// backend/src/models/Class.js
const mongoose = require('mongoose')

const classSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  teacher: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Teacher',
    required: true,
  },
  defaultAmount: {
    type: Number,
    required: true,
    min: 0,
  },
  plan: {
    type: String,
    enum: ['free', 'pro', 'premium'],
    default: 'free',
  },

  // ✅ YANGI: Saytdan foydalanishdan OLDIN yig'ilgan pul
  // Misol: V sinf saytdan avval 300,000 so'm yig'gan bo'lsa, shu yerga kiriladi
  // Barcha hisobotlarda bu pul ham hisobga olinadi
  initialBalance: {
    type: Number,
    default: 0,
    min: 0,
  },

  // ✅ YANGI: Boshlang'ich balans kiritilgan sana (qaysi oy uchun ekanligi)
  initialBalanceNote: {
    type: String,
    default: '',
    trim: true,
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },
})

module.exports = mongoose.model('Class', classSchema)