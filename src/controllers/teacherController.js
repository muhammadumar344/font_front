// src/controllers/teacherController.js
const Class = require('../models/Class');
const Teacher = require('../models/Teacher');
const Student = require('../models/Student');
const MonthlyPayment = require('../models/MonthlyPayment');
const Expense = require('../models/Expense');

const PLAN_LIMITS = {
  free: { classes: 1, students: 30 },
  plus: { classes: 4, students: 100 },
  pro: { classes: Infinity, students: Infinity },
};

exports.createClass = async (req, res) => {
  try {
    const teacherId = req.user.id;
    const { name, description } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Sinf nomi majburiy' });
    }

    const teacher = await Teacher.findById(teacherId);
    if (!teacher) {
      return res.status(404).json({ error: 'Teacher topilmadi' });
    }

    const limit = PLAN_LIMITS[teacher.plan];
    const classCount = await Class.countDocuments({ teacher: teacherId });

    if (classCount >= limit.classes) {
      return res.status(400).json({
        error: `${teacher.plan} rejimda maksimal ${limit.classes} ta sinf ochishingiz mumkin`,
        currentClasses: classCount,
        limit: limit.classes,
      });
    }

    const newClass = new Class({
      name: name.trim(),
      description: description || '',
      teacher: teacherId,
      plan: teacher.plan,
    });

    await newClass.save();

    res.status(201).json({
      message: 'Sinf muvaffaqiyatli yaratildi',
      class: {
        _id: newClass._id,
        name: newClass.name,
        description: newClass.description,
        plan: newClass.plan,
        studentCount: 0,
        paidPayments: 0,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getMyClasses = async (req, res) => {
  try {
    const teacherId = req.user.id;

    const classes = await Class.find({ teacher: teacherId }).sort({ createdAt: -1 });

    const classesWithStats = await Promise.all(
      classes.map(async (cls) => {
        const studentCount = await Student.countDocuments({ class: cls._id, isActive: true });
        const paidPayments = await MonthlyPayment.countDocuments({
          class: cls._id,
          status: 'paid',
        });

        return {
          _id: cls._id,
          name: cls.name,
          description: cls.description,
          plan: cls.plan,
          studentCount,
          paidPayments,
          defaultPaymentAmount: cls.defaultPaymentAmount,
          isAmountConfigured: cls.isAmountConfigured,
          createdAt: cls.createdAt,
        };
      })
    );

    res.json({
      total: classesWithStats.length,
      classes: classesWithStats,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateMyClass = async (req, res) => {
  try {
    const teacherId = req.user.id;
    const { classId } = req.params;
    const { name, description } = req.body;

    const cls = await Class.findOne({ _id: classId, teacher: teacherId });
    if (!cls) {
      return res.status(404).json({ error: 'Sinf topilmadi yoki ruxsat yo\'q' });
    }

    if (name) cls.name = name.trim();
    if (description !== undefined) cls.description = description;

    await cls.save();

    res.json({
      message: 'Sinf yangilandi',
      class: cls,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deleteMyClass = async (req, res) => {
  try {
    const teacherId = req.user.id;
    const { classId } = req.params;

    const cls = await Class.findOne({ _id: classId, teacher: teacherId });
    if (!cls) {
      return res.status(404).json({ error: 'Sinf topilmadi yoki ruxsat yo\'q' });
    }

    await MonthlyPayment.deleteMany({ class: classId });
    await Expense.deleteMany({ class: classId });
    await Student.deleteMany({ class: classId });
    await Class.findByIdAndDelete(classId);

    res.json({
      message: 'Sinf va barcha ma\'lumotlar o\'chirildi',
      deletedClass: {
        _id: cls._id,
        name: cls.name,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.setDefaultAmount = async (req, res) => {
  try {
    const { classId } = req.params;
    const { amount } = req.body;
    const teacherId = req.user.id;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Summa 0 dan katta bo\'lishi kerak' });
    }

    const cls = await Class.findOne({ _id: classId, teacher: teacherId });
    if (!cls) {
      return res.status(404).json({ error: 'Sinf topilmadi yoki ruxsat yo\'q' });
    }

    cls.defaultPaymentAmount = amount;
    cls.isAmountConfigured = true;
    await cls.save();

    res.json({
      message: 'Default summa o\'rnatildi',
      class: {
        _id: cls._id,
        name: cls.name,
        defaultPaymentAmount: cls.defaultPaymentAmount,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getTeacherDashboard = async (req, res) => {
  try {
    const teacherId = req.user.id;
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    const teacher = await Teacher.findById(teacherId);
    if (!teacher) {
      return res.status(404).json({ error: 'Teacher topilmadi' });
    }

    const classes = await Class.find({ teacher: teacherId });
    const classIds = classes.map(c => c._id);

    const totalStudents = await Student.countDocuments({
      class: { $in: classIds },
      isActive: true,
    });

    const allPaidPayments = await MonthlyPayment.find({
      class: { $in: classIds },
      status: 'paid',
    });
    const totalCollectedAllTime = allPaidPayments.reduce((s, p) => s + p.amount, 0);

    const allExpenses = await Expense.find({
      class: { $in: classIds },
    });
    const totalExpensesAllTime = allExpenses.reduce((s, e) => s + e.amount, 0);

    const balance = totalCollectedAllTime - totalExpensesAllTime;

    const currentMonthPayments = await MonthlyPayment.find({
      class: { $in: classIds },
      month: currentMonth,
      year: currentYear,
    });
    const currentMonthPaid = currentMonthPayments.filter(p => p.status === 'paid');
    const currentMonthUnpaid = currentMonthPayments.filter(p => p.status === 'not_paid');
    const currentMonthCollected = currentMonthPaid.reduce((s, p) => s + p.amount, 0);

    const currentMonthExpenses = allExpenses
      .filter(e => e.month === currentMonth && e.year === currentYear)
      .reduce((s, e) => s + e.amount, 0);

    const recentExpenses = await Expense.find({
      class: { $in: classIds },
    })
      .sort({ createdAt: -1 })
      .limit(5);

    res.json({
      teacher: {
        id: teacher._id,
        name: teacher.name,
        email: teacher.email,
        plan: teacher.plan,
      },
      subscription: {
        plan: teacher.plan,
        expiryDate: teacher.subscriptionExpiryDate,
        isActive: teacher.subscriptionIsActive,
      },
      classes: {
        total: classes.length,
        list: classes,
      },
      students: {
        total: totalStudents,
      },
      finance: {
        totalCollectedAllTime,
        totalExpensesAllTime,
        balance,
        currentMonth: {
          month: currentMonth,
          year: currentYear,
          collected: currentMonthCollected,
          expenses: currentMonthExpenses,
          paidCount: currentMonthPaid.length,
          unpaidCount: currentMonthUnpaid.length,
          totalPayments: currentMonthPayments.length,
        },
      },
      recentExpenses,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.selectPlan = async (req, res) => {
  try {
    const teacherId = req.user.id;
    const { plan } = req.body;

    if (!['free', 'plus', 'pro'].includes(plan)) {
      return res.status(400).json({ error: 'Plan noto\'g\'ri' });
    }

    const teacher = await Teacher.findById(teacherId);
    if (!teacher) {
      return res.status(404).json({ error: 'Teacher topilmadi' });
    }

    const classCount = await Class.countDocuments({ teacher: teacherId });
    const limit = PLAN_LIMITS[plan];

    if (classCount > limit.classes) {
      return res.status(400).json({
        error: `${plan} rejimda ${limit.classes} ta sinfga ruxsat. Hozir ${classCount} ta sinfingiz bor`,
      });
    }

    teacher.plan = plan;
    await teacher.save();

    await Class.updateMany({ teacher: teacherId }, { plan });

    res.json({
      message: `Plan "${plan}" tanlandi`,
      teacher: {
        _id: teacher._id,
        name: teacher.name,
        plan: teacher.plan,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};