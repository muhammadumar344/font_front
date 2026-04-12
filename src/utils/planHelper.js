// src/controllers/planHelper.js

// ── Plan narxlari ─────────────────────────────────────────────
const PLAN_PRICES = {
  free:    { monthly: 0 },
  pro:     { monthly: 30000 },
  premium: { monthly: 50000 },
};

// ── Plan limitleri ─────────────────────────────────────────────
const PLAN_LIMITS = {
  free:    { classes: 1, students: 30 },
  pro:     { classes: 3, students: 40 },
  premium: { classes: 5, students: 50 },
};

// ── Vaqtli funksiyalar (obuna tugasa yo'qoladi) ────────────────
const TEMP_FEATURES = {
  free:    [],
  pro:     ['monthly_reminder'],
  premium: ['monthly_reminder', 'export', 'multi_lang', 'sms_reminder'],
};

// ── Doimiy funksiyalar (obuna tugasa ham qoladi) ───────────────
// — Ochilgan sinflar saqlanadi
// — O'quvchilar saqlanadi
// — To'lov tarixi saqlanadi
// — Xarajatlar saqlanadi

// ── Funksiyani tekshirish ──────────────────────────────────────
const hasFeature = (teacher, feature) => {
  const activePlan = teacher.isPlanActive() ? teacher.plan : 'free';
  return TEMP_FEATURES[activePlan]?.includes(feature) || false;
};

// ── Yangi sinf ocha oladimi? ───────────────────────────────────
// Yangi sinf ochish faqat AKTIV obuna bilan mumkin
const canOpenNewClass = (teacher, currentClassCount) => {
  const activePlan = teacher.isPlanActive() ? teacher.plan : 'free';
  const limit = PLAN_LIMITS[activePlan];
  return currentClassCount < limit.classes;
};

// ── Yangi o'quvchi qo'sha oladimi? ────────────────────────────
// O'quvchi qo'shish: sinf qaysi plan da ochilgan bo'lsa o'sha limit
const canAddStudent = (classPlan, currentStudentCount) => {
  const limit = PLAN_LIMITS[classPlan] || PLAN_LIMITS.free;
  return currentStudentCount < limit.students;
};

module.exports = {
  PLAN_PRICES,
  PLAN_LIMITS,
  TEMP_FEATURES,
  hasFeature,
  canOpenNewClass,
  canAddStudent,
};