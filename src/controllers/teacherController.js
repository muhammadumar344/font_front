// backend/src/controllers/teacherController.js
const Class = require('../models/Class')
const Student = require('../models/Student')
const MonthlyPayment = require('../models/MonthlyPayment')
const Expense = require('../models/Expense')
const Teacher = require('../models/Teacher')
const XLSX = require('xlsx')
const { Document, Packer, Table, TableRow, TableCell, Paragraph } = require('docx')
const { PLAN_LIMITS, hasFeature, canOpenNewClass, canAddStudent } = require('../utils/planHelper')
const smsService = require('../services/smsService')

// ============================================================
//  CLASSES
// ============================================================

/**
 * @desc    Create new class
 * @route   POST /api/teacher/classes
 * @access  Private
 */
exports.createClass = async (req, res) => {
  try {
    const { name, defaultAmount } = req.body
    const teacherId = req.user.id

    // Validation
    if (!name || !defaultAmount) {
      return res.status(400).json({
        success: false,
        error: 'Sinf nomi va default summa majburiy',
      })
    }

    if (defaultAmount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Summa 0 dan katta bo\'lishi kerak',
      })
    }

    // Teacher tekshirish
    const teacher = await Teacher.findById(teacherId)
    if (!teacher) {
      return res.status(404).json({
        success: false,
        error: 'Teacher topilmadi',
      })
    }

    // Plan limits tekshirish
    const currentClassCount = await Class.countDocuments({ teacher: teacherId })
    if (!canOpenNewClass(teacher, currentClassCount)) {
      const activePlan = teacher.isPlanActive() ? teacher.plan : 'free'
      const limit = PLAN_LIMITS[activePlan]

      return res.status(403).json({
        success: false,
        error: teacher.isPlanActive()
          ? `${activePlan.toUpperCase()} rejimda maksimal ${limit.classes} ta sinf ochishingiz mumkin`
          : 'Obunangiz tugagan. Yangi sinf ochish uchun Pro yoki Premium sotib oling',
        requiresUpgrade: !teacher.isPlanActive(),
      })
    }

    // Sinf yaratish
    const activePlan = teacher.isPlanActive() ? teacher.plan : 'free'
    const newClass = new Class({
      name: name.trim(),
      teacher: teacherId,
      defaultAmount: Number(defaultAmount),
      plan: activePlan,
    })

    await newClass.save()

    res.status(201).json({
      success: true,
      message: 'Sinf muvaffaqiyatli yaratildi',
      class: newClass,
    })
  } catch (err) {
    console.error('createClass error:', err)
    res.status(500).json({
      success: false,
      error: err.message,
    })
  }
}

/**
 * @desc    Get all classes for teacher
 * @route   GET /api/teacher/classes
 * @access  Private
 */
exports.getMyClasses = async (req, res) => {
  try {
    const teacherId = req.user.id

    const classes = await Class.find({ teacher: teacherId }).sort({ createdAt: -1 })

    // Stats qo'shish
    const classesWithStats = await Promise.all(
      classes.map(async (cls) => {
        const studentCount = await Student.countDocuments({ class: cls._id })
        const payments = await MonthlyPayment.find({ class: cls._id })
        const paidCount = payments.filter((p) => p.status === 'paid').length

        return {
          ...cls.toObject(),
          studentCount,
          paidCount,
          unpaidCount: payments.length - paidCount,
        }
      })
    )

    res.json({
      success: true,
      classes: classesWithStats,
    })
  } catch (err) {
    console.error('getMyClasses error:', err)
    res.status(500).json({
      success: false,
      error: err.message,
    })
  }
}

/**
 * @desc    Update class default amount
 * @route   PATCH /api/teacher/classes/:classId
 * @access  Private
 */
exports.updateClassDefaultAmount = async (req, res) => {
  try {
    const { classId } = req.params
    const { defaultAmount } = req.body
    const teacherId = req.user.id

    if (!defaultAmount || defaultAmount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Summa 0 dan katta bo\'lishi kerak',
      })
    }

    const cls = await Class.findOne({ _id: classId, teacher: teacherId })
    if (!cls) {
      return res.status(404).json({
        success: false,
        error: 'Sinf topilmadi yoki ruxsat yo\'q',
      })
    }

    cls.defaultAmount = Number(defaultAmount)
    await cls.save()

    res.json({
      success: true,
      message: 'Default summa yangilandi',
      class: cls,
    })
  } catch (err) {
    console.error('updateClassDefaultAmount error:', err)
    res.status(500).json({
      success: false,
      error: err.message,
    })
  }
}

/**
 * @desc    Delete class and related data
 * @route   DELETE /api/teacher/classes/:classId
 * @access  Private
 */
exports.deleteClass = async (req, res) => {
  try {
    const { classId } = req.params
    const teacherId = req.user.id

    const cls = await Class.findOne({ _id: classId, teacher: teacherId })
    if (!cls) {
      return res.status(404).json({
        success: false,
        error: 'Sinf topilmadi yoki ruxsat yo\'q',
      })
    }

    // Barcha bog'liq ma'lumotlarni o'chirish
    await Student.deleteMany({ class: classId })
    await MonthlyPayment.deleteMany({ class: classId })
    await Expense.deleteMany({ class: classId })
    await Class.findByIdAndDelete(classId)

    res.json({
      success: true,
      message: 'Sinf va barcha bog\'liq ma\'lumotlar o\'chirildi',
    })
  } catch (err) {
    console.error('deleteClass error:', err)
    res.status(500).json({
      success: false,
      error: err.message,
    })
  }
}

// ============================================================
//  STUDENTS
// ============================================================

/**
 * @desc    Add student to class
 * @route   POST /api/teacher/classes/:classId/students
 * @access  Private
 */
exports.addStudent = async (req, res) => {
  try {
    const { classId } = req.params
    const { name, parentPhone } = req.body
    const teacherId = req.user.id

    // Validation
    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        error: "O'quvchi ismi majburiy",
      })
    }

    // Class tekshirish
    const cls = await Class.findOne({ _id: classId, teacher: teacherId })
    if (!cls) {
      return res.status(404).json({
        success: false,
        error: 'Sinf topilmadi yoki ruxsat yo\'q',
      })
    }

    // Plan limits
    const studentCount = await Student.countDocuments({ class: classId })
    if (!canAddStudent(cls.plan, studentCount)) {
      const limit = PLAN_LIMITS[cls.plan] || PLAN_LIMITS.free

      return res.status(403).json({
        success: false,
        error: `Bu sinfga maksimal ${limit.students} ta o'quvchi qo'shish mumkin`,
        requiresUpgrade: true,
      })
    }

    // O'quvchi yaratish
    const student = new Student({
      name: name.trim(),
      class: classId,
      parentPhone: (parentPhone || '').trim(),
      rollNumber: studentCount + 1,
    })

    await student.save()

    res.status(201).json({
      success: true,
      message: "O'quvchi qo'shildi",
      student,
    })
  } catch (err) {
    console.error('addStudent error:', err)
    res.status(500).json({
      success: false,
      error: err.message,
    })
  }
}

/**
 * @desc    Get students in class
 * @route   GET /api/teacher/classes/:classId/students
 * @access  Private
 */
exports.getClassStudents = async (req, res) => {
  try {
    const { classId } = req.params
    const teacherId = req.user.id

    // Class tekshirish
    const cls = await Class.findOne({ _id: classId, teacher: teacherId })
    if (!cls) {
      return res.status(404).json({
        success: false,
        error: 'Sinf topilmadi yoki ruxsat yo\'q',
      })
    }

    const students = await Student.find({ class: classId }).sort({ rollNumber: 1 })

    res.json({
      success: true,
      students,
    })
  } catch (err) {
    console.error('getClassStudents error:', err)
    res.status(500).json({
      success: false,
      error: err.message,
    })
  }
}

/**
 * @desc    Delete student
 * @route   DELETE /api/teacher/students/:studentId
 * @access  Private
 */
exports.deleteStudent = async (req, res) => {
  try {
    const { studentId } = req.params
    const teacherId = req.user.id

    const student = await Student.findById(studentId)
    if (!student) {
      return res.status(404).json({
        success: false,
        error: "O'quvchi topilmadi",
      })
    }

    // Authorization
    const cls = await Class.findOne({ _id: student.class, teacher: teacherId })
    if (!cls) {
      return res.status(403).json({
        success: false,
        error: 'Ruxsat yo\'q',
      })
    }

    // Delete related payments
    await MonthlyPayment.deleteMany({ student: studentId })
    await Student.findByIdAndDelete(studentId)

    res.json({
      success: true,
      message: "O'quvchi o'chirildi",
    })
  } catch (err) {
    console.error('deleteStudent error:', err)
    res.status(500).json({
      success: false,
      error: err.message,
    })
  }
}

// ============================================================
//  PAYMENTS
// ============================================================

/**
 * @desc    Create monthly payments for class
 * @route   POST /api/teacher/payments/create
 * @access  Private
 */
exports.createMonthlyPayments = async (req, res) => {
  try {
    const { classId, month, year } = req.body
    const teacherId = req.user.id

    // Validation
    if (!classId || !month || !year) {
      return res.status(400).json({
        success: false,
        error: 'classId, month, year majburiy',
      })
    }

    if (month < 1 || month > 12 || year < 2020) {
      return res.status(400).json({
        success: false,
        error: 'Oy va yil noto\'g\'ri',
      })
    }

    // Class tekshirish
    const cls = await Class.findOne({ _id: classId, teacher: teacherId })
    if (!cls) {
      return res.status(404).json({
        success: false,
        error: 'Sinf topilmadi yoki ruxsat yo\'q',
      })
    }

    // Students tekshirish
    const students = await Student.find({ class: classId })
    if (students.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Bu sinfda o'quvchi yo'q",
      })
    }

    let createdCount = 0
    let alreadyExisted = 0

    // Har bir student uchun to'lov yaratish
    for (const student of students) {
      try {
        const existing = await MonthlyPayment.findOne({
          student: student._id,
          class: classId,
          month: Number(month),
          year: Number(year),
        })

        if (!existing) {
          await MonthlyPayment.create({
            student: student._id,
            class: classId,
            teacher: teacherId,
            amount: cls.defaultAmount,
            month: Number(month),
            year: Number(year),
            status: 'not_paid',
          })
          createdCount++
        } else {
          alreadyExisted++
        }
      } catch (e) {
        console.error(`Error creating payment for student ${student._id}:`, e)
      }
    }

    res.json({
      success: true,
      message: `${createdCount} ta to'lov yaratildi`,
      summary: {
        created: createdCount,
        alreadyExisted,
        total: students.length,
        expectedTotal: students.length * cls.defaultAmount,
      },
    })
  } catch (err) {
    console.error('createMonthlyPayments error:', err)
    res.status(500).json({
      success: false,
      error: err.message,
    })
  }
}

/**
 * @desc    Get all payments
 * @route   GET /api/teacher/payments
 * @access  Private
 */
exports.getMonthlyPayments = async (req, res) => {
  try {
    const teacherId = req.user.id
    const { month, year } = req.query

    // Classes olish
    const classes = await Class.find({ teacher: teacherId })
    const classIds = classes.map((c) => c._id)

    // Query tuzish
    const query = { class: { $in: classIds } }
    if (month) query.month = Number(month)
    if (year) query.year = Number(year)

    // Payments olish
    const payments = await MonthlyPayment.find(query)
      .populate('student', 'name parentPhone rollNumber')
      .populate('class', 'name defaultAmount')
      .sort({ class: 1, createdAt: -1 })

    // Class stats
    const classStats = {}
    for (const cls of classes) {
      const studentCount = await Student.countDocuments({ class: cls._id })
      classStats[cls._id.toString()] = {
        className: cls.name,
        defaultAmount: cls.defaultAmount,
        studentCount,
        expectedTotal: studentCount * cls.defaultAmount,
      }
    }

    // Summary
    const paidPayments = payments.filter((p) => p.status === 'paid')
    const collectedTotal = paidPayments.reduce((sum, p) => sum + p.amount, 0)
    const expectedTotal = Object.values(classStats).reduce(
      (sum, c) => sum + c.expectedTotal,
      0
    )

    res.json({
      success: true,
      payments,
      classStats,
      summary: {
        paidCount: paidPayments.length,
        unpaidCount: payments.length - paidPayments.length,
        collectedTotal,
        expectedTotal,
        remaining: expectedTotal - collectedTotal,
      },
    })
  } catch (err) {
    console.error('getMonthlyPayments error:', err)
    res.status(500).json({
      success: false,
      error: err.message,
    })
  }
}

/**
 * @desc    Get payments for specific class
 * @route   GET /api/teacher/classes/:classId/payments
 * @access  Private
 */
exports.getClassPayments = async (req, res) => {
  try {
    const { classId } = req.params
    const { month, year } = req.query
    const teacherId = req.user.id

    // Class tekshirish
    const cls = await Class.findOne({ _id: classId, teacher: teacherId })
    if (!cls) {
      return res.status(404).json({
        success: false,
        error: 'Sinf topilmadi',
      })
    }

    // Students
    const students = await Student.find({ class: classId })

    // Query
    const query = { class: classId }
    if (month) query.month = Number(month)
    if (year) query.year = Number(year)

    // Payments
    const payments = await MonthlyPayment.find(query)
      .populate('student', 'name parentPhone rollNumber')
      .sort({ 'student.rollNumber': 1 })

    // Summary
    const paidPayments = payments.filter((p) => p.status === 'paid')
    const collectedTotal = paidPayments.reduce((sum, p) => sum + p.amount, 0)
    const expectedTotal = students.length * cls.defaultAmount

    res.json({
      success: true,
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
        remaining: expectedTotal - collectedTotal,
      },
    })
  } catch (err) {
    console.error('getClassPayments error:', err)
    res.status(500).json({
      success: false,
      error: err.message,
    })
  }
}

/**
 * @desc    Update payment status
 * @route   PATCH /api/teacher/payments/:paymentId
 * @access  Private
 */
exports.updatePaymentStatus = async (req, res) => {
  try {
    const { paymentId } = req.params
    const { status } = req.body
    const teacherId = req.user.id

    // Status validation
    if (!['paid', 'not_paid'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: "Status 'paid' yoki 'not_paid' bo'lishi kerak",
      })
    }

    // Payment olish
    const payment = await MonthlyPayment.findById(paymentId).populate('class')
    if (!payment) {
      return res.status(404).json({
        success: false,
        error: "To'lov topilmadi",
      })
    }

    // Authorization
    if (payment.class.teacher.toString() !== teacherId) {
      return res.status(403).json({
        success: false,
        error: 'Ruxsat yo\'q',
      })
    }

    // Update
    payment.status = status
    payment.paidDate = status === 'paid' ? new Date() : null
    await payment.save()

    await payment.populate('student', 'name parentPhone rollNumber')

    res.json({
      success: true,
      message: 'Status yangilandi',
      payment,
    })
  } catch (err) {
    console.error('updatePaymentStatus error:', err)
    res.status(500).json({
      success: false,
      error: err.message,
    })
  }
}

// ============================================================
//  MONTHLY REMINDER (Pro/Premium)
// ============================================================

/**
 * @desc    Get monthly reminder data
 * @route   GET /api/teacher/reminders/monthly
 * @access  Private
 */
exports.getMonthlyReminder = async (req, res) => {
  try {
    const teacherId = req.user.id
    const { month, year } = req.query

    // Teacher tekshirish
    const teacher = await Teacher.findById(teacherId)
    if (!teacher) {
      return res.status(404).json({
        success: false,
        error: 'Teacher topilmadi',
      })
    }

    // Feature tekshirish
    if (!hasFeature(teacher, 'monthly_reminder')) {
      return res.status(403).json({
        success: false,
        error: 'Bu funksiya Pro va Premium tarifda',
        requiresUpgrade: true,
      })
    }

    const now = new Date()
    const m = Number(month) || now.getMonth() + 1
    const y = Number(year) || now.getFullYear()

    // Classes
    const classes = await Class.find({ teacher: teacherId })
    const classIds = classes.map((c) => c._id)

    // Unpaid payments
    const unpaidPayments = await MonthlyPayment.find({
      class: { $in: classIds },
      month: m,
      year: y,
      status: 'not_paid',
    })
      .populate('student', 'name parentPhone rollNumber')
      .populate('class', 'name defaultAmount')

    // Grouping
    const grouped = {}
    for (const p of unpaidPayments) {
      const cid = p.class._id.toString()
      if (!grouped[cid]) {
        grouped[cid] = {
          classId: cid,
          className: p.class.name,
          defaultAmount: p.class.defaultAmount,
          unpaidStudents: [],
          totalUnpaid: 0,
        }
      }
      grouped[cid].unpaidStudents.push({
        rollNumber: p.student.rollNumber,
        name: p.student.name,
        parentPhone: p.student.parentPhone,
        amount: p.amount,
      })
      grouped[cid].totalUnpaid += p.amount
    }

    // Extra data agar export feature bo'lsa
    let extraData = {}
    if (hasFeature(teacher, 'export')) {
      const allPaid = await MonthlyPayment.find({
        class: { $in: classIds },
        status: 'paid',
      })
      const allExpenses = await Expense.find({ teacher: teacherId })

      const totalIncome = allPaid.reduce((s, p) => s + p.amount, 0)
      const totalExpenses = allExpenses.reduce((s, e) => s + e.amount, 0)

      extraData.overallBalance = {
        totalIncome,
        totalExpenses,
        balance: totalIncome - totalExpenses,
      }
    }

    res.json({
      success: true,
      month: m,
      year: y,
      totalUnpaidStudents: unpaidPayments.length,
      classes: Object.values(grouped),
      ...extraData,
    })
  } catch (err) {
    console.error('getMonthlyReminder error:', err)
    res.status(500).json({
      success: false,
      error: err.message,
    })
  }
}

// ============================================================
//  SMS REMINDER (Premium)
// ============================================================

/**
 * @desc    Send SMS reminders to parents
 * @route   POST /api/teacher/sms-reminder/send
 * @access  Private
 */
exports.sendSmsReminders = async (req, res) => {
  try {
    const { classId, month, year } = req.body
    const teacherId = req.user.id

    // Teacher tekshirish
    const teacher = await Teacher.findById(teacherId)
    if (!teacher) {
      return res.status(404).json({
        success: false,
        error: 'Teacher topilmadi',
      })
    }

    // Feature tekshirish
    if (!hasFeature(teacher, 'sms_reminder')) {
      return res.status(403).json({
        success: false,
        error: 'SMS reminder funksiyasi faqat Premium uchun',
        requiresUpgrade: true,
      })
    }

    // Class tekshirish
    const cls = await Class.findOne({ _id: classId, teacher: teacherId })
    if (!cls) {
      return res.status(404).json({
        success: false,
        error: 'Sinf topilmadi',
      })
    }

    // Unpaid payments
    const payments = await MonthlyPayment.find({
      class: classId,
      month: Number(month),
      year: Number(year),
      status: 'not_paid',
    }).populate('student', 'name parentPhone rollNumber')

    if (payments.length === 0) {
      return res.json({
        success: true,
        message: 'SMS yuborilmaydigan o\'quvchi yo\'q',
        summary: {
          total: 0,
          sent: 0,
          failed: 0,
        },
      })
    }

    // Prepare data
    const studentsToNotify = payments.map((p) => ({
      _id: p.student._id,
      name: p.student.name,
      parentPhone: p.student.parentPhone,
      amount: p.amount,
    }))

    // Send SMS
    const results = await smsService.sendBulkReminders(
      studentsToNotify,
      cls.name,
      month,
      year
    )

    const successCount = results.filter((r) => r.status === 'sent').length
    const failedCount = results.filter((r) => r.status === 'failed').length

    res.json({
      success: true,
      message: 'SMS reminder yuborildi',
      summary: {
        total: results.length,
        sent: successCount,
        failed: failedCount,
      },
      details: results,
    })
  } catch (err) {
    console.error('sendSmsReminders error:', err)
    res.status(500).json({
      success: false,
      error: err.message,
    })
  }
}

// ============================================================
//  EXPORT (Premium)
// ============================================================

/**
 * @desc    Export payments data
 * @route   GET /api/teacher/classes/:classId/export
 * @access  Private
 */
exports.exportPayments = async (req, res) => {
  try {
    const { classId } = req.params
    const { month, year, format = 'json' } = req.query
    const teacherId = req.user.id

    // Teacher tekshirish
    const teacher = await Teacher.findById(teacherId)
    if (!hasFeature(teacher, 'export')) {
      return res.status(403).json({
        success: false,
        error: 'Export funksiyasi faqat Premium uchun',
        requiresUpgrade: true,
      })
    }

    // Class tekshirish
    const cls = await Class.findOne({ _id: classId, teacher: teacherId })
    if (!cls) {
      return res.status(404).json({
        success: false,
        error: 'Sinf topilmadi',
      })
    }

    // Students
    const students = await Student.find({ class: classId }).sort({ rollNumber: 1 })

    // Payments
    const query = { class: classId }
    if (month) query.month = Number(month)
    if (year) query.year = Number(year)

    const payments = await MonthlyPayment.find(query).populate(
      'student',
      'name parentPhone rollNumber'
    )

    // Export data
    const exportData = students.map((student) => {
      const payment = payments.find(
        (p) => p.student._id.toString() === student._id.toString()
      )

      return {
        '№': student.rollNumber,
        "O'quvchi ismi": student.name,
        'Ota-ona telefoni': student.parentPhone || '—',
        'Summa (so\'m)': payment ? payment.amount : cls.defaultAmount,
        Holati: payment?.status === 'paid' ? "To'lagan" : "To'lamagan",
        "To'lagan sanasi": payment?.paidDate
          ? new Date(payment.paidDate).toLocaleDateString('uz-UZ')
          : '—',
      }
    })

    const paidCount = exportData.filter((r) => r.Holati === "To'lagan").length
    const collected = payments
      .filter((p) => p.status === 'paid')
      .reduce((s, p) => s + p.amount, 0)
    const expectedTotal = students.length * cls.defaultAmount

    const meta = {
      paidCount,
      expectedTotal,
      collectedTotal: collected,
      remaining: expectedTotal - collected,
      month: Number(month),
      year: Number(year),
    }

    // Format
    if (format === 'excel') {
      return exportToExcel(res, cls, exportData, meta)
    } else if (format === 'word') {
      return exportToWord(res, cls, exportData, meta)
    } else {
      return res.json({
        success: true,
        data: exportData,
        meta: {
          className: cls.name,
          ...meta,
          studentCount: students.length,
          unpaidCount: students.length - paidCount,
        },
      })
    }
  } catch (err) {
    console.error('exportPayments error:', err)
    res.status(500).json({
      success: false,
      error: err.message,
    })
  }
}

/**
 * Export to Excel
 */
const exportToExcel = (res, cls, data, meta) => {
  try {
    const workbook = XLSX.utils.book_new()

    // Data sheet
    const dataSheet = XLSX.utils.json_to_sheet(data)
    dataSheet['!cols'] = [
      { wch: 5 },   // №
      { wch: 20 },  // O'quvchi ismi
      { wch: 18 },  // Ota-ona telefoni
      { wch: 14 },  // Summa
      { wch: 12 },  // Holati
      { wch: 16 },  // To'lagan sanasi
    ]
    XLSX.utils.book_append_sheet(workbook, dataSheet, "To'lovlar")

    // Summary sheet
    const summaryData = [
      ['Sinf nomi:', cls.name],
      ['Oy:', meta.month],
      ['Yil:', meta.year],
      [''],
      ['Jami o\'quvchilar:', data.length],
      ['To\'lagan:', meta.paidCount],
      ["To'lamagan:", data.length - meta.paidCount],
      [''],
      ['Jami kutilayotgan (so\'m):', meta.expectedTotal],
      ["Yig'ilgan (so'm):", meta.collectedTotal],
      ['Qolgan (so\'m):', meta.remaining],
    ]

    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData)
    summarySheet['!cols'] = [{ wch: 25 }, { wch: 18 }]
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Hisobot')

    const fileName = `${cls.name}_${meta.month}_${meta.year}.xlsx`
    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' })

    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(fileName)}"`
    )
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )
    res.send(buffer)
  } catch (err) {
    console.error('exportToExcel error:', err)
    res.status(500).json({
      success: false,
      error: 'Excel export xatosi',
    })
  }
}

/**
 * Export to Word
 */
const exportToWord = (res, cls, data, meta) => {
  try {
    const tableRows = [
      new TableRow({
        children: [
          new TableCell({ children: [new Paragraph({ text: '№', bold: true })] }),
          new TableCell({
            children: [new Paragraph({ text: "O'quvchi ismi", bold: true })],
          }),
          new TableCell({
            children: [new Paragraph({ text: 'Ota-ona telefoni', bold: true })],
          }),
          new TableCell({
            children: [new Paragraph({ text: 'Summa (so\'m)', bold: true })],
          }),
          new TableCell({ children: [new Paragraph({ text: 'Holati', bold: true })] }),
          new TableCell({
            children: [new Paragraph({ text: "To'lagan sanasi", bold: true })],
          }),
        ],
      }),
    ]

    data.forEach((row) => {
      tableRows.push(
        new TableRow({
          children: [
            new TableCell({
              children: [new Paragraph(row['№']?.toString() || '')],
            }),
            new TableCell({
              children: [new Paragraph(row["O'quvchi ismi"] || '')],
            }),
            new TableCell({
              children: [new Paragraph(row['Ota-ona telefoni'] || '')],
            }),
            new TableCell({
              children: [new Paragraph(row['Summa (so\'m)']?.toString() || '')],
            }),
            new TableCell({ children: [new Paragraph(row.Holati || '')] }),
            new TableCell({
              children: [new Paragraph(row["To'lagan sanasi"] || '')],
            }),
          ],
        })
      )
    })

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
    })

    Packer.toBuffer(doc)
      .then((buffer) => {
        const fileName = `${cls.name}_${meta.month}_${meta.year}.docx`
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${encodeURIComponent(fileName)}"`
        )
        res.setHeader(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        )
        res.send(buffer)
      })
      .catch((err) => {
        console.error('Word Packer error:', err)
        res.status(500).json({
          success: false,
          error: 'Word export xatosi',
        })
      })
  } catch (err) {
    console.error('exportToWord error:', err)
    res.status(500).json({
      success: false,
      error: 'Word export xatosi',
    })
  }
}

// ============================================================
//  EXPENSES
// ============================================================

/**
 * @desc    Add expense
 * @route   POST /api/teacher/expenses
 * @access  Private
 */
exports.addExpense = async (req, res) => {
  try {
    const { classId, reason, amount, month, year, description } = req.body
    const teacherId = req.user.id

    // Validation
    if (!classId || !reason || !amount || !month || !year) {
      return res.status(400).json({
        success: false,
        error: 'Barcha majburiy maydonlarni to\'ldiring',
      })
    }

    if (amount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Summa 0 dan katta bo\'lishi kerak',
      })
    }

    // Class tekshirish
    const cls = await Class.findOne({ _id: classId, teacher: teacherId })
    if (!cls) {
      return res.status(404).json({
        success: false,
        error: 'Sinf topilmadi',
      })
    }

    // Xarajat yaratish
    const expense = new Expense({
      class: classId,
      teacher: teacherId,
      reason: reason.trim(),
      amount: Number(amount),
      month: Number(month),
      year: Number(year),
      description: (description || '').trim(),
    })

    await expense.save()

    res.status(201).json({
      success: true,
      message: 'Xarajat qo\'shildi',
      expense,
    })
  } catch (err) {
    console.error('addExpense error:', err)
    res.status(500).json({
      success: false,
      error: err.message,
    })
  }
}

/**
 * @desc    Get expenses
 * @route   GET /api/teacher/expenses
 * @access  Private
 */
exports.getExpenses = async (req, res) => {
  try {
    const teacherId = req.user.id
    const { month, year } = req.query

    const query = { teacher: teacherId }
    if (month) query.month = Number(month)
    if (year) query.year = Number(year)

    const expenses = await Expense.find(query)
      .populate('class', 'name')
      .sort({ createdAt: -1 })

    const total = expenses.reduce((sum, e) => sum + e.amount, 0)

    res.json({
      success: true,
      expenses,
      total,
    })
  } catch (err) {
    console.error('getExpenses error:', err)
    res.status(500).json({
      success: false,
      error: err.message,
    })
  }
}

/**
 * @desc    Delete expense
 * @route   DELETE /api/teacher/expenses/:expenseId
 * @access  Private
 */
exports.deleteExpense = async (req, res) => {
  try {
    const { expenseId } = req.params
    const teacherId = req.user.id

    const expense = await Expense.findOne({ _id: expenseId, teacher: teacherId })
    if (!expense) {
      return res.status(404).json({
        success: false,
        error: 'Xarajat topilmadi yoki ruxsat yo\'q',
      })
    }

    await Expense.findByIdAndDelete(expenseId)

    res.json({
      success: true,
      message: 'Xarajat o\'chirildi',
    })
  } catch (err) {
    console.error('deleteExpense error:', err)
    res.status(500).json({
      success: false,
      error: err.message,
    })
  }
}

// ============================================================
//  DASHBOARD
// ============================================================

/**
 * @desc    Get teacher dashboard
 * @route   GET /api/teacher/dashboard
 * @access  Private
 */
exports.getDashboard = async (req, res) => {
  try {
    const teacherId = req.user.id
    const now = new Date()
    const currentMonth = now.getMonth() + 1
    const currentYear = now.getFullYear()

    // Teacher
    const teacher = await Teacher.findById(teacherId)
    if (!teacher) {
      return res.status(404).json({
        success: false,
        error: 'Teacher topilmadi',
      })
    }

    // Classes
    const classes = await Class.find({ teacher: teacherId })
    const classIds = classes.map((c) => c._id)

    // Students
    const allStudents = await Student.find({ class: { $in: classIds } })
    const totalStudents = allStudents.length

    // Payments
    const monthlyPayments = await MonthlyPayment.find({
      class: { $in: classIds },
      month: currentMonth,
      year: currentYear,
    })

    const paidPayments = monthlyPayments.filter((p) => p.status === 'paid')
    const collectedThisMonth = paidPayments.reduce((sum, p) => sum + p.amount, 0)

    // Expected total
    let expectedThisMonth = 0
    for (const cls of classes) {
      const classStudents = allStudents.filter(
        (s) => s.class.toString() === cls._id.toString()
      )
      expectedThisMonth += classStudents.length * cls.defaultAmount
    }

    // Expenses
    const monthlyExpenses = await Expense.find({
      teacher: teacherId,
      month: currentMonth,
      year: currentYear,
    })
    const expensesTotal = monthlyExpenses.reduce((sum, e) => sum + e.amount, 0)

    // Class details
    const classDetails = await Promise.all(
      classes.map(async (cls) => {
        const classStudents = allStudents.filter(
          (s) => s.class.toString() === cls._id.toString()
        )
        const classPayments = monthlyPayments.filter(
          (p) => p.class.toString() === cls._id.toString()
        )
        const classPaid = classPayments.filter((p) => p.status === 'paid')
        const classExpensesTotal = monthlyExpenses
          .filter((e) => e.class?.toString() === cls._id.toString())
          .reduce((sum, e) => sum + e.amount, 0)

        return {
          id: cls._id,
          name: cls.name,
          defaultAmount: cls.defaultAmount,
          studentCount: classStudents.length,
          paidCount: classPaid.length,
          unpaidCount: classStudents.length - classPaid.length,
          collectedThisMonth: classPaid.reduce((sum, p) => sum + p.amount, 0),
          expectedThisMonth: classStudents.length * cls.defaultAmount,
          expensesThisMonth: classExpensesTotal,
        }
      })
    )

    // Response
    res.json({
      success: true,
      teacher: {
        id: teacher._id,
        name: teacher.name,
        email: teacher.email,
        plan: teacher.plan,
        planActive: teacher.isPlanActive(),
        daysLeft: teacher.daysLeft(),
        planExpiresAt: teacher.planExpiresAt,
        features: {
          monthly_reminder: hasFeature(teacher, 'monthly_reminder'),
          export: hasFeature(teacher, 'export'),
          multi_lang: hasFeature(teacher, 'multi_lang'),
          sms_reminder: hasFeature(teacher, 'sms_reminder'),
        },
      },
      registeredDate: teacher.registeredDate || teacher.createdAt,
      currentMonth,
      currentYear,
      summary: {
        totalClasses: classes.length,
        totalStudents,
        paidCount: paidPayments.length,
        unpaidCount: monthlyPayments.length - paidPayments.length,
        collectedThisMonth,
        expectedThisMonth,
        remainingThisMonth: expectedThisMonth - collectedThisMonth,
        expensesTotal,
        balance: collectedThisMonth - expensesTotal,
      },
      classDetails,
    })
  } catch (err) {
    console.error('getDashboard error:', err)
    res.status(500).json({
      success: false,
      error: err.message,
    })
  }
}

// ============================================================
//  SUBSCRIPTION
// ============================================================

/**
 * @desc    Get subscription info
 * @route   GET /api/teacher/subscription
 * @access  Private
 */
exports.getSubscriptionInfo = async (req, res) => {
  try {
    const teacher = await Teacher.findById(req.user.id)
    if (!teacher) {
      return res.status(404).json({
        success: false,
        error: 'Teacher topilmadi',
      })
    }

    res.json({
      success: true,
      currentPlan: teacher.plan,
      planActive: teacher.isPlanActive(),
      daysLeft: teacher.daysLeft(),
      planExpiresAt: teacher.planExpiresAt,
      highestPlanEver: teacher.highestPlanEver,
      features: {
        monthly_reminder: hasFeature(teacher, 'monthly_reminder'),
        export: hasFeature(teacher, 'export'),
        multi_lang: hasFeature(teacher, 'multi_lang'),
        sms_reminder: hasFeature(teacher, 'sms_reminder'),
      },
    })
  } catch (err) {
    console.error('getSubscriptionInfo error:', err)
    res.status(500).json({
      success: false,
      error: err.message,
    })
  }
}

module.exports = exports