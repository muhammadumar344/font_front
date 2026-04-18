// backend/src/controllers/teacherController.js
const Class = require('../models/Class')
const Student = require('../models/Student')
const MonthlyPayment = require('../models/MonthlyPayment')
const Expense = require('../models/Expense')
const Teacher = require('../models/Teacher')
const XLSX = require('xlsx')
const { Document, Packer, Table, TableRow, TableCell, Paragraph, TextRun, WidthType, AlignmentType } = require('docx')
const { PLAN_LIMITS, hasFeature, canOpenNewClass, canAddStudent } = require('../utils/planHelper')
const smsService = require('../services/smsService')

// ============================================================
//  CLASSES
// ============================================================

exports.createClass = async (req, res) => {
  try {
    const { name, defaultAmount, initialBalance, initialBalanceNote } = req.body
    const teacherId = req.user.id

    if (!name || !defaultAmount) {
      return res.status(400).json({ success: false, error: 'Sinf nomi va oylik to\'lov summasi majburiy' })
    }
    if (defaultAmount <= 0) {
      return res.status(400).json({ success: false, error: "Summa 0 dan katta bo'lishi kerak" })
    }
    // ✅ initialBalance manfiy bo'lmasligi
    if (initialBalance !== undefined && Number(initialBalance) < 0) {
      return res.status(400).json({ success: false, error: "Boshlang'ich balans manfiy bo'lishi mumkin emas" })
    }

    const teacher = await Teacher.findById(teacherId)
    if (!teacher) {
      return res.status(404).json({ success: false, error: 'Teacher topilmadi' })
    }

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

    const activePlan = teacher.isPlanActive() ? teacher.plan : 'free'
    const newClass = new Class({
      name: name.trim(),
      teacher: teacherId,
      defaultAmount: Number(defaultAmount),
      plan: activePlan,
      // ✅ Boshlang'ich balans (ixtiyoriy, default 0)
      initialBalance: Number(initialBalance) || 0,
      initialBalanceNote: (initialBalanceNote || '').trim(),
    })
    await newClass.save()

    res.status(201).json({
      success: true,
      message: 'Sinf muvaffaqiyatli yaratildi',
      class: newClass,
    })
  } catch (err) {
    console.error('createClass error:', err)
    res.status(500).json({ success: false, error: err.message })
  }
}

exports.getMyClasses = async (req, res) => {
  try {
    const teacherId = req.user.id
    const classes = await Class.find({ teacher: teacherId }).sort({ createdAt: -1 })

    const classesWithStats = await Promise.all(
      classes.map(async (cls) => {
        const studentCount = await Student.countDocuments({ class: cls._id })
        const payments = await MonthlyPayment.find({ class: cls._id })
        const paidPayments = payments.filter((p) => p.status === 'paid')
        const paidCount = paidPayments.length

        // ✅ Jami yig'ilgan = boshlang'ich balans + saytda to'langan
        const collectedOnSite = paidPayments.reduce((s, p) => s + p.amount, 0)
        const totalCollected = cls.initialBalance + collectedOnSite

        // ✅ Jami xarajat
        const expenses = await Expense.find({ class: cls._id })
        const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0)

        return {
          ...cls.toObject(),
          studentCount,
          paidCount,
          unpaidCount: payments.length - paidCount,
          collectedOnSite,           // Saytda yig'ilgan
          totalCollected,            // Jami (boshlang'ich + saytda)
          totalExpenses,
          // ✅ Haqiqiy fond qoldig'i
          realBalance: totalCollected - totalExpenses,
        }
      })
    )

    res.json({ success: true, classes: classesWithStats })
  } catch (err) {
    console.error('getMyClasses error:', err)
    res.status(500).json({ success: false, error: err.message })
  }
}

// ✅ YANGI: Sinfning boshlang'ich balansini yangilash
exports.updateInitialBalance = async (req, res) => {
  try {
    const { classId } = req.params
    const { initialBalance, initialBalanceNote } = req.body
    const teacherId = req.user.id

    if (initialBalance === undefined || Number(initialBalance) < 0) {
      return res.status(400).json({ success: false, error: "Balans 0 yoki undan katta bo'lishi kerak" })
    }

    const cls = await Class.findOne({ _id: classId, teacher: teacherId })
    if (!cls) {
      return res.status(404).json({ success: false, error: "Sinf topilmadi yoki ruxsat yo'q" })
    }

    cls.initialBalance = Number(initialBalance)
    cls.initialBalanceNote = (initialBalanceNote || '').trim()
    await cls.save()

    res.json({
      success: true,
      message: "Boshlang'ich balans yangilandi",
      class: cls,
    })
  } catch (err) {
    console.error('updateInitialBalance error:', err)
    res.status(500).json({ success: false, error: err.message })
  }
}

exports.updateClassDefaultAmount = async (req, res) => {
  try {
    const { classId } = req.params
    const { defaultAmount } = req.body
    const teacherId = req.user.id

    if (!defaultAmount || defaultAmount <= 0) {
      return res.status(400).json({ success: false, error: "Summa 0 dan katta bo'lishi kerak" })
    }

    const cls = await Class.findOne({ _id: classId, teacher: teacherId })
    if (!cls) {
      return res.status(404).json({ success: false, error: "Sinf topilmadi yoki ruxsat yo'q" })
    }

    cls.defaultAmount = Number(defaultAmount)
    await cls.save()

    res.json({ success: true, message: 'Default summa yangilandi', class: cls })
  } catch (err) {
    console.error('updateClassDefaultAmount error:', err)
    res.status(500).json({ success: false, error: err.message })
  }
}

exports.deleteClass = async (req, res) => {
  try {
    const { classId } = req.params
    const teacherId = req.user.id

    const cls = await Class.findOne({ _id: classId, teacher: teacherId })
    if (!cls) {
      return res.status(404).json({ success: false, error: "Sinf topilmadi yoki ruxsat yo'q" })
    }

    await Student.deleteMany({ class: classId })
    await MonthlyPayment.deleteMany({ class: classId })
    await Expense.deleteMany({ class: classId })
    await Class.findByIdAndDelete(classId)

    res.json({ success: true, message: "Sinf va barcha bog'liq ma'lumotlar o'chirildi" })
  } catch (err) {
    console.error('deleteClass error:', err)
    res.status(500).json({ success: false, error: err.message })
  }
}

// ============================================================
//  STUDENTS
// ============================================================

exports.addStudent = async (req, res) => {
  try {
    const { classId } = req.params
    const { name, parentPhone } = req.body
    const teacherId = req.user.id

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: "O'quvchi ismi majburiy" })
    }

    const cls = await Class.findOne({ _id: classId, teacher: teacherId })
    if (!cls) {
      return res.status(404).json({ success: false, error: "Sinf topilmadi yoki ruxsat yo'q" })
    }

    const studentCount = await Student.countDocuments({ class: classId })
    if (!canAddStudent(cls.plan, studentCount)) {
      const limit = PLAN_LIMITS[cls.plan] || PLAN_LIMITS.free
      return res.status(403).json({
        success: false,
        error: `Bu sinfga maksimal ${limit.students} ta o'quvchi qo'shish mumkin`,
        requiresUpgrade: true,
      })
    }

    const student = new Student({
      name: name.trim(),
      class: classId,
      parentPhone: (parentPhone || '').trim(),
      rollNumber: studentCount + 1,
    })
    await student.save()

    res.status(201).json({ success: true, message: "O'quvchi qo'shildi", student })
  } catch (err) {
    console.error('addStudent error:', err)
    res.status(500).json({ success: false, error: err.message })
  }
}

exports.getClassStudents = async (req, res) => {
  try {
    const { classId } = req.params
    const teacherId = req.user.id

    const cls = await Class.findOne({ _id: classId, teacher: teacherId })
    if (!cls) {
      return res.status(404).json({ success: false, error: "Sinf topilmadi yoki ruxsat yo'q" })
    }

    const students = await Student.find({ class: classId }).sort({ rollNumber: 1 })
    res.json({ success: true, students })
  } catch (err) {
    console.error('getClassStudents error:', err)
    res.status(500).json({ success: false, error: err.message })
  }
}

exports.deleteStudent = async (req, res) => {
  try {
    const { studentId } = req.params
    const teacherId = req.user.id

    const student = await Student.findById(studentId)
    if (!student) {
      return res.status(404).json({ success: false, error: "O'quvchi topilmadi" })
    }

    const cls = await Class.findOne({ _id: student.class, teacher: teacherId })
    if (!cls) {
      return res.status(403).json({ success: false, error: "Ruxsat yo'q" })
    }

    await MonthlyPayment.deleteMany({ student: studentId })
    await Student.findByIdAndDelete(studentId)

    res.json({ success: true, message: "O'quvchi o'chirildi" })
  } catch (err) {
    console.error('deleteStudent error:', err)
    res.status(500).json({ success: false, error: err.message })
  }
}

// ============================================================
//  PAYMENTS
// ============================================================

exports.createMonthlyPayments = async (req, res) => {
  try {
    const { classId, month, year } = req.body
    const teacherId = req.user.id

    if (!classId || !month || !year) {
      return res.status(400).json({ success: false, error: 'classId, month, year majburiy' })
    }
    if (month < 1 || month > 12 || year < 2020) {
      return res.status(400).json({ success: false, error: "Oy va yil noto'g'ri" })
    }

    const cls = await Class.findOne({ _id: classId, teacher: teacherId })
    if (!cls) {
      return res.status(404).json({ success: false, error: "Sinf topilmadi yoki ruxsat yo'q" })
    }

    const students = await Student.find({ class: classId })
    if (students.length === 0) {
      return res.status(400).json({ success: false, error: "Bu sinfda o'quvchi yo'q" })
    }

    let createdCount = 0
    let alreadyExisted = 0

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
      summary: { created: createdCount, alreadyExisted, total: students.length },
    })
  } catch (err) {
    console.error('createMonthlyPayments error:', err)
    res.status(500).json({ success: false, error: err.message })
  }
}

exports.getMonthlyPayments = async (req, res) => {
  try {
    const teacherId = req.user.id
    const { month, year } = req.query

    const classes = await Class.find({ teacher: teacherId })
    const classIds = classes.map((c) => c._id)

    const query = { class: { $in: classIds } }
    if (month) query.month = Number(month)
    if (year) query.year = Number(year)

    const payments = await MonthlyPayment.find(query)
      .populate('student', 'name parentPhone rollNumber')
      .populate('class', 'name defaultAmount')
      .sort({ class: 1, createdAt: -1 })

    const classStats = {}
    for (const cls of classes) {
      const studentCount = await Student.countDocuments({ class: cls._id })
      classStats[cls._id.toString()] = {
        className: cls.name,
        defaultAmount: cls.defaultAmount,
        studentCount,
        expectedTotal: studentCount * cls.defaultAmount,
        // ✅ Boshlang'ich balans ham ko'rsatiladi
        initialBalance: cls.initialBalance || 0,
        initialBalanceNote: cls.initialBalanceNote || '',
      }
    }

    const paidPayments = payments.filter((p) => p.status === 'paid')
    const collectedTotal = paidPayments.reduce((sum, p) => sum + p.amount, 0)
    const expectedTotal = Object.values(classStats).reduce((sum, c) => sum + c.expectedTotal, 0)
    // ✅ Umumiy boshlang'ich balans
    const totalInitialBalance = classes.reduce((sum, c) => sum + (c.initialBalance || 0), 0)

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
        totalInitialBalance,
        // ✅ Haqiqiy jami: boshlang'ich + saytda yig'ilgan
        grandTotal: totalInitialBalance + collectedTotal,
      },
    })
  } catch (err) {
    console.error('getMonthlyPayments error:', err)
    res.status(500).json({ success: false, error: err.message })
  }
}

exports.getClassPayments = async (req, res) => {
  try {
    const { classId } = req.params
    const { month, year } = req.query
    const teacherId = req.user.id

    const cls = await Class.findOne({ _id: classId, teacher: teacherId })
    if (!cls) {
      return res.status(404).json({ success: false, error: 'Sinf topilmadi' })
    }

    const students = await Student.find({ class: classId })
    const query = { class: classId }
    if (month) query.month = Number(month)
    if (year) query.year = Number(year)

    const payments = await MonthlyPayment.find(query)
      .populate('student', 'name parentPhone rollNumber')
      .sort({ 'student.rollNumber': 1 })

    const paidPayments = payments.filter((p) => p.status === 'paid')
    const collectedOnSite = paidPayments.reduce((sum, p) => sum + p.amount, 0)
    const expectedTotal = students.length * cls.defaultAmount

    // ✅ Ushbu sinfning to'liq balansi
    const allExpenses = await Expense.find({ class: classId })
    const totalExpenses = allExpenses.reduce((sum, e) => sum + e.amount, 0)
    const totalCollected = (cls.initialBalance || 0) + collectedOnSite
    const realBalance = totalCollected - totalExpenses

    res.json({
      success: true,
      class: {
        id: cls._id,
        name: cls.name,
        defaultAmount: cls.defaultAmount,
        studentCount: students.length,
        // ✅ Boshlang'ich balans ma'lumotlari
        initialBalance: cls.initialBalance || 0,
        initialBalanceNote: cls.initialBalanceNote || '',
      },
      payments,
      summary: {
        studentCount: students.length,
        paidCount: paidPayments.length,
        unpaidCount: students.length - paidPayments.length,
        expectedTotal,
        collectedOnSite,             // Faqat saytda
        totalCollected,              // Boshlang'ich + saytda
        remaining: expectedTotal - collectedOnSite,
        totalExpenses,
        realBalance,                 // Haqiqiy qoldiq
      },
    })
  } catch (err) {
    console.error('getClassPayments error:', err)
    res.status(500).json({ success: false, error: err.message })
  }
}

exports.updatePaymentStatus = async (req, res) => {
  try {
    const { paymentId } = req.params
    const { status } = req.body
    const teacherId = req.user.id

    if (!['paid', 'not_paid'].includes(status)) {
      return res.status(400).json({ success: false, error: "Status 'paid' yoki 'not_paid' bo'lishi kerak" })
    }

    const payment = await MonthlyPayment.findById(paymentId).populate('class')
    if (!payment) {
      return res.status(404).json({ success: false, error: "To'lov topilmadi" })
    }

    if (payment.class.teacher.toString() !== teacherId) {
      return res.status(403).json({ success: false, error: "Ruxsat yo'q" })
    }

    payment.status = status
    payment.paidDate = status === 'paid' ? new Date() : null
    await payment.save()
    await payment.populate('student', 'name parentPhone rollNumber')

    res.json({ success: true, message: 'Status yangilandi', payment })
  } catch (err) {
    console.error('updatePaymentStatus error:', err)
    res.status(500).json({ success: false, error: err.message })
  }
}

// ============================================================
//  EXPENSES
// ============================================================

exports.addExpense = async (req, res) => {
  try {
    const { classId, reason, amount, month, year, description } = req.body
    const teacherId = req.user.id

    if (!classId || !reason || !amount || !month || !year) {
      return res.status(400).json({ success: false, error: "Barcha majburiy maydonlarni to'ldiring" })
    }
    if (amount <= 0) {
      return res.status(400).json({ success: false, error: "Summa 0 dan katta bo'lishi kerak" })
    }

    const cls = await Class.findOne({ _id: classId, teacher: teacherId })
    if (!cls) {
      return res.status(404).json({ success: false, error: 'Sinf topilmadi' })
    }

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

    res.status(201).json({ success: true, message: "Xarajat qo'shildi", expense })
  } catch (err) {
    console.error('addExpense error:', err)
    res.status(500).json({ success: false, error: err.message })
  }
}

exports.getExpenses = async (req, res) => {
  try {
    const teacherId = req.user.id
    const { month, year } = req.query

    const query = { teacher: teacherId }
    if (month) query.month = Number(month)
    if (year) query.year = Number(year)

    const expenses = await Expense.find(query).populate('class', 'name').sort({ createdAt: -1 })
    const total = expenses.reduce((sum, e) => sum + e.amount, 0)

    res.json({ success: true, expenses, total })
  } catch (err) {
    console.error('getExpenses error:', err)
    res.status(500).json({ success: false, error: err.message })
  }
}

exports.deleteExpense = async (req, res) => {
  try {
    const { expenseId } = req.params
    const teacherId = req.user.id

    const expense = await Expense.findOne({ _id: expenseId, teacher: teacherId })
    if (!expense) {
      return res.status(404).json({ success: false, error: "Xarajat topilmadi yoki ruxsat yo'q" })
    }

    await Expense.findByIdAndDelete(expenseId)
    res.json({ success: true, message: "Xarajat o'chirildi" })
  } catch (err) {
    console.error('deleteExpense error:', err)
    res.status(500).json({ success: false, error: err.message })
  }
}

// ============================================================
//  DASHBOARD — ✅ initialBalance hisobga olingan
// ============================================================

exports.getDashboard = async (req, res) => {
  try {
    const teacherId = req.user.id
    const now = new Date()
    const currentMonth = now.getMonth() + 1
    const currentYear = now.getFullYear()

    const teacher = await Teacher.findById(teacherId)
    if (!teacher) {
      return res.status(404).json({ success: false, error: 'Teacher topilmadi' })
    }

    const classes = await Class.find({ teacher: teacherId })
    const classIds = classes.map((c) => c._id)

    const allStudents = await Student.find({ class: { $in: classIds } })
    const monthlyPayments = await MonthlyPayment.find({
      class: { $in: classIds },
      month: currentMonth,
      year: currentYear,
    })

    const paidPayments = monthlyPayments.filter((p) => p.status === 'paid')
    const collectedThisMonth = paidPayments.reduce((sum, p) => sum + p.amount, 0)

    let expectedThisMonth = 0
    for (const cls of classes) {
      const classStudents = allStudents.filter((s) => s.class.toString() === cls._id.toString())
      expectedThisMonth += classStudents.length * cls.defaultAmount
    }

    const monthlyExpenses = await Expense.find({ teacher: teacherId, month: currentMonth, year: currentYear })
    const expensesTotal = monthlyExpenses.reduce((sum, e) => sum + e.amount, 0)

    // ✅ Barcha sinflarning boshlang'ich balansi
    const totalInitialBalance = classes.reduce((sum, c) => sum + (c.initialBalance || 0), 0)

    // ✅ Haqiqiy umumiy balans: boshlang'ich + jami to'lovlar - jami xarajatlar
    const allPaidEver = await MonthlyPayment.find({ class: { $in: classIds }, status: 'paid' })
    const allCollectedEver = allPaidEver.reduce((sum, p) => sum + p.amount, 0)
    const allExpensesEver = await Expense.find({ teacher: teacherId })
    const allExpensesTotalEver = allExpensesEver.reduce((sum, e) => sum + e.amount, 0)
    const realTotalBalance = totalInitialBalance + allCollectedEver - allExpensesTotalEver

    const classDetails = await Promise.all(
      classes.map(async (cls) => {
        const classStudents = allStudents.filter((s) => s.class.toString() === cls._id.toString())
        const classPayments = monthlyPayments.filter((p) => p.class.toString() === cls._id.toString())
        const classPaid = classPayments.filter((p) => p.status === 'paid')
        const classCollectedThisMonth = classPaid.reduce((sum, p) => sum + p.amount, 0)
        const classExpensesThisMonth = monthlyExpenses
          .filter((e) => e.class?.toString() === cls._id.toString())
          .reduce((sum, e) => sum + e.amount, 0)

        // ✅ Sinfning umumiy balansi (boshlang'ichi bilan)
        const classAllPaid = await MonthlyPayment.find({ class: cls._id, status: 'paid' })
        const classAllCollected = classAllPaid.reduce((s, p) => s + p.amount, 0)
        const classAllExpenses = await Expense.find({ class: cls._id })
        const classAllExpensesTotal = classAllExpenses.reduce((s, e) => s + e.amount, 0)
        const classRealBalance = (cls.initialBalance || 0) + classAllCollected - classAllExpensesTotal

        return {
          id: cls._id,
          name: cls.name,
          defaultAmount: cls.defaultAmount,
          studentCount: classStudents.length,
          paidCount: classPaid.length,
          unpaidCount: classStudents.length - classPaid.length,
          collectedThisMonth: classCollectedThisMonth,
          expectedThisMonth: classStudents.length * cls.defaultAmount,
          expensesThisMonth: classExpensesThisMonth,
          // ✅ Yangi maydonlar
          initialBalance: cls.initialBalance || 0,
          initialBalanceNote: cls.initialBalanceNote || '',
          realBalance: classRealBalance,   // Ushbu sinfning haqiqiy qoldig'i
        }
      })
    )

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
        totalStudents: allStudents.length,
        paidCount: paidPayments.length,
        unpaidCount: monthlyPayments.length - paidPayments.length,
        collectedThisMonth,
        expectedThisMonth,
        remainingThisMonth: expectedThisMonth - collectedThisMonth,
        expensesTotal,
        balance: collectedThisMonth - expensesTotal,
        // ✅ Haqiqiy umumiy fond qoldig'i (barcha vaqt uchun)
        totalInitialBalance,
        realTotalBalance,
      },
      classDetails,
    })
  } catch (err) {
    console.error('getDashboard error:', err)
    res.status(500).json({ success: false, error: err.message })
  }
}

// ============================================================
//  MONTHLY REMINDER
// ============================================================

exports.getMonthlyReminder = async (req, res) => {
  try {
    const teacherId = req.user.id
    const { month, year } = req.query

    const teacher = await Teacher.findById(teacherId)
    if (!teacher) return res.status(404).json({ success: false, error: 'Teacher topilmadi' })
    if (!hasFeature(teacher, 'monthly_reminder')) {
      return res.status(403).json({ success: false, error: 'Bu funksiya Pro va Premium tarifda', requiresUpgrade: true })
    }

    const now = new Date()
    const m = Number(month) || now.getMonth() + 1
    const y = Number(year) || now.getFullYear()

    const classes = await Class.find({ teacher: teacherId })
    const classIds = classes.map((c) => c._id)

    const unpaidPayments = await MonthlyPayment.find({ class: { $in: classIds }, month: m, year: y, status: 'not_paid' })
      .populate('student', 'name parentPhone rollNumber')
      .populate('class', 'name defaultAmount')

    const grouped = {}
    for (const p of unpaidPayments) {
      const cid = p.class._id.toString()
      if (!grouped[cid]) {
        grouped[cid] = { classId: cid, className: p.class.name, defaultAmount: p.class.defaultAmount, unpaidStudents: [], totalUnpaid: 0 }
      }
      grouped[cid].unpaidStudents.push({
        rollNumber: p.student.rollNumber,
        name: p.student.name,
        parentPhone: p.student.parentPhone,
        amount: p.amount,
      })
      grouped[cid].totalUnpaid += p.amount
    }

    let extraData = {}
    if (hasFeature(teacher, 'export')) {
      const allPaid = await MonthlyPayment.find({ class: { $in: classIds }, status: 'paid' })
      const allExpenses = await Expense.find({ teacher: teacherId })
      const totalInitialBalance = classes.reduce((sum, c) => sum + (c.initialBalance || 0), 0)
      const totalIncome = allPaid.reduce((s, p) => s + p.amount, 0)
      const totalExpenses = allExpenses.reduce((s, e) => s + e.amount, 0)
      extraData.overallBalance = {
        totalInitialBalance,
        totalIncome,
        grandTotal: totalInitialBalance + totalIncome,
        totalExpenses,
        balance: totalInitialBalance + totalIncome - totalExpenses,
      }
    }

    res.json({ success: true, month: m, year: y, totalUnpaidStudents: unpaidPayments.length, classes: Object.values(grouped), ...extraData })
  } catch (err) {
    console.error('getMonthlyReminder error:', err)
    res.status(500).json({ success: false, error: err.message })
  }
}

// ============================================================
//  SMS REMINDER
// ============================================================

exports.sendSmsReminders = async (req, res) => {
  try {
    const { classId, month, year } = req.body
    const teacherId = req.user.id

    const teacher = await Teacher.findById(teacherId)
    if (!teacher) return res.status(404).json({ success: false, error: 'Teacher topilmadi' })
    if (!hasFeature(teacher, 'sms_reminder')) {
      return res.status(403).json({ success: false, error: 'SMS reminder faqat Premium uchun', requiresUpgrade: true })
    }

    const cls = await Class.findOne({ _id: classId, teacher: teacherId })
    if (!cls) return res.status(404).json({ success: false, error: 'Sinf topilmadi' })

    const payments = await MonthlyPayment.find({ class: classId, month: Number(month), year: Number(year), status: 'not_paid' })
      .populate('student', 'name parentPhone rollNumber')

    if (payments.length === 0) {
      return res.json({ success: true, message: "SMS yuborilmaydigan o'quvchi yo'q", summary: { total: 0, sent: 0, failed: 0 } })
    }

    const studentsToNotify = payments.map((p) => ({
      _id: p.student._id, name: p.student.name, parentPhone: p.student.parentPhone, amount: p.amount,
    }))

    const results = await smsService.sendBulkReminders(studentsToNotify, cls.name, month, year)
    const successCount = results.filter((r) => r.status === 'sent').length
    const failedCount = results.filter((r) => r.status === 'failed').length

    res.json({ success: true, message: 'SMS reminder yuborildi', summary: { total: results.length, sent: successCount, failed: failedCount }, details: results })
  } catch (err) {
    console.error('sendSmsReminders error:', err)
    res.status(500).json({ success: false, error: err.message })
  }
}

// ============================================================
//  EXPORT
// ============================================================

exports.exportPayments = async (req, res) => {
  try {
    const { classId } = req.params
    const { month, year, format = 'json' } = req.query
    const teacherId = req.user.id

    const teacher = await Teacher.findById(teacherId)
    if (!teacher) return res.status(404).json({ success: false, error: 'Teacher topilmadi' })
    if (!hasFeature(teacher, 'export')) {
      return res.status(403).json({ success: false, error: 'Export faqat Premium uchun', requiresUpgrade: true })
    }

    const cls = await Class.findOne({ _id: classId, teacher: teacherId })
    if (!cls) return res.status(404).json({ success: false, error: 'Sinf topilmadi' })

    const students = await Student.find({ class: classId }).sort({ rollNumber: 1 })
    if (students.length === 0) return res.status(400).json({ success: false, error: "Bu sinfda o'quvchi yo'q" })

    const query = { class: classId }
    if (month) query.month = Number(month)
    if (year) query.year = Number(year)

    const payments = await MonthlyPayment.find(query).populate('student', 'name parentPhone rollNumber')

    const monthNames = ['Yanvar','Fevral','Mart','Aprel','May','Iyun','Iyul','Avgust','Sentabr','Oktabr','Noyabr','Dekabr']
    const monthName = month ? (monthNames[Number(month) - 1] || '') : ''

    const exportData = students.map((student) => {
      const payment = payments.find((p) => p.student._id.toString() === student._id.toString())
      return {
        '№': student.rollNumber,
        "O'quvchi ismi": student.name,
        'Ota-ona telefoni': student.parentPhone || '—',
        "Summa (so'm)": payment ? payment.amount : cls.defaultAmount,
        'Holati': payment?.status === 'paid' ? "To'lagan" : "To'lamagan",
        "To'lagan sanasi": payment?.paidDate ? new Date(payment.paidDate).toLocaleDateString('uz-UZ') : '—',
      }
    })

    const paidCount = exportData.filter((r) => r['Holati'] === "To'lagan").length
    const collectedOnSite = payments.filter((p) => p.status === 'paid').reduce((s, p) => s + p.amount, 0)
    const expectedTotal = students.length * cls.defaultAmount

    // ✅ Barcha xarajatlar
    const allExpenses = await Expense.find({ class: classId })
    const totalExpenses = allExpenses.reduce((s, e) => s + e.amount, 0)

    const meta = {
      paidCount,
      expectedTotal,
      collectedOnSite,
      initialBalance: cls.initialBalance || 0,
      initialBalanceNote: cls.initialBalanceNote || '',
      totalCollected: (cls.initialBalance || 0) + collectedOnSite,
      totalExpenses,
      realBalance: (cls.initialBalance || 0) + collectedOnSite - totalExpenses,
      remaining: expectedTotal - collectedOnSite,
      month: Number(month) || 0,
      year: Number(year) || new Date().getFullYear(),
      monthName,
    }

    if (format === 'excel') return exportToExcel(res, cls, exportData, meta)
    if (format === 'word') return exportToWord(res, cls, exportData, meta)

    return res.json({
      success: true,
      data: exportData,
      meta: { className: cls.name, ...meta, studentCount: students.length, unpaidCount: students.length - paidCount },
    })
  } catch (err) {
    console.error('exportPayments error:', err)
    res.status(500).json({ success: false, error: err.message })
  }
}

const exportToExcel = (res, cls, data, meta) => {
  try {
    const wb = XLSX.utils.book_new()

    const wsData = [
      ['№', "O'quvchi ismi", 'Ota-ona telefoni', "Summa (so'm)", 'Holati', "To'lagan sanasi"],
      ...data.map((d) => [d['№'], d["O'quvchi ismi"], d['Ota-ona telefoni'], d["Summa (so'm)"], d['Holati'], d["To'lagan sanasi"]]),
    ]
    const ws = XLSX.utils.aoa_to_sheet(wsData)
    ws['!cols'] = [{ wch: 5 }, { wch: 25 }, { wch: 18 }, { wch: 15 }, { wch: 14 }, { wch: 18 }]
    XLSX.utils.book_append_sheet(wb, ws, "To'lovlar")

    // ✅ Hisobot — boshlang'ich balans bilan
    const summaryRows = [
      [`${cls.name} — ${meta.monthName} ${meta.year}`],
      [],
      ['Ko\'rsatkich', 'Summa (so\'m)'],
      ["Jami o'quvchilar", data.length],
      ["To'lagan", meta.paidCount],
      ["To'lamagan", data.length - meta.paidCount],
      [],
      ["⬇ Saytdan oldingi balans", meta.initialBalance],
      ...(meta.initialBalanceNote ? [[`  (${meta.initialBalanceNote})`, '']] : []),
      ["⬇ Saytda yig'ilgan", meta.collectedOnSite],
      ["= Jami yig'ilgan (hamma vaqt)", meta.totalCollected],
      [],
      ["Jami xarajatlar", meta.totalExpenses],
      [],
      ["✅ Haqiqiy fond qoldig'i", meta.realBalance],
      [],
      ["Shu oy kutilayotgan", meta.expectedTotal],
      ["Shu oyda qolgan", meta.remaining],
    ]
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows)
    wsSummary['!cols'] = [{ wch: 32 }, { wch: 18 }]
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Hisobot')

    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer', compression: true })
    const fileName = encodeURIComponent(`${cls.name}_${meta.month}_${meta.year}.xlsx`)

    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"; filename*=UTF-8''${fileName}`)
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Length', buf.length)
    res.setHeader('Cache-Control', 'no-cache')
    return res.end(buf)
  } catch (err) {
    console.error('exportToExcel error:', err)
    if (!res.headersSent) res.status(500).json({ success: false, error: 'Excel export xatosi: ' + err.message })
  }
}

const exportToWord = async (res, cls, data, meta) => {
  try {
    const headerCells = ["№", "O'quvchi ismi", 'Ota-ona telefoni', "Summa (so'm)", 'Holati', "To'lagan sanasi"]
      .map((text) => new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text, bold: true, size: 20 })], alignment: AlignmentType.CENTER })],
        shading: { fill: '2B6CB0' },
      }))

    const dataRows = data.map((row) => {
      const isPaid = row['Holati'] === "To'lagan"
      return new TableRow({
        children: [
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(row['№'] || ''), size: 18 })] })] }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: row["O'quvchi ismi"] || '', size: 18 })] })] }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: row['Ota-ona telefoni'] || '', size: 18 })] })] }),
          new TableCell({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: String(row["Summa (so'm)"] || 0), size: 18 })] })] }),
          new TableCell({
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: row['Holati'] || '', size: 18, color: isPaid ? '276749' : 'C05621', bold: true })] })],
            shading: isPaid ? { fill: 'F0FFF4' } : { fill: 'FFFAF0' },
          }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: row["To'lagan sanasi"] || '', size: 18 })] })] }),
        ],
      })
    })

    const doc = new Document({
      sections: [{
        children: [
          new Paragraph({ children: [new TextRun({ text: `${cls.name} — To'lovlar Hisoboti`, bold: true, size: 32, color: '1A365D' })], alignment: AlignmentType.CENTER, spacing: { after: 200 } }),
          new Paragraph({ children: [new TextRun({ text: `${meta.monthName} ${meta.year}`, size: 24, color: '4A5568' })], alignment: AlignmentType.CENTER, spacing: { after: 400 } }),
          new Paragraph({ children: [new TextRun({ text: '📊 Moliyaviy holat', bold: true, size: 24 })], spacing: { after: 200 } }),
          ...(meta.initialBalance > 0 ? [
            new Paragraph({ children: [new TextRun({ text: `Saytdan oldingi balans: ${meta.initialBalance.toLocaleString('uz-UZ')} so'm`, size: 20, color: '2B6CB0' })] }),
            ...(meta.initialBalanceNote ? [new Paragraph({ children: [new TextRun({ text: `  (${meta.initialBalanceNote})`, size: 18, italics: true, color: '718096' })] })] : []),
          ] : []),
          new Paragraph({ children: [new TextRun({ text: `Saytda yig'ilgan: ${meta.collectedOnSite.toLocaleString('uz-UZ')} so'm`, size: 20 })] }),
          new Paragraph({ children: [new TextRun({ text: `Jami yig'ilgan: ${meta.totalCollected.toLocaleString('uz-UZ')} so'm`, size: 20, bold: true, color: '276749' })] }),
          new Paragraph({ children: [new TextRun({ text: `Jami xarajatlar: ${meta.totalExpenses.toLocaleString('uz-UZ')} so'm`, size: 20, color: 'C05621' })] }),
          new Paragraph({ children: [new TextRun({ text: `✅ Fond qoldig'i: ${meta.realBalance.toLocaleString('uz-UZ')} so'm`, size: 22, bold: true, color: meta.realBalance >= 0 ? '276749' : 'C53030' })], spacing: { after: 200 } }),
          new Paragraph({ children: [new TextRun({ text: `To'lagan: ${meta.paidCount} | To'lamagan: ${data.length - meta.paidCount}`, size: 20 })], spacing: { after: 400 } }),
          new Paragraph({ children: [new TextRun({ text: "📋 O'quvchilar ro'yxati", bold: true, size: 24 })], spacing: { after: 200 } }),
          new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [new TableRow({ children: headerCells, tableHeader: true }), ...dataRows] }),
          new Paragraph({ children: [new TextRun({ text: `Chiqarilgan: ${new Date().toLocaleDateString('uz-UZ')}`, size: 16, color: '718096', italics: true })], alignment: AlignmentType.RIGHT, spacing: { before: 400 } }),
        ],
      }],
    })

    const buf = await Packer.toBuffer(doc)
    const fileName = encodeURIComponent(`${cls.name}_${meta.month}_${meta.year}.docx`)

    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"; filename*=UTF-8''${fileName}`)
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    res.setHeader('Content-Length', buf.length)
    res.setHeader('Cache-Control', 'no-cache')
    return res.end(buf)
  } catch (err) {
    console.error('exportToWord error:', err)
    if (!res.headersSent) res.status(500).json({ success: false, error: 'Word export xatosi: ' + err.message })
  }
}

// ============================================================
//  SUBSCRIPTION
// ============================================================

exports.getSubscriptionInfo = async (req, res) => {
  try {
    const teacher = await Teacher.findById(req.user.id)
    if (!teacher) return res.status(404).json({ success: false, error: 'Teacher topilmadi' })

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
    res.status(500).json({ success: false, error: err.message })
  }
}

module.exports = exports