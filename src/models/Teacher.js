// src/models/Teacher.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const teacherSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Ism majburiy'],
    trim: true,
    minlength: [3, 'Ism kamida 3 belgidan iborat bo\'lishi kerak']
  },
  email: {
    type: String,
    required: [true, 'Email majburiy'],
    unique: true,
    lowercase: true,
    match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Email noto\'g\'ri']
  },
  password: {
    type: String,
    required: [true, 'Parol majburiy'],
    minlength: [6, 'Parol kamida 6 belgidan iborat bo\'lishi kerak'],
    select: false
  },
  phone: String,
  plan: {
    type: String,
    enum: ['free', 'plus', 'pro'],
    default: 'free'
  },
  subscriptionStartDate: {
    type: Date,
    default: Date.now
  },
  subscriptionExpiryDate: {
    type: Date,
    default: () => {
      const date = new Date();
      date.setDate(date.getDate() + 30);
      return date;
    }
  },
  subscriptionIsActive: {
    type: Boolean,
    default: true
  },
  selfDeactivated: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdByAdmin: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

teacherSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();

  try {
    if (this.password.startsWith('$2a$') || this.password.startsWith('$2b$')) {
      return next();
    }

    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

teacherSchema.methods.comparePassword = async function (password) {
  try {
    return await bcrypt.compare(password, this.password);
  } catch (err) {
    throw new Error('Password tekshirishda xato: ' + err.message);
  }
};

teacherSchema.methods.isSubscriptionExpired = function () {
  return this.subscriptionExpiryDate < new Date();
};

teacherSchema.methods.daysLeftInSubscription = function () {
  const now = new Date();
  if (this.subscriptionExpiryDate < now) return 0;

  const diff = this.subscriptionExpiryDate - now;
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
};

module.exports = mongoose.model('Teacher', teacherSchema);