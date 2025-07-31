const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const attendanceRoutes = require('./routes/attendance');
const morgan = require('morgan');

dotenv.config();

const app = express();

// إعداد CORS
app.use(cors({
	origin: 'http://3.16.1.173:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Logging لتتبع الطلبات
app.use(morgan('dev'));

// معالجة JSON
app.use(express.json());

// الاتصال بـ MongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
})
  .then(() => console.log('MongoDB connected successfully'))
  .catch((err) => console.error('MongoDB connection error:', err));

// إعداد المسارات
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/attendance', attendanceRoutes);

// معالجة الأخطاء العامة (404)
app.use((req, res, next) => {
  console.log('404 Error: Path not found:', req.originalUrl);
  res.status(404).json({ message: 'المسار غير موجود' });
});

// معالجة الأخطاء الداخلية (500)
app.use((err, req, res, next) => {
  console.error('Server error:', err.stack);
  res.status(500).json({ message: `خطأ في الخادم: ${err.message}` });
});

// تشغيل الخادم
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
