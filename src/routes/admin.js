// src/routes/admin.js
const express = require('express');
const adminController = require('../controllers/adminController');
const auth = require('../middleware/auth');
const adminRole = require('../middleware/roles');

const router = express.Router();

// ✅ Setup endpoint (birinchi admin yaratish uchun)
router.post('/setup', adminController.createAdmin);

// ✅ Barcha qolgan endpointlar admin middleware orqali
router.use(auth, adminRole('admin'));

router.get('/dashboard', adminController.getDashboard);
router.post('/teachers', adminController.createTeacher);
router.put('/teachers/:teacherId/password', adminController.updateTeacherPassword);
router.put('/teachers/:teacherId/plan', adminController.updateTeacherPlan);
router.put('/teachers/:teacherId/deactivate', adminController.deactivateTeacher);
router.put('/teachers/:teacherId/activate', adminController.activateTeacher);  // ✅ YANGI
router.get('/plans', adminController.getPlanPrices);

module.exports = router;