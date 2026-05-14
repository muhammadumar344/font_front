// src/controllers/freezeController.js — SODDALASHTIRILGAN (Telegram yo'q)
const FreezeSettings = require('../models/freezesettings')
const Teacher        = require('../models/Teacher')

// Hozirgi freeze holati
exports.getFreezeStatus = async (req, res) => {
  try {
    const freeze = await FreezeSettings.findOne().sort({ createdAt: -1 })
    res.json({ success: true, freeze: freeze || null, isActive: freeze?.isActive || false })
  } catch (e) {
    res.status(500).json({ success: false, error: e.message })
  }
}

// Freeze tarixi
exports.getFreezeHistory = async (req, res) => {
  try {
    const history = await FreezeSettings.find().sort({ createdAt: -1 }).limit(10)
    res.json({ success: true, history })
  } catch (e) {
    res.status(500).json({ success: false, error: e.message })
  }
}

// ── FREEZE YOQISH ────────────────────────────────────────────
exports.activateFreeze = async (req, res) => {
  try {
    const { reason } = req.body

    await FreezeSettings.updateMany({ isActive: true }, { isActive: false, endedAt: new Date() })

    const freeze = await FreezeSettings.create({
      isActive:  true,
      startedAt: new Date(),
      reason:    reason || 'Yozgi tatil',
      createdBy: req.user.id,
    })

    // Pro/Premium o'qituvchilar obunasini muzlatish
    const teachers = await Teacher.find({
      isActive: true,
      plan: { $ne: 'free' },
      planExpiresAt: { $gt: new Date() },
    })

    let frozenCount = 0
    for (const t of teachers) {
      t.freezeStartedAt   = new Date()
      t.freezeRemainingMs = Math.max(0, new Date(t.planExpiresAt) - new Date())
      await t.save()
      frozenCount++
    }

    res.json({
      success: true,
      message: `Freeze yoqildi. ${frozenCount} ta ustoz muzlatildi.`,
      freeze,
      frozenCount,
    })
  } catch (e) {
    res.status(500).json({ success: false, error: e.message })
  }
}

// ── FREEZE O'CHIRISH ─────────────────────────────────────────
exports.deactivateFreeze = async (req, res) => {
  try {
    const freeze = await FreezeSettings.findOne({ isActive: true })
    if (!freeze) {
      return res.status(400).json({ success: false, error: 'Aktiv freeze topilmadi' })
    }

    freeze.isActive = false
    freeze.endedAt  = new Date()
    await freeze.save()

    // Obunalarni tiklash
    const teachers = await Teacher.find({
      isActive: true,
      freezeStartedAt: { $ne: null },
      freezeRemainingMs: { $gt: 0 },
    })

    let restoredCount = 0
    for (const t of teachers) {
      t.planExpiresAt     = new Date(Date.now() + t.freezeRemainingMs)
      t.freezeStartedAt   = null
      t.freezeRemainingMs = 0
      await t.save()
      restoredCount++
    }

    res.json({
      success: true,
      message: `Freeze o'chirildi. ${restoredCount} ta ustoz tiklandi.`,
      restoredTeachers: restoredCount,
      freezeId: freeze._id,
    })
  } catch (e) {
    res.status(500).json({ success: false, error: e.message })
  }
}

// ── OLDINGI YIL EXPORT (Teacher uchun) ──────────────────────
exports.exportPreviousYear = async (req, res) => {
  try {
    const teacherId = req.user.id
    const { format = 'excel' } = req.query
    const prevYear  = new Date().getFullYear() - 1

    const XLSX = require('xlsx')
    const Class = require('../models/Class')
    const MonthlyPayment = require('../models/MonthlyPayment')
    const Expense = require('../models/Expense')
    const Teacher = require('../models/Teacher')

    const MONTHS = ['Yanvar','Fevral','Mart','Aprel','May','Iyun','Iyul','Avgust','Sentabr','Oktabr','Noyabr','Dekabr']

    const classes  = await Class.find({ teacher: teacherId })
    const classIds = classes.map(c => c._id)
    const teacher  = await Teacher.findById(teacherId).select('name')

    if (!classes.length) {
      return res.status(404).json({ success: false, error: 'Sinflar topilmadi' })
    }

    // Excel
    const wb = XLSX.utils.book_new()

    // 1) Yillik xulosa varag'i
    const summaryRows = [
      [`${teacher.name} — ${prevYear} yil Yillik Hisobot`],
      [],
      ['Oy', "To'lagan", "To'lamagan", "Yig'ilgan (so'm)", "Xarajat (so'm)", "Balans (so'm)"],
    ]

    let totalPaid = 0, totalExp = 0

    for (let m = 1; m <= 12; m++) {
      const payments = await MonthlyPayment.find({ class: { $in: classIds }, teacher: teacherId, year: prevYear, month: m })
      const expenses = await Expense.find({ teacher: teacherId, year: prevYear, month: m })
      const paidAmt  = payments.filter(p => p.status === 'paid').reduce((s, p) => s + p.amount, 0)
      const expAmt   = expenses.reduce((s, e) => s + e.amount, 0)
      const paidCnt  = payments.filter(p => p.status === 'paid').length
      const unpaidCnt = payments.filter(p => p.status === 'not_paid').length

      summaryRows.push([MONTHS[m - 1], paidCnt, unpaidCnt, paidAmt, expAmt, paidAmt - expAmt])
      totalPaid += paidAmt
      totalExp  += expAmt
    }

    summaryRows.push([], ['JAMI', '', '', totalPaid, totalExp, totalPaid - totalExp])
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows)
    wsSummary['!cols'] = [{ wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 18 }, { wch: 16 }, { wch: 16 }]
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Yillik xulosa')

    // 2) Har oy alohida varaq
    for (let m = 1; m <= 12; m++) {
      const payments = await MonthlyPayment.find({ class: { $in: classIds }, teacher: teacherId, year: prevYear, month: m })
        .populate('student', 'name rollNumber').populate('class', 'name')
      const expenses = await Expense.find({ teacher: teacherId, year: prevYear, month: m })
        .populate('class', 'name')

      if (!payments.length && !expenses.length) continue

      const rows = [
        [`${MONTHS[m - 1]} ${prevYear}`], [],
        ["To'lovlar:"],
        ['№', "O'quvchi", 'Sinf', "Summa (so'm)", 'Holati'],
        ...payments.map((p, i) => [i + 1, p.student?.name || '—', p.class?.name || '—', p.amount, p.status === 'paid' ? "To'lagan" : "To'lamagan"]),
        [], ['Xarajatlar:'],
        ['Sabab', 'Sinf', "Summa (so'm)"],
        ...expenses.map(e => [e.reason, e.class?.name || '—', e.amount]),
        [],
        ["Jami to'langan:", payments.filter(p => p.status === 'paid').reduce((s, p) => s + p.amount, 0)],
        ['Jami xarajat:', expenses.reduce((s, e) => s + e.amount, 0)],
      ]
      const ws = XLSX.utils.aoa_to_sheet(rows)
      ws['!cols'] = [{ wch: 5 }, { wch: 22 }, { wch: 10 }, { wch: 14 }, { wch: 12 }]
      XLSX.utils.book_append_sheet(wb, ws, MONTHS[m - 1])
    }

    const buf      = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer', compression: true })
    const fileName = encodeURIComponent(`${teacher.name}_${prevYear}_hisobot.xlsx`)
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"; filename*=UTF-8''${fileName}`)
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Length', buf.length)
    return res.end(buf)

  } catch (e) {
    console.error('exportPreviousYear error:', e)
    res.status(500).json({ success: false, error: e.message })
  }
}