// server.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();

app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:5173', 'https://font-front.onrender.com'],
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ limit: '10mb', extended: true }));

app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server ishlayapti' });
});

app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/admin', require('./src/routes/admin'));
app.use('/api/teacher', require('./src/routes/teacher'));

app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint topilmadi: ' + req.path });
});

app.use((err, req, res, next) => {
  console.error('❌ Server xatosi:', err);
  res.status(500).json({
    error: 'Server xatosi',
    message: err.message
  });
});

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/school_fond';

mongoose
  .connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  })
  .then(() => {
    console.log('✅ MongoDB ulandi');
    app.listen(PORT, () => {
      console.log(`🚀 Server http://localhost:${PORT} da ishga tushdi`);
      console.log(`🏥 Health check: http://localhost:${PORT}/health`);
    });
  })
  .catch((err) => {
    console.error('❌ MongoDB ulanmadi:', err.message);
    process.exit(1);
  });