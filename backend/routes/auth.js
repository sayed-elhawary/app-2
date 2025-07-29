const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');
const winston = require('winston');

const router = express.Router();

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
    new winston.transports.Console(),
  ],
});

router.post('/login', async (req, res) => {
  const { code, password } = req.body;

  try {
    const trimmedCode = code ? code.trim() : '';
    const trimmedPassword = password ? password.trim().replace(/[^\w\s@#$%^&*()]/g, '') : '';

    logger.info('Login attempt:', { code: trimmedCode });

    if (!trimmedCode || !trimmedPassword) {
      logger.warn('Invalid input: Empty code or password', { code, password });
      return res.status(400).json({ message: 'رمز الموظف وكلمة المرور مطلوبان' });
    }

    const user = await User.findOne({ code: trimmedCode });
    if (!user) {
      logger.warn('User not found:', trimmedCode);
      return res.status(400).json({ message: 'رمز الموظف غير صحيح' });
    }

    logger.info('Stored hash:', user.password);
    const isMatch = await bcrypt.compare(trimmedPassword, user.password);
    logger.info('Password comparison result:', isMatch);

    if (!isMatch) {
      logger.warn('Password mismatch for code:', trimmedCode);
      return res.status(400).json({ message: 'كلمة المرور غير صحيحة' });
    }

    const token = jwt.sign(
      {
        id: user._id,
        code: user.code, // إضافة code للـ payload
        role: user.role
      },
      process.env.JWT_SECRET || 'your_jwt_secret',
      { expiresIn: '1h' }
    );

    logger.info(`Login successful for code: ${trimmedCode}`);
    res.json({
      user: {
        _id: user._id,
        code: user.code,
        employeeName: user.employeeName,
        role: user.role,
      },
      token,
    });
  } catch (err) {
    logger.error('Login Error:', { error: err.message, stack: err.stack });
    res.status(500).json({ message: `خطأ في الخادم: ${err.message}` });
  }
});

// نقطة نهاية لاختبار كلمة المرور
router.post('/test-password', async (req, res) => {
  const { code, password } = req.body;
  const trimmedCode = code ? code.trim() : '';
  const trimmedPassword = password ? password.trim().replace(/[^\w\s@#$%^&*()]/g, '') : '';

  try {
    const user = await User.findOne({ code: trimmedCode });
    if (!user) {
      logger.warn('User not found for test-password:', trimmedCode);
      return res.status(404).json({ message: 'المستخدم غير موجود' });
    }

    const isMatch = await bcrypt.compare(trimmedPassword, user.password);
    logger.info('Test password result:', { code: trimmedCode, isMatch });
    res.json({
      isMatch,
      storedHash: user.password,
      inputPassword: trimmedPassword,
    });
  } catch (err) {
    logger.error('Test Password Error:', { error: err.message, stack: err.stack });
    res.status(500).json({ message: `خطأ أثناء اختبار كلمة المرور: ${err.message}` });
  }
});

router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) {
      logger.warn('User not found for /me:', req.user.id);
      return res.status(404).json({ message: 'المستخدم غير موجود' });
    }
    logger.info(`Fetched user data for /me: ${user.code}`);
    res.json({
      user: {
        _id: user._id,
        code: user.code,
        employeeName: user.employeeName,
        role: user.role,
      },
    });
  } catch (err) {
    logger.error('Get Me Error:', { error: err.message, stack: err.stack });
    res.status(500).json({ message: `خطأ في الخادم: ${err.message}` });
  }
});

module.exports = router;
