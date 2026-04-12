// src/controllers/adminController.js
const Teacher = require('../models/Teacher');
const Class = require('../models/Class');
const Student = require('../models/Student');
const Admin = require('../models/Admin');
const jwt = require('jsonwebtoken');
const { PLAN_LIMITS, PLAN_PRICES } = require('../utils/planHelper');

// ✅ SETUP - Birinchi admin yaratish
exports.createAdmin = async (req, res) => {
  try {
    const existing = await Admin.findOne();
    if (existing) {
      return res.status(400).json({ error: 'Admin allaqachon mavjud' });
    }

    const { name, email, password } = req.body;

    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Ism majburiy' });
    }

    if (!email || email.trim() === '') {
      return res.status(400).json({ error: 'Email majburiy' });
    }

    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Parol kamita 6 belgidan iborat bo\'lishi kerak' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Email to\'g\'ri formatda emas' });
    }

    const admin = new Admin({
      name: name.trim(),
      email: email.toLowerCase(),
      password,
    });

    await admin.save();

    const token = jwt.sign(
      { id: admin._id, email: admin.email, role: 'admin' },
      process.env.JWT_SECRET_KEY || 'admin-secret-key',
      { expiresIn: '30d' }
    );

    res.status(201).json({
      message: 'Admin muvaffaqiyatli yaratildi',
      token,
      admin: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
      },
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ error: 'Bu email allaqachon ro\'yxatdan o\'tgan' });
    }
    res.status(500).json({ error: err.message });
  }
};

// Dashboard - Teachers va Class statistikasi
exports.getDashboard = async (req, res) => {
  try {
    const totalTeachers = await Teacher.countDocuments();
    const totalClasses = await Class.countDocuments();
    const totalStudents = await Student.countDocuments();

    const teachers = await Teacher.find()
      .select('-password')
      .sort({ createdAt: -1 });

    const teachersWithStats = await Promise.all(
      teachers.map(async (t) => {
        const classCount = await Class.countDocuments({ teacher: t._id });
        const studentCount = await Student.countDocuments({
          class: { $in: await Class.find({ teacher: t._id }).distinct('_id') }
        });

        // ✅ Total fund ma'lumotlari
        const allPayments = await require('../models/MonthlyPayment').find({ teacher: t._id });
        const totalFund = allPayments
          .filter(p => p.status === 'paid')
          .reduce((s, p) => s + p.amount, 0);

        return {
          ...t.toObject(),
          classCount,
          studentCount,
          totalFund,
          planActive: t.isPlanActive(),
          daysLeft: t.daysLeft(),
          activePlan: t.activePlan(),
        };
      })
    );

    res.json({
      summary: { totalTeachers, totalClasses, totalStudents },
      teachers: teachersWithStats,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Teacher yaratish
exports.createTeacher = async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Ism, email va parol majburiy' });
    }

    if (await Teacher.findOne({ email })) {
      return res.status(400).json({ error: 'Bu email allaqachon ro\'yxatdan o\'tgan' });
    }

    // Email format validatsiya
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Email to\'g\'ri formatda emas' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Parol kamita 6 belgidan iborat' });
    }

    const teacher = new Teacher({
      name: name.trim(),
      email: email.toLowerCase(),
      password,
      phone: phone || '',
      registeredDate: new Date(),
    });
    await teacher.save();

    res.status(201).json({
      message: 'Teacher muvaffaqiyatli qo\'shildi',
      teacher: {
        id: teacher._id,
        name: teacher.name,
        email: teacher.email,
        phone: teacher.phone,
        plan: teacher.plan,
        registeredDate: teacher.registeredDate,
      },
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ error: 'Bu email allaqachon ro\'yxatdan o\'tgan' });
    }
    res.status(500).json({ error: err.message });
  }
};

// Parol yangilash
exports.updateTeacherPassword = async (req, res) => {
  try {
    const { teacherId } = req.params;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'Parol kamita 6 ta belgidan iborat bo\'lsin' });
    }

    const teacher = await Teacher.findById(teacherId);
    if (!teacher) return res.status(404).json({ error: 'Teacher topilmadi' });

    teacher.password = newPassword;
    await teacher.save();

    res.json({ message: 'Parol muvaffaqiyatli yangilandi' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Plan o'rnatish
exports.updateTeacherPlan = async (req, res) => {
  try {
    const { teacherId } = req.params;
    const { plan, months = 1 } = req.body;

    if (!['free', 'pro', 'premium'].includes(plan)) {
      return res.status(400).json({ error: 'Plan: free, pro yoki premium bo\'lishi kerak' });
    }

    const teacher = await Teacher.findById(teacherId);
    if (!teacher) return res.status(404).json({ error: 'Teacher topilmadi' });

    if (plan === 'free') {
      teacher.plan = 'free';
      teacher.planExpiresAt = null;
    } else {
      // ✅ Agar hozirgi obuna tugamagan bo'lsa — ustiga qo'shiladi
      const base = teacher.isPlanActive() && teacher.plan === plan
        ? teacher.planExpiresAt
        : new Date();

      const newExpiry = new Date(base);
      newExpiry.setMonth(newExpiry.getMonth() + Number(months));

      teacher.plan = plan;
      teacher.planExpiresAt = newExpiry;
    }

    // ✅ Eng yuqori plan ni saqlash (sinflar saqlanishi uchun)
    const planRank = { free: 0, pro: 1, premium: 2 };
    if (planRank[plan] > planRank[teacher.highestPlanEver]) {
      teacher.highestPlanEver = plan;
    }

    await teacher.save();

    // ✅ Sinflar planini ham yangilash (faqat hozirgi, eskilar o'zgarmaydi)
    await Class.updateMany({ teacher: teacherId }, { plan });

    res.json({
      message: `Plan yangilandi: ${plan}, ${months} oy`,
      teacher: {
        id: teacher._id,
        name: teacher.name,
        plan: teacher.plan,
        planExpiresAt: teacher.planExpiresAt,
        daysLeft: teacher.daysLeft(),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Teacher bloklash
exports.deactivateTeacher = async (req, res) => {
  try {
    const { teacherId } = req.params;
    const teacher = await Teacher.findByIdAndUpdate(
      teacherId,
      { isActive: false },
      { new: true }
    );

    res.json({
      message: 'Teacher muvaffaqiyatli bloklandi',
      teacher: {
        id: teacher._id,
        name: teacher.name,
        isActive: teacher.isActive,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.activateTeacher = async (req, res) => {
  try {
    const { teacherId } = req.params;
    const teacher = await Teacher.findByIdAndUpdate(
      teacherId,
      { isActive: true },
      { new: true }
    );
    res.json({ message: 'Teacher faollandi', teacher });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Plan narxlari (frontend uchun)
exports.getPlanPrices = async (req, res) => {
  res.json({
    plans: [
      {
        id: 'free',
        name: 'Free',
        price: 0,
        classes: 1,
        students: 30,
        features: ['1 ta sinf', '30 ta o\'quvchi'],
        notIncluded: ['Oylik eslatma', 'Export', 'Ko\'p til'],
      },
      {
        id: 'pro',
        name: 'Pro',
        price: PLAN_PRICES.pro.monthly,
        classes: 3,
        students: 40,
        features: ['3 ta sinf', '40 ta o\'quvchi', 'Oylik eslatma modali'],
        notIncluded: ['Export (Excel/Word)', 'SMS eslatma', 'Ko\'p til'],
      },
      {
        id: 'premium',
        name: 'Premium',
        price: PLAN_PRICES.premium.monthly,
        classes: 5,
        students: 50,
        features: [
          '5 ta sinf',
          '50 ta o\'quvchi',
          'Oylik eslatma modali',
          'Export (Excel/Word)',
          'SMS eslatma',
          'Ko\'p til (uz/ru/en)',
        ],
        notIncluded: [],
      },
    ],
  });
};