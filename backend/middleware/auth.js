const jwt = require('jsonwebtoken');
const winston = require('winston');

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

module.exports = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) {
    logger.warn('No token provided in request');
    return res.status(401).json({ message: 'التوكن غير موجود' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret');
    if (!decoded.id || !decoded.code || !decoded.role) {
      logger.warn('Invalid token payload', { decoded });
      return res.status(401).json({ message: 'التوكن يحتوي على بيانات غير كاملة' });
    }

    req.user = {
      id: decoded.id,
      code: decoded.code,
      role: decoded.role
    };
    logger.info(`Token verified for user: ${decoded.code}, role: ${decoded.role}`);
    next();
  } catch (err) {
    logger.error('Token verification error:', { error: err.message, stack: err.stack });
    return res.status(401).json({ message: 'التوكن غير صالح' });
  }
};
