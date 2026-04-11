// src/controllers/adminController.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const Teacher = require('../models/Teacher');
const Class = require('../models/Class');
const Student = require('../models/Student');
const MonthlyPayment = require('../models/MonthlyPayment');
const Expense = require('../models/Expense');

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

exports.createTeacher = async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;

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

    const existing = await Teacher.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(400).json({ error: 'Bu email allaqachon ro\'yxatdan o\'tgan' });
    }

    const now = new Date();
    const expiryDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const teacher = new Teacher({
      name: name.trim(),
      email: email.toLowerCase(),
      password,
      phone: phone || '',
      plan: 'free',
      subscriptionStartDate: now,
      subscriptionExpiryDate: expiryDate,
      subscriptionIsActive: true,
      createdByAdmin: true,
    });

    await teacher.save();

    res.status(201).json({
      message: 'Teacher muvaffaqiyatli yaratildi',
      teacher: {
        id: teacher._id,
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

exports.getAllTeachers = async (req, res) => {
  try {
    const teachers = await Teacher.find().select('-password').sort({ createdAt: -1 });

    const teachersWithStats = await Promise.all(
      teachers.map(async (teacher) => {
        const classCount = await Class.countDocuments({ teacher: teacher._id });
        const classIds = await Class.find({ teacher: teacher._id }).select('_id');
        const studentCount = await Student.countDocuments({
          class: { $in: classIds }
        });

        return {
          _id: teacher._id,
          name: teacher.name,
          email: teacher.email,
          phone: teacher.phone,
          plan: teacher.plan,
          subscriptionExpiryDate: teacher.subscriptionExpiryDate,
          daysLeft: teacher.daysLeftInSubscription ? teacher.daysLeftInSubscription() : 0,
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

exports.deleteTeacher = async (req, res) => {
  try {
    const { teacherId } = req.params;

    const teacher = await Teacher.findByIdAndDelete(teacherId);
    if (!teacher) {
      return res.status(404).json({ error: 'Teacher topilmadi' });
    }

    const classes = await Class.find({ teacher: teacherId });
    const classIds = classes.map(c => c._id);

    await MonthlyPayment.deleteMany({ class: { $in: classIds } });
    await Expense.deleteMany({ class: { $in: classIds } });
    await Student.deleteMany({ class: { $in: classIds } });
    await Class.deleteMany({ teacher: teacherId });

    res.json({
      message: 'Teacher va barcha sinflar o\'chirildi',
      deletedTeacher: {
        _id: teacher._id,
        name: teacher.name,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.resetTeacherPassword = async (req, res) => {
  try {
    const { teacherId } = req.params;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'Parol kamita 6 belgidan iborat bo\'lishi kerak' });
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

    const isExpired = teacher.subscriptionExpiryDate < now;

    if (!isExpired) {
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

    await Class.updateMany({ teacher: teacherId }, { plan });

    res.json({
      message: `Teacher subscription ${months} oy uchun yangilandi (${plan})`,
      teacher: {
        _id: teacher._id,
        name: teacher.name,
        plan: teacher.plan,
        subscriptionExpiryDate: teacher.subscriptionExpiryDate,
        daysLeft: teacher.daysLeftInSubscription ? teacher.daysLeftInSubscription() : 0,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getDashboard = async (req, res) => {
  try {
    const totalTeachers = await Teacher.countDocuments();
    const totalClasses = await Class.countDocuments();
    const totalStudents = await Student.countDocuments();

    const teachers = await Teacher.find().select('-password');

    const teachersWithStats = await Promise.all(
      teachers.map(async (teacher) => {
        const classCount = await Class.countDocuments({ teacher: teacher._id });
        const classIds = await Class.find({ teacher: teacher._id }).select('_id');
        const studentCount = await Student.countDocuments({
          class: { $in: classIds }
        });

        return {
          _id: teacher._id,
          name: teacher.name,
          email: teacher.email,
          plan: teacher.plan,
          subscriptionExpiryDate: teacher.subscriptionExpiryDate,
          daysLeft: teacher.daysLeftInSubscription ? teacher.daysLeftInSubscription() : 0,
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