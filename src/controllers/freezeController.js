// src/controllers/freezeController.js
const FreezeSettings = require('../models/freezesettings')
const Teacher = require('../models/Teacher')
const TelegramParent = require('../models/TelegramParent')
const {
  sendFreezeNotification,
  sendUnfreezeNotification,
} = require('../services/telegramService')

const FREEZE_REASON_DEFAULT = 'Yozgi tatil (iyun-avgust)'

// Hozirgi freeze holati
exports.getFreezeStatus = async (req, res) => {
  try {
    const freeze = await FreezeSettings.findOne().sort({ createdAt: -1 })
    res.json({
      success: true,
      freeze: freeze || null,
      isActive: freeze?.isActive || false,
    })
  } catch (e) {
    res.status(500).json({ success: false, error: e.message })
  }
}

// ✅ Freeze YOQISH — barcha o'qituvchilar obunasi kuni to'xtaydi
exports.activateFreeze = async (req, res) => {
  try {
    const { reason } = req.body
    const adminId = req.user.id

    // Avvalgi aktivni o'chirish
    await FreezeSettings.updateMany({ isActive: true }, { isActive: false, endedAt: new Date() })

    const freeze = await FreezeSettings.create({
      isActive: true,
      startedAt: new Date(),
      reason: reason || FREEZE_REASON_DEFAULT,
      createdBy: adminId,
    })

    // Barcha aktiv o'qituvchilar obunasidagi "freezeStartedAt" saqlanadi
    const teachers = await Teacher.find({ isActive: true, plan: { $ne: 'free' } })
    let notifiedCount = 0

    for (const teacher of teachers) {
      // Obuna muddatini saqlab, freeze boshlagan sanani qayd qilish
      teacher.freezeStartedAt    = new Date()
      teacher.freezeRemainingMs  = teacher.planExpiresAt
        ? Math.max(0, new Date(teacher.planExpiresAt) - new Date())
        : 0
      await teacher.save()

      // Telegram xabari
      try {
        const tgParent = await TelegramParent.findOne({ teacherId: teacher._id })
        // O'qituvchi uchun alohida chat ID yo'q, lekin agar boshqa tizim bo'lsa ishlatiladi
        // Hozircha konsolga log
        console.log(`Freeze: ${teacher.name} (${teacher.email}) xabardor qilindi`)
        notifiedCount++
      } catch {}
    }

    res.json({
      success: true,
      message: `Freeze yoqildi. ${teachers.length} ta o'qituvchi obunasi muzlatildi.`,
      freeze,
      affectedTeachers: teachers.length,
    })
  } catch (e) {
    res.status(500).json({ success: false, error: e.message })
  }
}

// ✅ Freeze O'CHIRISH — barcha obunalar davom etadi
exports.deactivateFreeze = async (req, res) => {
  try {
    const freeze = await FreezeSettings.findOne({ isActive: true })
    if (!freeze) {
      return res.status(400).json({ success: false, error: 'Aktiv freeze topilmadi' })
    }

    freeze.isActive = false
    freeze.endedAt  = new Date()
    freeze.unfreezeNotified = true
    await freeze.save()

    // Muzlagan vaqtni obunaga qaytarish
    const teachers = await Teacher.find({
      isActive: true,
      freezeStartedAt: { $ne: null },
    })

    let restoredCount = 0
    for (const teacher of teachers) {
      if (teacher.freezeRemainingMs && teacher.freezeRemainingMs > 0) {
        // Qolgan vaqtni hozirdan hisoblash
        const newExpiry = new Date(Date.now() + teacher.freezeRemainingMs)
        teacher.planExpiresAt     = newExpiry
        teacher.freezeStartedAt   = null
        teacher.freezeRemainingMs = 0
        await teacher.save()
        restoredCount++

        console.log(`Unfreeze: ${teacher.name} — yangi muddat: ${newExpiry.toLocaleDateString('uz-UZ')}`)
      }
    }

    res.json({
      success: true,
      message: `Freeze o'chirildi. ${restoredCount} ta o'qituvchi obunasi tiklandi.`,
      restoredTeachers: restoredCount,
    })
  } catch (e) {
    res.status(500).json({ success: false, error: e.message })
  }
}

// Freeze tarixi
exports.getFreezeHistory = async (req, res) => {
  try {
    const history = await FreezeSettings.find()
      .sort({ createdAt: -1 })
      .limit(10)
    res.json({ success: true, history })
  } catch (e) {
    res.status(500).json({ success: false, error: e.message })
  }
}