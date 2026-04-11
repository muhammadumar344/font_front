// ============================================================================
// FILE: server.js (TO'LIQQA YANGILANG)
// ============================================================================

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();

// ✅ MUHIM: JSON middleware BIRINCHI bo'lishi kerak
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Routes
app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/admin', require('./src/routes/admin'));
app.use('/api/teacher', require('./src/routes/teacher'));
app.use('/api/classes', require('./src/routes/classes'));
app.use('/api/students', require('./src/routes/students'));
app.use('/api/payments', require('./src/routes/payments'));
app.use('/api/expenses', require('./src/routes/expenses'));
// app.use('/api/subscription', require('./src/routes/subscription'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'Server is running', timestamp: new Date() });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint topilmadi' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);

  if (err.name === 'ValidationError') {
    return res.status(400).json({ error: err.message });
  }

  if (err.name === 'MongoServerError' && err.code === 11000) {
    return res.status(400).json({ error: 'Duplikat: bu email allaqachon ro\'yxatdan o\'tgan' });
  }

  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ error: 'Token yaroqsiz' });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ error: 'Token muddati o\'tgan' });
  }

  res.status(500).json({ error: err.message || 'Server xatosi' });
});

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;

mongoose
  .connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log('✅ MongoDB ulandi');
    app.listen(PORT, () => {
      console.log(`🚀 Server http://localhost:${PORT} da ishga tushdi`);
    });
  })
  .catch((err) => {
    console.error('❌ MongoDB ulanmadi:', err.message);
    process.exit(1);
  });