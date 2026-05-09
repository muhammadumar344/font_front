// src/models/FreezeSettings.js
// Yozgi tatil freeze tizimi uchun model
const mongoose = require('mongoose')

const freezeSettingsSchema = new mongoose.Schema({
  // Freeze faolmi?
  isActive: { type: Boolean, default: false },

  // Freeze boshlangan sana
  startedAt: { type: Date, default: null },

  // Admin qo'lda tugatganmi (auto emas)
  endedAt: { type: Date, default: null },

  // Sababi (yozgi tatil, ta'mirlash va h.k.)
  reason: { type: String, default: 'Yozgi tatil' },

  // Ogohlantrish yuborilganmi o'qituvchilarga
  notifiedTeachers: { type: Boolean, default: false },

  // Freeze tugaganda ogohlantrish yuborilganmi
  unfreezeNotified: { type: Boolean, default: false },

  // Kim freeze qildi
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
}, { timestamps: true })

module.exports = mongoose.model('FreezeSettings', freezeSettingsSchema)