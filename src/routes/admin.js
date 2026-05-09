// src/routes/admin.js
const express = require('express')
const adminCtrl  = require('../controllers/adminController')
const freezeCtrl = require('../controllers/freezeController')
const auth  = require('../middleware/auth')
const roles = require('../middleware/roles')

const router = express.Router()

router.use(auth, roles('admin'))

router.get('/dashboard',                       adminCtrl.getDashboard)
router.post('/teachers',                       adminCtrl.createTeacher)
router.put('/teachers/:teacherId/password',    adminCtrl.updateTeacherPassword)
router.put('/teachers/:teacherId/plan',        adminCtrl.updateTeacherPlan)
router.put('/teachers/:teacherId/deactivate',  adminCtrl.deactivateTeacher)
router.put('/teachers/:teacherId/activate',    adminCtrl.activateTeacher)
router.get('/plans',                           adminCtrl.getPlanPrices)

// ✅ YANGI: Freeze endpointlari
router.get('/freeze',            freezeCtrl.getFreezeStatus)
router.post('/freeze/activate',  freezeCtrl.activateFreeze)
router.post('/freeze/deactivate',freezeCtrl.deactivateFreeze)
router.get('/freeze/history',    freezeCtrl.getFreezeHistory)

module.exports = router