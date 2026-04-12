const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

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

  // Obuna muddati — null bo'lsa free (muddatsiz)
  planExpiresAt: { type: Date, default: null },

  // Sotib olingan maksimal plan — vaqt tugasa ham shu limitda ishlaydi
  // Masalan: pro sotib oldi → 3 sinf ochdi → pro tugadi → 3 sinf turaveradi
  // Lekin yangi sinf ocha olmaydi (chunki hozirgi active plan = free)
  highestPlanEver: {
    type: String,
    enum: ['free', 'pro', 'premium'],
    default: 'free',
  },

  isActive:       { type: Boolean, default: true },
  registeredDate: { type: Date, default: Date.now },
  createdAt:      { type: Date, default: Date.now },
});

teacherSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

teacherSchema.methods.comparePassword = async function (password) {
  return bcrypt.compare(password, this.password);
};

// ── Subscription helper metodlar ──────────────────────────────

// Obuna hozir aktiv?
teacherSchema.methods.isPlanActive = function () {
  if (this.plan === 'free') return true;
  if (!this.planExpiresAt) return false;
  return new Date() < new Date(this.planExpiresAt);
};

// Necha kun qoldi
teacherSchema.methods.daysLeft = function () {
  if (!this.planExpiresAt) return 0;
  const diff = new Date(this.planExpiresAt) - new Date();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
};

// Hozirgi aktiv plan (vaqt o'tsa free ga tushadi — faqat yangi ochish uchun)
teacherSchema.methods.activePlan = function () {
  return this.isPlanActive() ? this.plan : 'free';
};

module.exports = mongoose.model('Teacher', teacherSchema);