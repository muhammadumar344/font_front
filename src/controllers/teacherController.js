// backend/src/controllers/teacherController.js
const Class = require('../models/Class');
const Student = require('../models/Student');
const MonthlyPayment = require('../models/MonthlyPayment');
const Expense = require('../models/Expense');
const XLSX = require('xlsx');
const { Document, Packer, Table, TableRow, TableCell, Paragraph } = require('docx');
const Teacher = require('../models/Teacher');
const { PLAN_LIMITS, hasFeature, canOpenNewClass, canAddStudent } = require('../utils/planHelper');

// ============================================================
//  CLASSES
// ============================================================

exports.sendSmsReminders = async (req, res) => {
  try {
    const { classId, month, year } = req.body;
    const teacherId = req.user.id;

    const teacher = await Teacher.findById(teacherId);
    if (!teacher) return res.status(404).json({ error: 'Teacher topilmadi' });

    // ✅ FAQAT PREMIUM
    if (!hasFeature(teacher, 'sms_reminder')) {
      return res.status(403).json({
        error: 'SMS reminder funksiyasi faqat Premium uchun',
        requiresUpgrade: true,
      });
    }

    const cls = await Class.findOne({ _id: classId, teacher: teacherId });
    if (!cls) return res.status(404).json({ error: 'Sinf topilmadi' });

    const payments = await MonthlyPayment.find({
      class: classId,
      month: Number(month),
      year: Number(year),
      status: 'not_paid',
    })
      .populate('student', 'name parentPhone rollNumber');

    const smsService = require('../services/smsService');
    const studentsToNotify = payments.map(p => ({
      _id: p.student._id,
      name: p.student.name,
      parentPhone: p.student.parentPhone,
      amount: p.amount,
    }));

    const results = await smsService.sendBulkReminders(
      studentsToNotify,
      cls.name,
      month,
      year
    );

    const successCount = results.filter(r => r.status === 'sent').length;
    const failedCount = results.filter(r => r.status === 'failed').length;

    res.json({
      message: 'SMS reminder yuborildi',
      summary: {
        total: results.length,
        sent: successCount,
        failed: failedCount,
      },
      details: results,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
exports.createClass = async (req, res) => {
  try {
    const { name, defaultAmount } = req.body;
    const teacherId = req.user.id;

    if (!name || !defaultAmount) {
      return res.status(400).json({ error: 'Sinf nomi va default summa majburiy' });
    }

    const teacher = await Teacher.findById(teacherId);
    if (!teacher) return res.status(404).json({ error: 'Teacher topilmadi' });

    const currentClassCount = await Class.countDocuments({ teacher: teacherId });
    if (!canOpenNewClass(teacher, currentClassCount)) {
      const activePlan = teacher.isPlanActive() ? teacher.plan : 'free';
      const limit = PLAN_LIMITS[activePlan];
      return res.status(400).json({
        error: teacher.isPlanActive()
          ? `${teacher.plan} rejimda maksimal ${limit.classes} ta sinf ochishingiz mumkin`
          : `Obunangiz tugagan. Yangi sinf ochish uchun Pro yoki Premium sotib oling`,
        requiresUpgrade: !teacher.isPlanActive(),
      });
    }

    const activePlan = teacher.isPlanActive() ? teacher.plan : 'free';

    const newClass = new Class({
      name,
      teacher: teacherId,
      defaultAmount: Number(defaultAmount),
      plan: activePlan,
    });

    await newClass.save();
    res.status(201).json({ message: 'Sinf yaratildi', class: newClass });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getMyClasses = async (req, res) => {
  try {
    const teacherId = req.user.id;
    const classes = await Class.find({ teacher: teacherId });

    const classesWithStats = await Promise.all(
      classes.map(async (cls) => {
        const studentCount = await Student.countDocuments({ class: cls._id });
        return { ...cls.toObject(), studentCount };
      })
    );

    res.json({ classes: classesWithStats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateClassDefaultAmount = async (req, res) => {
  try {
    const { classId } = req.params;
    const { defaultAmount } = req.body;
    const teacherId = req.user.id;

    const cls = await Class.findOne({ _id: classId, teacher: teacherId });
    if (!cls) return res.status(404).json({ error: 'Sinf topilmadi yoki ruxsat yo\'q' });

    cls.defaultAmount = Number(defaultAmount);
    await cls.save();

    res.json({ message: 'Default summa yangilandi', class: cls });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deleteClass = async (req, res) => {
  try {
    const { classId } = req.params;
    const teacherId = req.user.id;

    const cls = await Class.findOne({ _id: classId, teacher: teacherId });
    if (!cls) return res.status(404).json({ error: 'Sinf topilmadi yoki ruxsat yo\'q' });

    await Student.deleteMany({ class: classId });
    await MonthlyPayment.deleteMany({ class: classId });
    await Expense.deleteMany({ class: classId });
    await Class.findByIdAndDelete(classId);

    res.json({ message: 'Sinf o\'chirildi' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ============================================================
//  STUDENTS
// ============================================================

exports.addStudent = async (req, res) => {
  try {
    const classId = req.params.classId;
    const { name, parentPhone } = req.body;
    const teacherId = req.user.id;

    if (!name) return res.status(400).json({ error: 'O\'quvchi ismi majburiy' });

    const cls = await Class.findOne({ _id: classId, teacher: teacherId });
    if (!cls) return res.status(400).json({ error: 'Sinf topilmadi yoki ruxsat yo\'q' });

    const studentCount = await Student.countDocuments({ class: classId });
    if (!canAddStudent(cls.plan, studentCount)) {
      const limit = PLAN_LIMITS[cls.plan] || PLAN_LIMITS.free;
      return res.status(400).json({
        error: `Bu sinfga maksimal ${limit.students} ta o'quvchi qo'shish mumkin (${cls.plan} plan)`
      });
    }

    const student = new Student({
      name,
      class: classId,
      parentPhone: parentPhone || '',
      rollNumber: studentCount + 1,
    });

    await student.save();
    res.status(201).json({ message: 'O\'quvchi qo\'shildi', student });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getClassStudents = async (req, res) => {
  try {
    const classId = req.params.classId;
    const teacherId = req.user.id;

    const cls = await Class.findOne({ _id: classId, teacher: teacherId });
    if (!cls) return res.status(404).json({ error: 'Sinf topilmadi yoki ruxsat yo\'q' });

    const students = await Student.find({ class: classId }).sort({ rollNumber: 1 });
    res.json({ students });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deleteStudent = async (req, res) => {
  try {
    const { studentId } = req.params;
    const teacherId = req.user.id;

    const student = await Student.findById(studentId);
    if (!student) return res.status(404).json({ error: 'O\'quvchi topilmadi' });

    const cls = await Class.findOne({ _id: student.class, teacher: teacherId });
    if (!cls) return res.status(403).json({ error: 'Ruxsat yo\'q' });

    await MonthlyPayment.deleteMany({ student: studentId });
    await Student.findByIdAndDelete(studentId);

    res.json({ message: 'O\'quvchi o\'chirildi' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ============================================================
//  PAYMENTS
// ============================================================

exports.createMonthlyPayments = async (req, res) => {
  try {
    const { classId, month, year } = req.body;
    const teacherId = req.user.id;

    if (!classId) {
      return res.status(400).json({ error: 'classId majburiy' });
    }
    if (!month || !year) {
      return res.status(400).json({ error: 'month va year majburiy' });
    }

    const cls = await Class.findOne({ _id: classId, teacher: teacherId });
    if (!cls) {
      return res.status(404).json({ error: 'Sinf topilmadi yoki ruxsat yo\'q' });
    }

    const students = await Student.find({ class: classId });
    if (students.length === 0) {
      return res.status(400).json({ error: 'Bu sinfda o\'quvchi yo\'q' });
    }

    let createdCount = 0;
    let alreadyExisted = 0;

    for (const student of students) {
      try {
        const existing = await MonthlyPayment.findOne({
          student: student._id,
          class: classId,
          month: Number(month),
          year: Number(year),
        });

        if (!existing) {
          await MonthlyPayment.create({
            student: student._id,
            class: classId,
            teacher: teacherId,
            amount: cls.defaultAmount,
            month: Number(month),
            year: Number(year),
            status: 'not_paid',
          });
          createdCount++;
        } else {
          alreadyExisted++;
        }
      } catch (err) {
        console.error(`Error creating payment for student ${student._id}:`, err);
      }
    }

    const expectedTotal = students.length * cls.defaultAmount;

    res.json({
      message: `${createdCount} ta to'lov yaratildi`,
      createdCount,
      alreadyExisted,
      defaultAmount: cls.defaultAmount,
      studentsCount: students.length,
      expectedTotal,
    });
  } catch (err) {
    console.error('createMonthlyPayments error:', err);
    res.status(500).json({ error: err.message });
  }
};

exports.getMonthlyPayments = async (req, res) => {
  try {
    const teacherId = req.user.id;
    const { month, year } = req.query;

    const classes = await Class.find({ teacher: teacherId });
    const classIds = classes.map(c => c._id);

    const query = { class: { $in: classIds } };
    if (month) query.month = Number(month);
    if (year) query.year = Number(year);

    const payments = await MonthlyPayment.find(query)
      .populate('student', 'name parentPhone rollNumber')
      .populate('class', 'name defaultAmount')
      .sort({ class: 1 });

    const classStats = {};
    for (const cls of classes) {
      const studentCount = await Student.countDocuments({ class: cls._id });
      classStats[cls._id.toString()] = {
        className: cls.name,
        defaultAmount: cls.defaultAmount,
        studentCount,
        expectedTotal: studentCount * cls.defaultAmount,
      };
    }

    const paidPayments = payments.filter(p => p.status === 'paid');
    const paidCount = paidPayments.length;
    const unpaidCount = payments.length - paidCount;
    const collectedTotal = paidPayments.reduce((s, p) => s + p.amount, 0);

    const expectedTotal = Object.values(classStats)
      .reduce((s, c) => s + c.expectedTotal, 0);

    res.json({
      payments,
      classStats,
      summary: {
        paidCount,
        unpaidCount,
        collectedTotal,
        expectedTotal,
        remaining: expectedTotal - collectedTotal,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getClassPayments = async (req, res) => {
  try {
    const { classId } = req.params;
    const { month, year } = req.query;
    const teacherId = req.user.id;

    const cls = await Class.findOne({ _id: classId, teacher: teacherId });
    if (!cls) return res.status(404).json({ error: 'Sinf topilmadi' });

    const students = await Student.find({ class: classId });

    const query = { class: classId };
    if (month) query.month = Number(month);
    if (year) query.year = Number(year);

    const payments = await MonthlyPayment.find(query)
      .populate('student', 'name parentPhone rollNumber')
      .sort({ 'student.rollNumber': 1 });

    const paidPayments = payments.filter(p => p.status === 'paid');
    const collectedTotal = paidPayments.reduce((s, p) => s + p.amount, 0);
    const expectedTotal = students.length * cls.defaultAmount;
    const remaining = expectedTotal - collectedTotal;

    res.json({
      class: {
        id: cls._id,
        name: cls.name,
        defaultAmount: cls.defaultAmount,
        studentCount: students.length,
      },
      payments,
      summary: {
        studentCount: students.length,
        paidCount: paidPayments.length,
        unpaidCount: students.length - paidPayments.length,
        expectedTotal,
        collectedTotal,
        remaining,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updatePaymentStatus = async (req, res) => {
  try {
    const { paymentId } = req.params;
    const { status } = req.body;
    const teacherId = req.user.id;

    if (!['paid', 'not_paid'].includes(status)) {
      return res.status(400).json({ error: 'Status: paid yoki not_paid bo\'lishi kerak' });
    }

    const payment = await MonthlyPayment.findById(paymentId).populate('class');
    if (!payment) return res.status(404).json({ error: 'To\'lov topilmadi' });

    if (payment.class.teacher.toString() !== teacherId) {
      return res.status(403).json({ error: 'Ruxsat yo\'q' });
    }

    payment.status = status;
    payment.paidDate = status === 'paid' ? new Date() : null;
    await payment.save();

    await payment.populate('student', 'name parentPhone rollNumber');
    res.json({ message: 'Status yangilandi', payment });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ============================================================
//  MONTHLY REMINDER (Pro/Premium)
// ============================================================

exports.getMonthlyReminder = async (req, res) => {
  try {
    const teacherId = req.user.id;
    const { month, year } = req.query;

    const teacher = await Teacher.findById(teacherId);
    if (!teacher) return res.status(404).json({ error: 'Teacher topilmadi' });

    if (!hasFeature(teacher, 'monthly_reminder')) {
      return res.status(403).json({
        error: 'Bu funksiya Pro va Premium uchun',
        requiresUpgrade: true,
      });
    }

    const now = new Date();
    const m = Number(month) || now.getMonth() + 1;
    const y = Number(year) || now.getFullYear();

    const classes = await Class.find({ teacher: teacherId });
    const classIds = classes.map(c => c._id);

    const unpaidPayments = await MonthlyPayment.find({
      class: { $in: classIds },
      month: m,
      year: y,
      status: 'not_paid',
    })
      .populate('student', 'name parentPhone rollNumber')
      .populate('class', 'name defaultAmount');

    const grouped = {};
    for (const p of unpaidPayments) {
      const cid = p.class._id.toString();
      if (!grouped[cid]) {
        grouped[cid] = {
          classId: cid,
          className: p.class.name,
          defaultAmount: p.class.defaultAmount,
          unpaidStudents: [],
          totalUnpaid: 0,
        };
      }
      grouped[cid].unpaidStudents.push({
        rollNumber: p.student.rollNumber,
        name: p.student.name,
        parentPhone: p.student.parentPhone,
        amount: p.amount,
      });
      grouped[cid].totalUnpaid += p.amount;
    }

    let extraData = {};
    if (hasFeature(teacher, 'export')) {
      const allPaid = await MonthlyPayment.find({
        class: { $in: classIds },
        status: 'paid'
      });
      const allExpenses = await Expense.find({ teacher: teacherId });
      extraData.overallBalance = {
        totalIncome: allPaid.reduce((s, p) => s + p.amount, 0),
        totalExpenses: allExpenses.reduce((s, e) => s + e.amount, 0),
      };
      extraData.overallBalance.balance =
        extraData.overallBalance.totalIncome - extraData.overallBalance.totalExpenses;
    }

    res.json({
      month: m,
      year: y,
      totalUnpaidStudents: unpaidPayments.length,
      classes: Object.values(grouped),
      ...extraData,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ============================================================
//  EXPORT (Premium)
// ============================================================

exports.exportPayments = async (req, res) => {
  try {
    const { classId } = req.params;
    const { month, year, format = 'json' } = req.query;
    const teacherId = req.user.id;

    const teacher = await Teacher.findById(teacherId);
    if (!hasFeature(teacher, 'export')) {
      return res.status(403).json({
        error: 'Export funksiyasi faqat Premium uchun',
        requiresUpgrade: true,
      });
    }

    const cls = await Class.findOne({ _id: classId, teacher: teacherId });
    if (!cls) return res.status(404).json({ error: 'Sinf topilmadi' });

    const students = await Student.find({ class: classId }).sort({ rollNumber: 1 });
    const query = { class: classId };
    if (month) query.month = Number(month);
    if (year) query.year = Number(year);

    const payments = await MonthlyPayment.find(query)
      .populate('student', 'name parentPhone rollNumber');

    const exportData = students.map(student => {
      const payment = payments.find(
        p => p.student._id.toString() === student._id.toString()
      );
      return {
        '№': student.rollNumber,
        'O\'quvchi ismi': student.name,
        'Ota-ona telefoni': student.parentPhone || '—',
        'Summa (so\'m)': payment ? payment.amount : cls.defaultAmount,
        'Holati': payment?.status === 'paid' ? 'To\'lagan' : 'To\'lamagan',
        'To\'lagan sanasi': payment?.paidDate
          ? new Date(payment.paidDate).toLocaleDateString('uz-UZ')
          : '—',
      };
    });

    const paidCount = exportData.filter(r => r['Holati'] === 'To\'lagan').length;
    const collected = payments
      .filter(p => p.status === 'paid')
      .reduce((s, p) => s + p.amount, 0);
    const expectedTotal = students.length * cls.defaultAmount;

    if (format === 'excel') {
      return exportExcel(res, cls, exportData, {
        paidCount,
        expectedTotal,
        collectedTotal: collected,
        remaining: expectedTotal - collected,
        month: Number(month),
        year: Number(year),
      });
    } else if (format === 'word') {
      return exportWord(res, cls, exportData, {
        paidCount,
        expectedTotal,
        collectedTotal: collected,
        remaining: expectedTotal - collected,
        month: Number(month),
        year: Number(year),
      });
    } else {
      res.json({
        exportData,
        meta: {
          className: cls.name,
          month: Number(month),
          year: Number(year),
          studentCount: students.length,
          paidCount,
          unpaidCount: students.length - paidCount,
          expectedTotal,
          collectedTotal: collected,
          remaining: expectedTotal - collected,
        },
      });
    }
  } catch (err) {
    console.error('Export error:', err);
    res.status(500).json({ error: err.message });
  }
};

// ✅ EXCEL EXPORT
const exportExcel = (res, cls, data, meta) => {
  try {
    const workbook = XLSX.utils.book_new();

    // Data sheet
    const dataSheet = XLSX.utils.json_to_sheet(data);
    
    // Column widths
    dataSheet['!cols'] = [
      { wch: 5 },   // №
      { wch: 20 },  // O'quvchi ismi
      { wch: 15 },  // Telefon
      { wch: 12 },  // Summa
      { wch: 12 },  // Holati
      { wch: 15 }   // Sana
    ];
    
    XLSX.utils.book_append_sheet(workbook, dataSheet, "To'lovlar");

    // Summary sheet
    const summaryData = [
      ['Sinf nomi:', cls.name],
      ['Oy:', meta.month],
      ['Yil:', meta.year],
      [''],
      ['Jami o\'quvchilar:', data.length],
      ['To\'lagan:', meta.paidCount],
      ['To\'lamagan:', data.length - meta.paidCount],
      [''],
      ['Jami kutilayotgan (so\'m):', meta.expectedTotal],
      ['Yig\'ilgan (so\'m):', meta.collectedTotal],
      ['Qolgan (so\'m):', meta.remaining],
    ];
    
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    summarySheet['!cols'] = [{ wch: 25 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Hisobot');

    const fileName = `${cls.name}_${meta.month}_${meta.year}.xlsx`;
    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });

    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (err) {
    console.error('Excel export error:', err);
    res.status(500).json({ error: 'Excel export xatosi: ' + err.message });
  }
};

// ✅ WORD EXPORT - FIXED
const exportWord = (res, cls, data, meta) => {
  try {
    // Table rows
    const tableRows = [
      new TableRow({
        children: [
          new TableCell({ children: [new Paragraph({ text: '№', bold: true })] }),
          new TableCell({ children: [new Paragraph({ text: "O'quvchi ismi", bold: true })] }),
          new TableCell({ children: [new Paragraph({ text: 'Telefon', bold: true })] }),
          new TableCell({ children: [new Paragraph({ text: 'Summa', bold: true })] }),
          new TableCell({ children: [new Paragraph({ text: 'Holati', bold: true })] }),
          new TableCell({ children: [new Paragraph({ text: 'Sana', bold: true })] }),
        ],
      }),
    ];

    // Data rows
    data.forEach(row => {
      tableRows.push(
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph(row['№']?.toString() || '')] }),
            new TableCell({ children: [new Paragraph(row["O'quvchi ismi"] || '')] }),
            new TableCell({ children: [new Paragraph(row['Ota-ona telefoni'] || '')] }),
            new TableCell({ children: [new Paragraph(row['Summa (so\'m)']?.toString() || '')] }),
            new TableCell({ children: [new Paragraph(row['Holati'] || '')] }),
            new TableCell({ children: [new Paragraph(row['To\'lagan sanasi'] || '')] }),
          ],
        })
      );
    });

    const doc = new Document({
      sections: [
        {
          children: [
            new Paragraph({
              text: `${cls.name} - To'lovlar Hisobati`,
              bold: true,
              size: 28,
            }),
            new Paragraph({ text: '' }),
            new Paragraph({
              text: `Oy: ${meta.month}, Yil: ${meta.year}`,
              size: 20,
            }),
            new Paragraph({
              text: `Jami o'quvchilar: ${data.length}`,
              size: 20,
            }),
            new Paragraph({
              text: `To'lagan: ${meta.paidCount}`,
              size: 20,
            }),
            new Paragraph({
              text: `To'lamagan: ${data.length - meta.paidCount}`,
              size: 20,
            }),
            new Paragraph({ text: '' }),
            new Paragraph({
              text: `Jami kutilayotgan: ${meta.expectedTotal} so'm`,
              size: 20,
              bold: true,
            }),
            new Paragraph({
              text: `Yig'ilgan: ${meta.collectedTotal} so'm`,
              size: 20,
              bold: true,
            }),
            new Paragraph({
              text: `Qolgan: ${meta.remaining} so'm`,
              size: 20,
              bold: true,
            }),
            new Paragraph({ text: '' }),
            new Table({
              rows: tableRows,
              width: { size: 100, type: 'auto' },
            }),
          ],
        },
      ],
    });

    Packer.toBuffer(doc)
      .then(buffer => {
        const fileName = `${cls.name}_${meta.month}_${meta.year}.docx`;
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.send(buffer);
      })
      .catch(err => {
        console.error('Word Packer error:', err);
        res.status(500).json({ error: 'Word export xatosi: ' + err.message });
      });
  } catch (err) {
    console.error('Word export error:', err);
    res.status(500).json({ error: 'Word export xatosi: ' + err.message });
  }
};

// ============================================================
//  EXPENSES
// ============================================================

exports.addExpense = async (req, res) => {
  try {
    const { classId, reason, amount, month, year, description } = req.body;
    const teacherId = req.user.id;

    if (!classId || !reason || !amount || !month || !year) {
      return res.status(400).json({ error: 'Barcha majburiy maydonlarni to\'ldiring' });
    }

    const cls = await Class.findOne({ _id: classId, teacher: teacherId });
    if (!cls) return res.status(404).json({ error: 'Sinf topilmadi' });

    const expense = new Expense({
      class: classId,
      teacher: teacherId,
      reason,
      amount: Number(amount),
      month: Number(month),
      year: Number(year),
      description: description || '',
    });

    await expense.save();
    res.status(201).json({ message: 'Xarajat qo\'shildi', expense });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getExpenses = async (req, res) => {
  try {
    const teacherId = req.user.id;
    const { month, year } = req.query;

    const query = { teacher: teacherId };
    if (month) query.month = Number(month);
    if (year) query.year = Number(year);

    const expenses = await Expense.find(query)
      .populate('class', 'name')
      .sort({ createdAt: -1 });

    const total = expenses.reduce((s, e) => s + e.amount, 0);
    res.json({ expenses, total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deleteExpense = async (req, res) => {
  try {
    const { expenseId } = req.params;
    const teacherId = req.user.id;

    const expense = await Expense.findOne({ _id: expenseId, teacher: teacherId });
    if (!expense) return res.status(404).json({ error: 'Xarajat topilmadi yoki ruxsat yo\'q' });

    await expense.deleteOne();
    res.json({ message: 'Xarajat o\'chirildi' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ============================================================
//  DASHBOARD
// ============================================================

exports.getDashboard = async (req, res) => {
  try {
    const teacherId = req.user.id;
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    const teacher = await Teacher.findById(teacherId);
    if (!teacher) return res.status(404).json({ error: 'Teacher topilmadi' });

    const classes = await Class.find({ teacher: teacherId });
    const classIds = classes.map(c => c._id);

    const totalStudents = await Student.countDocuments({ class: { $in: classIds } });

    const monthlyPayments = await MonthlyPayment.find({
      teacher: teacherId,
      month: currentMonth,
      year: currentYear,
    });

    const paidPayments = monthlyPayments.filter(p => p.status === 'paid');
    const paidCount = paidPayments.length;
    const unpaidCount = monthlyPayments.length - paidCount;
    const collectedThisMonth = paidPayments.reduce((s, p) => s + p.amount, 0);

    let expectedThisMonth = 0;
    for (const cls of classes) {
      const sc = await Student.countDocuments({ class: cls._id });
      expectedThisMonth += sc * cls.defaultAmount;
    }

    const expensesThisMonth = await Expense.find({
      teacher: teacherId,
      month: currentMonth,
      year: currentYear,
    });
    const expensesTotal = expensesThisMonth.reduce((s, e) => s + e.amount, 0);

    const planActive = teacher.isPlanActive();
    const daysLeft = teacher.daysLeft();

    res.json({
      teacher: {
        name: teacher.name,
        email: teacher.email,
        plan: teacher.plan,
        planActive,
        daysLeft,
        planExpiresAt: teacher.planExpiresAt,
        activePlan: teacher.activePlan(),
        features: {
          monthly_reminder: hasFeature(teacher, 'monthly_reminder'),
          export: hasFeature(teacher, 'export'),
          multi_lang: hasFeature(teacher, 'multi_lang'),
          sms_reminder: hasFeature(teacher, 'sms_reminder'),
        },
      },
      registeredDate: teacher.registeredDate || teacher.createdAt,
      summary: {
        totalClasses: classes.length,
        totalStudents,
        currentMonth,
        currentYear,
        paidCount,
        unpaidCount,
        collectedThisMonth,
        expectedThisMonth,
        remainingThisMonth: expectedThisMonth - collectedThisMonth,
        expensesTotal,
        balance: collectedThisMonth - expensesTotal,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ============================================================
//  SUBSCRIPTION
// ============================================================

exports.getSubscriptionInfo = async (req, res) => {
  try {
    const teacher = await Teacher.findById(req.user.id);
    if (!teacher) return res.status(404).json({ error: 'Teacher topilmadi' });

    res.json({
      currentPlan: teacher.plan,
      planActive: teacher.isPlanActive(),
      daysLeft: teacher.daysLeft(),
      planExpiresAt: teacher.planExpiresAt,
      activePlan: teacher.activePlan(),
      highestPlanEver: teacher.highestPlanEver,
      features: {
        monthly_reminder: hasFeature(teacher, 'monthly_reminder'),
        export: hasFeature(teacher, 'export'),
        multi_lang: hasFeature(teacher, 'multi_lang'),
        sms_reminder: hasFeature(teacher, 'sms_reminder'),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};