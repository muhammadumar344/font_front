// models/Class.js
const classSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Sinf nomi majburiy'],
    trim: true,
  },
  teacher: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Teacher',
    required: true,
  },
  description: String,
  
  // YANGI: Subscription O'Z TEACHER UCHUN (CLASS UCHUN EMAS)
  // Class qanday planli teacher tomonidan yaratilgan
  plan: {
    type: String,
    enum: ['free', 'plus', 'pro'],
    default: 'free',
  },
  
  defaultPaymentAmount: {
    type: Number,
    default: 0,
  },
  
  isAmountConfigured: {
    type: Boolean,
    default: false,
  },
  
  isActive: {
    type: Boolean,
    default: true,
  },
  
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Class', classSchema);