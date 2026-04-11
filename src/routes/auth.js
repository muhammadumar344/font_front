const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/authMiddleware');

router.post('/admin/login', authController.adminLogin);
router.post('/teacher/login', authController.teacherLogin);
router.get('/me', authMiddleware, authController.getMe);

module.exports = router;