// ============================================================================
// FILE: src/controllers/classController.js
// ============================================================================

const Class = require('../models/Class');
const Student = require('../models/Student');
const MonthlyPayment = require('../models/MonthlyPayment');
// const Subscription = require('../models/Subscription');

const PLAN_LIMITS = {
  free: { classes: 1, students: 30 },
  plus: { classes: 3, students: 100 },
  pro: { classes: Infinity, students: Infinity },
};

exports.getAllClasses = async (req, res) => {
  try {
    const filter = req.user.role === 'admin' ? {} : { teacher: req.user.id };
    const classes = await Class.find(filter).populate('teacher', 'name email').sort({ createdAt: -1 });
    res.json(classes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createClass = async (req, res) => {
  try {
    const { name, description, teacherId, plan = 'free' } = req.body;

    if (!name || !teacherId) {
      return res.status(400).json({ error: 'Sinf nomi va teacher majburiy' });
    }

    const teacherClassCount = await Class.countDocuments({ teacher: teacherId });
    const limit = PLAN_LIMITS[plan] || PLAN_LIMITS.free;

    if (teacherClassCount >= limit.classes) {
      return res.status(400).json({
        error: `${plan} rejimda maksimal ${limit.classes} ta sinf bo'lishi mumkin`,
      });
    }

    const newClass = new Class({
      name: name.trim(),
      description,
      teacher: teacherId,
      plan,
    });

    await newClass.save();
    await newClass.populate('teacher', 'name email');

    res.status(201).json(newClass);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateClass = async (req, res) => {
  try {
    const { classId } = req.params;
    const { name, description } = req.body;

    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Sinf nomi majburiy' });
    }

    const cls = await Class.findByIdAndUpdate(
      classId,
      { name: name.trim(), description },
      { new: true }
    ).populate('teacher', 'name email');

    if (!cls) {
      return res.status(404).json({ error: 'Sinf topilmadi' });
    }

    res.json(cls);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deleteClass = async (req, res) => {
  try {
    const { classId } = req.params;

    await MonthlyPayment.deleteMany({ class: classId });
    await Student.deleteMany({ class: classId });
    await Subscription.findOneAndDelete({ class: classId });
    await Class.findByIdAndDelete(classId);

    res.json({ message: 'Sinf va bog\'liq ma\'lumotlar o\'chirildi' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getClassReport = async (req, res) => {
  try {
    const { classId } = req.params;
    const { month, year } = req.query;

    const currentMonth = parseInt(month) || new Date().getMonth() + 1;
    const currentYear = parseInt(year) || new Date().getFullYear();

    const students = await Student.find({ class: classId, isActive: true });
    const payments = await MonthlyPayment.find({
      class: classId,
      month: currentMonth,
      year: currentYear,
    }).populate('student', 'name parentPhone');

    const report = students.map((student) => {
      const payment = payments.find(
        (p) => p.student && p.student._id.toString() === student._id.toString()
      );
      return {
        studentId: student._id,
        student: student.name,
        parentPhone: student.parentPhone,
        status: payment ? payment.status : 'not_paid',
        amount: payment ? payment.amount : 0,
        paymentId: payment ? payment._id : null,
        paidDate: payment ? payment.paidDate : null,
      };
    });

    const totalStudents = students.length;
    const paidCount = report.filter((r) => r.status === 'paid').length;
    const unpaidCount = totalStudents - paidCount;
    const totalCollected = report.filter(r => r.status === 'paid').reduce((s, r) => s + r.amount, 0);

    res.json({
      month: currentMonth,
      year: currentYear,
      totalStudents,
      paidCount,
      unpaidCount,
      totalCollected,
      report,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};