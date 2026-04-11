const express = require('express');
const router = express.Router();
const teacherController = require('../controllers/teacherController');
const authMiddleware = require('../middleware/authMiddleware');

router.use(authMiddleware);

// Sinflar
router.post('/classes', teacherController.createClass);
router.get('/classes', teacherController.getMyClasses);
router.put('/classes/:classId', teacherController.updateMyClass);
router.delete('/classes/:classId', teacherController.deleteMyClass);

// Default summa
router.post('/classes/:classId/set-amount', teacherController.setDefaultAmount);

// Dashboard
router.get('/dashboard', teacherController.getTeacherDashboard);

// Plan tanlash
router.post('/select-plan', teacherController.selectPlan);

module.exports = router;