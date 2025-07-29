const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
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

/**
 * مخطط المستخدم لإدارة بيانات الموظفين.
 * @typedef {Object} User
 */
const userSchema = new mongoose.Schema({
  /** رمز الموظف الفريد */
  code: { type: String, required: true, unique: true },
  /** كلمة المرور المشفرة */
  password: { type: String, required: true },
  /** اسم الموظف */
  employeeName: { type: String, required: true },
  /** القسم الذي يعمل به الموظف */
  department: { type: String, required: true },
  /** الراتب الأساسي */
  baseSalary: { type: Number, required: true, min: 0 },
  /** التأمين الطبي */
  medicalInsurance: { type: Number, default: 0, min: 0 },
  /** التأمين الاجتماعي */
  socialInsurance: { type: Number, default: 0, min: 0 },
  /** بدل الوجبات */
  mealAllowance: { type: Number, default: 500, min: 0 },
  /** عدد أيام العمل في الأسبوع (5 أو 6 أيام) */
  workingDays: { type: String, enum: ['5', '6'], default: '5' },
  /** نوع الدوام (إداري، محطة نهارية، محطة ليلية، 24/24) */
  shiftType: {
    type: String,
    enum: ['administrative', 'dayStation', 'nightStation', '24/24'],
    default: 'administrative',
  },
  /** رصيد الإجازات السنوية */
  annualLeaveBalance: { type: Number, default: 21, min: 0 },
  /** رصيد السماح الشهري للتأخير (بالدقائق) */
  monthlyLateAllowance: { type: Number, default: 120, min: 0 },
  /** إجمالي المخالفات */
  violationsTotal: { type: Number, default: 0, min: 0 },
  /** استقطاعات المخالفات */
  violationsDeduction: { type: Number, default: 0, min: 0 },
  /** إجمالي السلف */
  advancesTotal: { type: Number, default: 0, min: 0 },
  /** استقطاعات السلف */
  advancesDeduction: { type: Number, default: 0, min: 0 },
  /** صافي الراتب */
  netSalary: { type: Number, default: 0, min: 0 },
  /** معرف المستخدم الذي أنشأ السجل */
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  /** معرف المستخدم الذي قام بالتحديث */
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  /** دور المستخدم (user أو admin) */
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
});

// فهرسة حقول لتحسين الأداء
userSchema.index({ code: 1 }, { unique: true });
userSchema.index({ employeeName: 1 }); // إضافة فهرس على employeeName لتحسين البحث

/**
 * تشفير كلمة المرور قبل الحفظ
 * @function
 */
userSchema.pre('save', async function (next) {
  try {
    if (this.isModified('password')) {
      logger.info(`Encrypting password for save (code: ${this.code})`);
      this.password = await bcrypt.hash(this.password, 10);
      logger.info(`Password encrypted successfully for code: ${this.code}`);
    }
    // التأكد من أن القيم لا تصبح سلبية
    if (this.monthlyLateAllowance < 0) {
      logger.warn(`Negative monthlyLateAllowance detected for code: ${this.code}, resetting to 0`);
      this.monthlyLateAllowance = 0;
    }
    if (this.annualLeaveBalance < 0) {
      logger.warn(`Negative annualLeaveBalance detected for code: ${this.code}, resetting to 0`);
      this.annualLeaveBalance = 0;
    }
    if (this.violationsTotal < 0) {
      logger.warn(`Negative violationsTotal detected for code: ${this.code}, resetting to 0`);
      this.violationsTotal = 0;
    }
    if (this.violationsDeduction < 0) {
      logger.warn(`Negative violationsDeduction detected for code: ${this.code}, resetting to 0`);
      this.violationsDeduction = 0;
    }
    if (this.advancesTotal < 0) {
      logger.warn(`Negative advancesTotal detected for code: ${this.code}, resetting to 0`);
      this.advancesTotal = 0;
    }
    if (this.advancesDeduction < 0) {
      logger.warn(`Negative advancesDeduction detected for code: ${this.code}, resetting to 0`);
      this.advancesDeduction = 0;
    }
    if (this.netSalary < 0) {
      logger.warn(`Negative netSalary detected for code: ${this.code}, resetting to 0`);
      this.netSalary = 0;
    }
    next();
  } catch (err) {
    logger.error(`Error encrypting password or validating fields for code: ${this.code}, error: ${err.message}`);
    next(err);
  }
});

/**
 * تشفير كلمة المرور عند التحديث
 * @function
 */
userSchema.pre('findOneAndUpdate', async function (next) {
  try {
    const update = this.getUpdate();
    const code = update.$set?.code || 'unknown';
    if (update.$set && update.$set.password && !update.$set.password.startsWith('$2a$')) {
      logger.info(`Encrypting password for update (code: ${code})`);
      update.$set.password = await bcrypt.hash(update.$set.password, 10);
      logger.info(`Password encrypted successfully for update (code: ${code})`);
    }
    // التأكد من أن القيم لا تصبح سلبية
    if (update.$set) {
      if (update.$set.monthlyLateAllowance < 0) {
        logger.warn(`Negative monthlyLateAllowance detected for code: ${code}, resetting to 0`);
        update.$set.monthlyLateAllowance = 0;
      }
      if (update.$set.annualLeaveBalance < 0) {
        logger.warn(`Negative annualLeaveBalance detected for code: ${code}, resetting to 0`);
        update.$set.annualLeaveBalance = 0;
      }
      if (update.$set.violationsTotal < 0) {
        logger.warn(`Negative violationsTotal detected for code: ${code}, resetting to 0`);
        update.$set.violationsTotal = 0;
      }
      if (update.$set.violationsDeduction < 0) {
        logger.warn(`Negative violationsDeduction detected for code: ${code}, resetting to 0`);
        update.$set.violationsDeduction = 0;
      }
      if (update.$set.advancesTotal < 0) {
        logger.warn(`Negative advancesTotal detected for code: ${code}, resetting to 0`);
        update.$set.advancesTotal = 0;
      }
      if (update.$set.advancesDeduction < 0) {
        logger.warn(`Negative advancesDeduction detected for code: ${code}, resetting to 0`);
        update.$set.advancesDeduction = 0;
      }
      if (update.$set.netSalary < 0) {
        logger.warn(`Negative netSalary detected for code: ${code}, resetting to 0`);
        update.$set.netSalary = 0;
      }
    }
    next();
  } catch (err) {
    logger.error(`Error encrypting password or validating fields for update (code: ${this.getQuery().code || 'unknown'}), error: ${err.message}`);
    next(err);
  }
});

/**
 * مقارنة كلمة المرور المدخلة مع المشفرة
 * @param {string} password - كلمة المرور المدخلة
 * @returns {Promise<boolean>} - نتيجة المقارنة
 */
userSchema.methods.comparePassword = async function (password) {
  try {
    logger.info(`Comparing password for code: ${this.code}`);
    const isMatch = await bcrypt.compare(password, this.password);
    logger.info(`Password comparison result for code: ${this.code}: ${isMatch}`);
    return isMatch;
  } catch (err) {
    logger.error(`Error comparing password for code: ${this.code}, error: ${err.message}`);
    throw err;
  }
};

/**
 * إعادة تعيين رصيد السماح الشهري إلى القيمة الافتراضية
 * @param {string} [code] - رمز الموظف (اختياري، إذا لم يُحدد يتم تطبيقه على جميع المستخدمين)
 * @returns {Promise<void>}
 */
userSchema.statics.resetMonthlyLateAllowance = async function (code) {
  try {
    const query = code ? { code } : {};
    const result = await this.updateMany(
      query,
      { $set: { monthlyLateAllowance: 120 } }
    );
    logger.info(`Reset monthlyLateAllowance for ${code || 'all users'}: ${JSON.stringify(result)}`);
  } catch (err) {
    logger.error(`Error resetting monthlyLateAllowance for ${code || 'all users'}: ${err.message}`);
    throw err;
  }
};

/**
 * إعادة تعيين رصيد الإجازات السنوية إلى القيمة الافتراضية
 * @param {string} [code] - رمز الموظف (اختياري، إذا لم يُحدد يتم تطبيقه على جميع المستخدمين)
 * @returns {Promise<void>}
 */
userSchema.statics.resetAnnualLeaveBalance = async function (code) {
  try {
    const query = code ? { code } : {};
    const result = await this.updateMany(
      query,
      { $set: { annualLeaveBalance: 21 } }
    );
    logger.info(`Reset annualLeaveBalance for ${code || 'all users'}: ${JSON.stringify(result)}`);
  } catch (err) {
    logger.error(`Error resetting annualLeaveBalance for ${code || 'all users'}: ${err.message}`);
    throw err;
  }
};

module.exports = mongoose.model('User', userSchema);
