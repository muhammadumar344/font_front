// src/routes/auth.js
const express = require('express');
const authController = require('../controllers/authController');
const router = express.Router();

// ✅ Setup endpoint (birinchi admin yaratish)
router.post('/setup', authController.createAdmin);

// ✅ Setup tekshirish
router.get('/setup/check', authController.checkSetup);

// Login endpointlari
router.post('/admin/login', authController.adminLogin);
router.post('/teacher/login', authController.teacherLogin);

module.exports = router;