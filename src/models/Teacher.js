// src/models/Teacher.js
const mongoose = require('mongoose')
const bcrypt = require('bcryptjs')

const teacherSchema = new mongoose.Schema({
  name:     { type: String, required: true },
  email:    { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true, select: false },
  phone:    String,

  plan: {
    type: String,
    enum: ['free', 'pro', 'premium'],
    default: 'free',
  },
  planExpiresAt:  { type: Date, default: null },
  highestPlanEver: {
    type: String,
    enum: ['free', 'pro', 'premium'],
    default: 'free',
  },

  // ✅ FREEZE tizimi uchun
  freezeStartedAt:   { type: Date, default: null },
  freezeRemainingMs: { type: Number, default: 0 }, // qolgan millisekund

  isActive:       { type: Boolean, default: true },
  registeredDate: { type: Date, default: Date.now },
  createdAt:      { type: Date, default: Date.now },
})

teacherSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next()
  this.password = await bcrypt.hash(this.password, 10)
  next()
})

teacherSchema.methods.comparePassword = async function(password) {
  return bcrypt.compare(password, this.password)
}

// Obuna aktiv? (freeze hisobga olinadi)
teacherSchema.methods.isPlanActive = function() {
  if (this.plan === 'free') return true
  // Freeze davomida aktiv hisoblanadi (faqat vaqt to'xtab turadi)
  if (this.freezeStartedAt) return true
  if (!this.planExpiresAt) return false
  return new Date() < new Date(this.planExpiresAt)
}

// Qolgan kunlar
teacherSchema.methods.daysLeft = function() {
  if (this.plan === 'free') return 0
  // Freeze paytida qolgan kunlar
  if (this.freezeStartedAt && this.freezeRemainingMs > 0) {
    return Math.max(0, Math.ceil(this.freezeRemainingMs / (1000 * 60 * 60 * 24)))
  }
  if (!this.planExpiresAt) return 0
  const diff = new Date(this.planExpiresAt) - new Date()
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
}

// Aktiv plan
teacherSchema.methods.activePlan = function() {
  return this.isPlanActive() ? this.plan : 'free'
}

// Freeze holatimi?
teacherSchema.methods.isFrozen = function() {
  return !!this.freezeStartedAt
}

module.exports = mongoose.model('Teacher', teacherSchema)