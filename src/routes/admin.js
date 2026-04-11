const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const authMiddleware = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');

router.post('/setup', adminController.createAdmin);
router.post('/login', adminController.adminLogin);

router.use(authMiddleware, adminMiddleware);

// Teachers
router.post('/teachers', adminController.createTeacher);
router.get('/teachers', adminController.getAllTeachers);
router.delete('/teachers/:teacherId', adminController.deleteTeacher);
router.put('/teachers/:teacherId/reset-password', adminController.resetTeacherPassword);

// Subscription
router.post('/teachers/:teacherId/subscription', adminController.setTeacherSubscription);

// Dashboard
router.get('/dashboard', adminController.getDashboard);

module.exports = router;