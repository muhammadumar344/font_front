const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const Teacher = require('../models/Teacher');

// ====================================
// ADMIN TEACHER YARATADI
// ====================================
exports.createTeacher = async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Ism majburiy' });
    }

    if (!email || !email.trim()) {
      return res.status(400).json({ error: 'Email majburiy' });
    }

    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Parol kamita 6 belgidan iborat' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Email to\'g\'ri formatda emas' });
    }

    const existing = await Teacher.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(400).json({ error: 'Bu email allaqachon ro\'yxatdan o\'tgan' });
    }

    const teacher = new Teacher({
      name: name.trim(),
      email: email.toLowerCase(),
      password,
      phone: phone || '',
      plan: 'free', // Default plan
      subscriptionStartDate: new Date(),
      subscriptionExpiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 kun
      subscriptionIsActive: true,
      createdByAdmin: true,
    });

    await teacher.save();

    res.status(201).json({
      message: 'Teacher muvaffaqiyatli yaratildi',
      teacher: {
        _id: teacher._id,
        name: teacher.name,
        email: teacher.email,
        phone: teacher.phone,
        plan: teacher.plan,
      },
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ error: 'Bu email allaqachon ro\'yxatdan o\'tgan' });
    }
    res.status(500).json({ error: err.message });
  }
};

// ====================================
// YANGI: ADMIN TEACHER SUBSCRIPTION BELGILAYDI
// ====================================
exports.setTeacherSubscription = async (req, res) => {
  try {
    const { teacherId } = req.params;
    const { plan, months } = req.body;

    if (!plan || !months) {
      return res.status(400).json({ error: 'Plan va oylar soni majburiy' });
    }

    if (!['free', 'plus', 'pro'].includes(plan)) {
      return res.status(400).json({ error: 'Plan noto\'g\'ri' });
    }

    if (isNaN(months) || months <= 0) {
      return res.status(400).json({ error: 'Oylar soni musbat son bo\'lishi kerak' });
    }

    const teacher = await Teacher.findById(teacherId);
    if (!teacher) {
      return res.status(404).json({ error: 'Teacher topilmadi' });
    }

    const now = new Date();
    let newExpiryDate;

    // Eski subscription o'tmagan bo'lsa ustiga qo'sh
    if (!teacher.isSubscriptionExpired()) {
      newExpiryDate = new Date(teacher.subscriptionExpiryDate);
    } else {
      newExpiryDate = new Date(now);
    }

    newExpiryDate.setMonth(newExpiryDate.getMonth() + parseInt(months));

    teacher.plan = plan;
    teacher.subscriptionExpiryDate = newExpiryDate;
    teacher.subscriptionIsActive = true;
    teacher.selfDeactivated = false;

    await teacher.save();

    // Teacher barcha sinflarining planini yangilash
    await Class.updateMany({ teacher: teacherId }, { plan });

    res.json({
      message: `Teacher subscription ${months} oy uchun yangilandi (${plan})`,
      teacher: {
        _id: teacher._id,
        name: teacher.name,
        plan: teacher.plan,
        subscriptionExpiryDate: teacher.subscriptionExpiryDate,
        daysLeft: teacher.daysLeftInSubscription(),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ====================================
// YANGI: ADMIN BARCHA TEACHERS VA ULARGA TEGISHLI CLASSLARNI KO'RADI
// ====================================
exports.getAllTeachers = async (req, res) => {
  try {
    const teachers = await Teacher.find().select('-password').sort({ createdAt: -1 });

    const teachersWithStats = await Promise.all(
      teachers.map(async (teacher) => {
        const classCount = await Class.countDocuments({ teacher: teacher._id });
        const studentCount = await Student.countDocuments({
          class: { $in: await Class.find({ teacher: teacher._id }).select('_id') }
        });

        return {
          _id: teacher._id,
          name: teacher.name,
          email: teacher.email,
          phone: teacher.phone,
          plan: teacher.plan,
          subscriptionExpiryDate: teacher.subscriptionExpiryDate,
          daysLeft: teacher.daysLeftInSubscription(),
          isSubscriptionActive: teacher.subscriptionIsActive && !teacher.isSubscriptionExpired(),
          classCount,
          studentCount,
          createdAt: teacher.createdAt,
        };
      })
    );

    res.json({
      total: teachersWithStats.length,
      teachers: teachersWithStats,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ====================================
// ADMIN TEACHER O'CHIRADI
// ====================================
exports.deleteTeacher = async (req, res) => {
  try {
    const { teacherId } = req.params;

    const teacher = await Teacher.findByIdAndDelete(teacherId);
    if (!teacher) {
      return res.status(404).json({ error: 'Teacher topilmadi' });
    }

    // Teacher ning barcha sinflari o'chiriladi
    const classes = await Class.find({ teacher: teacherId });
    const classIds = classes.map(c => c._id);

    await MonthlyPayment.deleteMany({ class: { $in: classIds } });
    await Expense.deleteMany({ class: { $in: classIds } });
    await Student.deleteMany({ class: { $in: classIds } });
    await Class.deleteMany({ teacher: teacherId });

    res.json({
      message: 'Teacher va uning barcha sinflar o\'chirildi',
      deletedTeacher: {
        _id: teacher._id,
        name: teacher.name,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ====================================
// ADMIN PAROL RESET
// ====================================
exports.resetTeacherPassword = async (req, res) => {
  try {
    const { teacherId } = req.params;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'Parol kamita 6 belgidan iborat' });
    }

    const teacher = await Teacher.findById(teacherId);
    if (!teacher) {
      return res.status(404).json({ error: 'Teacher topilmadi' });
    }

    teacher.password = newPassword;
    await teacher.save();

    res.json({
      message: 'Parol yangilandi',
      teacher: {
        _id: teacher._id,
        name: teacher.name,
        email: teacher.email,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ====================================
// ADMIN DASHBOARD
// ====================================
exports.getDashboard = async (req, res) => {
  try {
    const totalTeachers = await Teacher.countDocuments();
    const totalClasses = await Class.countDocuments();
    const totalStudents = await Student.countDocuments();

    const teachers = await Teacher.find().select('-password');

    const teachersWithStats = await Promise.all(
      teachers.map(async (teacher) => {
        const classCount = await Class.countDocuments({ teacher: teacher._id });
        const studentCount = await Student.countDocuments({
          class: { $in: await Class.find({ teacher: teacher._id }).select('_id') }
        });

        return {
          _id: teacher._id,
          name: teacher.name,
          email: teacher.email,
          plan: teacher.plan,
          subscriptionExpiryDate: teacher.subscriptionExpiryDate,
          daysLeft: teacher.daysLeftInSubscription(),
          isSubscriptionActive: teacher.subscriptionIsActive && !teacher.isSubscriptionExpired(),
          classCount,
          studentCount,
        };
      })
    );

    res.json({
      summary: {
        totalTeachers,
        totalClasses,
        totalStudents,
      },
      teachers: teachersWithStats,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};