const mongoose = require('mongoose');

const monthlyPaymentSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true,
  },
  class: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class',
    required: true,
  },
  month: {
    type: Number, // 1-12
    required: true,
  },
  year: {
    type: Number,
    required: true,
  },
  status: {
    type: String,
    enum: ['paid', 'not_paid'],
    default: 'not_paid',
  },
  amount: {
    type: Number,
    default: 0,
  },
  paidDate: Date,
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('MonthlyPayment', monthlyPaymentSchema);
