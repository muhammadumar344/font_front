const express = require('express')
const adminController = require('../controllers/adminController')
const auth = require('../middleware/auth')
const roles = require('../middleware/roles')

const router = express.Router()

router.use(auth, roles('admin'))

router.get('/dashboard', adminController.getDashboard)
router.post('/teachers', adminController.createTeacher)
router.put('/teachers/:teacherId/password', adminController.updateTeacherPassword)
router.put('/teachers/:teacherId/plan', adminController.updateTeacherPlan)
router.put('/teachers/:teacherId/deactivate', adminController.deactivateTeacher)
router.put('/teachers/:teacherId/activate', adminController.activateTeacher)
router.get('/plans', adminController.getPlanPrices)

module.exports = router