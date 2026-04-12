// backend/server.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ✅ Routes
app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/admin', require('./src/routes/admin'));
app.use('/api/teacher', require('./src/routes/teacher'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Server xatosi' });
});

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/school_fund';

mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('✅ MongoDB ulandi');
  app.listen(PORT, () => {
    console.log(`🚀 Server ${PORT} portda ishga tushdi`);
    console.log(`📝 Setup: http://localhost:${PORT}/api/health`);
  });
}).catch(err => {
  console.error('❌ MongoDB xatosi:', err);
  process.exit(1);
});