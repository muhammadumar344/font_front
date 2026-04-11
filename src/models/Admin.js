// src/models/Admin.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const adminSchema = new mongoose.Schema({
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
  role: {
    type: String,
    default: 'admin',
    enum: ['admin', 'superadmin']
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: Date,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

adminSchema.pre('save', async function (next) {
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

adminSchema.methods.comparePassword = async function (password) {
  try {
    return await bcrypt.compare(password, this.password);
  } catch (err) {
    throw new Error('Password tekshirishda xato');
  }
};

module.exports = mongoose.model('Admin', adminSchema);