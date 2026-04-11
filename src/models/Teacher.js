// models/Teacher.js
const mongoose = require('mongoose');

const teacherSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Ism majburiy'],
    trim: true,
    minlength: [3, 'Ism kamida 3 belgidan iborat bo\'lishi kerak'],
  },
  email: {
    type: String,
    required: [true, 'Email majburiy'],
    unique: true,
    lowercase: true,
    match: [
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      'Email to\'g\'ri formatda emas',
    ],
  },
  password: {
    type: String,
    required: [true, 'Parol majburiy'],
    minlength: [6, 'Parol kamita 6 belgidan iborat bo\'lishi kerak'],
    select: false,
  },
  phone: String,
  
  // YANGI: Teacher qaysi planni tanlagan
  plan: {
    type: String,
    enum: ['free', 'plus', 'pro'],
    default: 'free',
  },
  
  // YANGI: Subscription ma'lumotlari (teacher uchun)
  subscriptionStartDate: Date,
  subscriptionExpiryDate: Date,
  subscriptionIsActive: {
    type: Boolean,
    default: true,
  },
  
  // YANGI: Self deactivate (o'zi rad etdi)
  selfDeactivated: {
    type: Boolean,
    default: false,
  },
  
  isActive: {
    type: Boolean,
    default: true,
  },
  
  createdByAdmin: {
    type: Boolean,
    default: true,
  },
  
  lastLogin: Date,
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Metodlar
teacherSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  if (this.password.startsWith('$2a$') || this.password.startsWith('$2b$')) {
    return next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

teacherSchema.methods.comparePassword = async function (password) {
  return await bcrypt.compare(password, this.password);
};

teacherSchema.methods.isSubscriptionExpired = function () {
  return new Date() > this.subscriptionExpiryDate;
};

teacherSchema.methods.daysLeftInSubscription = function () {
  const diff = this.subscriptionExpiryDate - new Date();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
};

module.exports = mongoose.model('Teacher', teacherSchema);