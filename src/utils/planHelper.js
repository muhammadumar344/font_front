// src/utils/planHelper.js

const PLAN_LIMITS = {
  free:    { classes: 1,  students: 30  },
  pro:     { classes: 3,  students: 60  },
  premium: { classes: 10, students: 999 },
}

const PLAN_PRICES = {
  free:    { monthly: 0     },
  pro:     { monthly: 29000 },
  premium: { monthly: 59000 },
}

const PLAN_FEATURES = {
  free:    { monthly_reminder: false, export: false, multi_lang: false, sms_reminder: false, telegram: false },
  pro:     { monthly_reminder: true,  export: false, multi_lang: false, sms_reminder: false, telegram: true  },
  premium: { monthly_reminder: true,  export: true,  multi_lang: true,  sms_reminder: true,  telegram: true  },
}

/**
 * Teacher ning hozirgi aktiv planida ma'lum funksiya bormi?
 */
const hasFeature = (teacher, feature) => {
  const activePlan = teacher.isPlanActive() ? teacher.plan : 'free'
  return PLAN_FEATURES[activePlan]?.[feature] || false
}

/**
 * Yangi sinf ocha oladimi?
 */
const canOpenNewClass = (teacher, currentClassCount) => {
  const activePlan = teacher.isPlanActive() ? teacher.plan : 'free'
  const limit = PLAN_LIMITS[activePlan]
  return currentClassCount < limit.classes
}

/**
 * Sinfga yangi o'quvchi qo'sha oladimi?
 * classPlan — sinf yaratilgandagi plan (highestPlanEver ga o'xshash)
 */
const canAddStudent = (classPlan, currentStudentCount) => {
  const limit = PLAN_LIMITS[classPlan] || PLAN_LIMITS.free
  return currentStudentCount < limit.students
}

module.exports = { PLAN_LIMITS, PLAN_PRICES, PLAN_FEATURES, hasFeature, canOpenNewClass, canAddStudent }