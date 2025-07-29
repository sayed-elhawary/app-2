const mongoose = require('mongoose');
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

const attendanceSchema = new mongoose.Schema({
  employeeCode: { type: String, required: true },
  employeeName: { type: String, required: true },
  date: { type: Date, required: true },
  checkIn: { type: String },
  checkOut: { type: String },
  status: {
    type: String,
    enum: ['present', 'absent', 'weekly_off', 'leave', 'official_leave', 'medical_leave'],
    default: 'absent',
  },
  shiftType: {
    type: String,
    enum: ['administrative', 'dayStation', 'nightStation', '24/24'],
    required: true,
  },
  workingDays: { type: String, required: true },
  lateMinutes: { type: Number, default: 0 },
  deductedDays: { type: Number, default: 0 },
  calculatedWorkDays: { type: Number, default: 0 },
  extraHours: { type: Number, default: 0 },
  extraHoursCompensation: { type: Number, default: 0 },
  workHours: { type: Number, default: 0 },
  hoursDeduction: { type: Number, default: 0 },
  fridayBonus: { type: Number, default: 0 },
  annualLeaveBalance: { type: Number, default: 21 },
  monthlyLateAllowance: { type: Number, default: 120 },
  leaveCompensation: { type: Number, default: 0 },
  medicalLeaveDeduction: { type: Number, default: 0 },
  workedFriday: { type: Boolean, default: false }, // إضافة حقل workedFriday
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  totalExtraHours: { type: Number, default: 0 },
}, { timestamps: true });

attendanceSchema.pre('save', async function (next) {
  try {
    const NORMAL_WORK_HOURS = 9;
    const isFriday = this.date.getDay() === 5;

    // جلب بيانات المستخدم للحصول على baseSalary لحساب fridayBonus
    const user = await mongoose.model('User').findOne({ code: this.employeeCode }).lean();
    if (!user) {
      logger.error(`User not found for employeeCode: ${this.employeeCode}`);
      return next(new Error('المستخدم غير موجود'));
    }

    const dailySalary = parseFloat(user.baseSalary || 0) / 30;
    const hourlyRate = dailySalary / 9;

    // حساب workHours، extraHours، hoursDeduction، وfridayBonus
    if (this.status === 'present' && this.checkIn && this.checkOut) {
      const checkInDate = new Date(this.date);
      checkInDate.setHours(parseInt(this.checkIn.split(':')[0]), parseInt(this.checkIn.split(':')[1]));
      let checkOutDate = new Date(this.date);
      checkOutDate.setHours(parseInt(this.checkOut.split(':')[0]), parseInt(this.checkOut.split(':')[1]));

      // لشيفت 24/24، افترض الانصراف في اليوم التالي
      if (this.shiftType === '24/24' && checkOutDate <= checkInDate) {
        checkOutDate.setDate(checkOutDate.getDate() + 1);
      } else if (checkOutDate <= checkInDate) {
        checkOutDate.setDate(checkOutDate.getDate() + 1);
      }

      const hoursWorked = (checkOutDate - checkInDate) / (1000 * 60 * 60);
      this.workHours = parseFloat(hoursWorked.toFixed(2));

      if (this.shiftType === 'administrative') {
        const checkOutTime = parseInt(this.checkOut.split(':')[0]) * 60 + parseInt(this.checkOut.split(':')[1]);
        const thresholdTime = 17 * 60 + 30; // 17:30
        if (checkOutTime > thresholdTime) {
          this.extraHours = parseFloat(((checkOutTime - thresholdTime) / 60).toFixed(2));
          this.extraHoursCompensation = this.extraHours * hourlyRate;
          this.hoursDeduction = 0;
          this.calculatedWorkDays = 1;
        } else {
          this.extraHours = 0;
          this.extraHoursCompensation = 0;
          this.hoursDeduction = 0;
          this.calculatedWorkDays = 1;
        }
        this.fridayBonus = 0; // لا يوجد بدل جمعة للشيفت الإداري
      } else if (this.shiftType === '24/24') {
        if (this.workHours >= NORMAL_WORK_HOURS) {
          this.extraHours = parseFloat((this.workHours - NORMAL_WORK_HOURS).toFixed(2));
          this.extraHoursCompensation = this.extraHours * hourlyRate;
          this.hoursDeduction = 0;
          this.calculatedWorkDays = 1;
        } else {
          this.extraHours = 0;
          this.extraHoursCompensation = 0;
          this.hoursDeduction = parseFloat((NORMAL_WORK_HOURS - this.workHours).toFixed(2));
          this.calculatedWorkDays = 1;
        }
        this.fridayBonus = 0; // لا يوجد بدل جمعة لشيفت 24/24
      } else if (['dayStation', 'nightStation'].includes(this.shiftType)) {
        if (isFriday && this.workedFriday) {
          if (this.workHours >= NORMAL_WORK_HOURS) {
            this.extraHours = parseFloat((this.workHours - NORMAL_WORK_HOURS).toFixed(2));
            this.extraHoursCompensation = this.extraHours * (hourlyRate * 2); // معدل مضاعف ليوم الجمعة
            this.hoursDeduction = 0;
            this.calculatedWorkDays = 1;
            this.fridayBonus = dailySalary;
          } else {
            this.extraHours = 0;
            this.extraHoursCompensation = 0;
            this.hoursDeduction = parseFloat((NORMAL_WORK_HOURS - this.workHours).toFixed(2));
            this.calculatedWorkDays = 1;
            this.fridayBonus = 0;
          }
        } else if (this.workHours >= NORMAL_WORK_HOURS) {
          this.extraHours = parseFloat((this.workHours - NORMAL_WORK_HOURS).toFixed(2));
          this.extraHoursCompensation = this.extraHours * hourlyRate;
          this.hoursDeduction = 0;
          this.calculatedWorkDays = 1;
          this.fridayBonus = 0;
        } else {
          this.extraHours = 0;
          this.extraHoursCompensation = 0;
          this.hoursDeduction = parseFloat((NORMAL_WORK_HOURS - this.workHours).toFixed(2));
          this.calculatedWorkDays = 1;
          this.fridayBonus = 0;
        }
      }
    } else if (this.status === 'present' && (this.checkIn || this.checkOut)) {
      this.workHours = NORMAL_WORK_HOURS;
      this.extraHours = 0;
      this.extraHoursCompensation = 0;
      this.hoursDeduction = 0;
      this.calculatedWorkDays = 1;
      if (isFriday && this.workedFriday && ['dayStation', 'nightStation'].includes(this.shiftType)) {
        this.fridayBonus = dailySalary;
      } else {
        this.fridayBonus = 0;
      }
    } else {
      this.workHours = 0;
      this.extraHours = 0;
      this.extraHoursCompensation = 0;
      this.hoursDeduction = 0;
      this.calculatedWorkDays = 0;
      this.fridayBonus = 0;
    }

    // تحديث totalExtraHours تراكميًا
    const startOfMonth = new Date(this.date.getFullYear(), this.date.getMonth(), 1);
    const previousRecords = await this.constructor
      .find({
        employeeCode: this.employeeCode,
        date: { $gte: startOfMonth, $lt: this.date },
      })
      .sort({ date: 1 })
      .lean();

    let cumulativeExtraHours = 0;
    for (const record of previousRecords) {
      if (
        (record.shiftType === '24/24' && record.status === 'present') ||
        (['dayStation', 'nightStation'].includes(record.shiftType) && record.status === 'present' && record.workedFriday)
      ) {
        cumulativeExtraHours += parseFloat(record.extraHours || 0);
      }
    }
    if (
      (this.shiftType === '24/24' && this.status === 'present') ||
      (['dayStation', 'nightStation'].includes(this.shiftType) && this.status === 'present' && this.workedFriday)
    ) {
      cumulativeExtraHours += parseFloat(this.extraHours || 0);
    }

    this.totalExtraHours = parseFloat(cumulativeExtraHours.toFixed(2));

    logger.info(
      `Updated for save: employeeCode=${this.employeeCode}, date=${this.date.toISOString().split('T')[0]}, ` +
      `workHours=${this.workHours}, extraHours=${this.extraHours}, extraHoursCompensation=${this.extraHoursCompensation}, ` +
      `hoursDeduction=${this.hoursDeduction}, calculatedWorkDays=${this.calculatedWorkDays}, ` +
      `fridayBonus=${this.fridayBonus}, totalExtraHours=${this.totalExtraHours}`
    );
    next();
  } catch (err) {
    logger.error('Error in pre-save hook:', { employeeCode: this.employeeCode, date: this.date.toISOString(), error: err.message });
    next(err);
  }
});

attendanceSchema.pre('findOneAndUpdate', async function (next) {
  try {
    const update = this.getUpdate();
    const NORMAL_WORK_HOURS = 9;
    const doc = await this.model.findOne(this.getQuery());
    const isFriday = doc.date.getDay() === 5;

    // جلب بيانات المستخدم للحصول على baseSalary
    const user = await mongoose.model('User').findOne({ code: doc.employeeCode }).lean();
    if (!user) {
      logger.error(`User not found for employeeCode: ${doc.employeeCode}`);
      return next(new Error('المستخدم غير موجود'));
    }

    const dailySalary = parseFloat(user.baseSalary || 0) / 30;
    const hourlyRate = dailySalary / 9;

    if (update.status === 'present' && update.checkIn && update.checkOut) {
      const checkInDate = new Date(doc.date);
      checkInDate.setHours(parseInt(update.checkIn.split(':')[0]), parseInt(update.checkIn.split(':')[1]));
      let checkOutDate = new Date(doc.date);
      checkOutDate.setHours(parseInt(update.checkOut.split(':')[0]), parseInt(update.checkOut.split(':')[1]));

      if (doc.shiftType === '24/24' && checkOutDate <= checkInDate) {
        checkOutDate.setDate(checkOutDate.getDate() + 1);
      } else if (checkOutDate <= checkInDate) {
        checkOutDate.setDate(checkOutDate.getDate() + 1);
      }

      const hoursWorked = (checkOutDate - checkInDate) / (1000 * 60 * 60);
      update.workHours = parseFloat(hoursWorked.toFixed(2));

      if (doc.shiftType === 'administrative') {
        const checkOutTime = parseInt(update.checkOut.split(':')[0]) * 60 + parseInt(update.checkOut.split(':')[1]);
        const thresholdTime = 17 * 60 + 30; // 17:30
        if (checkOutTime > thresholdTime) {
          update.extraHours = parseFloat(((checkOutTime - thresholdTime) / 60).toFixed(2));
          update.extraHoursCompensation = update.extraHours * hourlyRate;
          update.hoursDeduction = 0;
          update.calculatedWorkDays = 1;
        } else {
          update.extraHours = 0;
          update.extraHoursCompensation = 0;
          update.hoursDeduction = 0;
          update.calculatedWorkDays = 1;
        }
        update.fridayBonus = 0;
      } else if (doc.shiftType === '24/24') {
        if (update.workHours >= NORMAL_WORK_HOURS) {
          update.extraHours = parseFloat((update.workHours - NORMAL_WORK_HOURS).toFixed(2));
          update.extraHoursCompensation = update.extraHours * hourlyRate;
          update.hoursDeduction = 0;
          update.calculatedWorkDays = 1;
        } else {
          update.extraHours = 0;
          update.extraHoursCompensation = 0;
          update.hoursDeduction = parseFloat((NORMAL_WORK_HOURS - update.workHours).toFixed(2));
          update.calculatedWorkDays = 1;
        }
        update.fridayBonus = 0;
      } else if (['dayStation', 'nightStation'].includes(doc.shiftType)) {
        const workedFriday = update.workedFriday !== undefined ? update.workedFriday : doc.workedFriday;
        if (isFriday && workedFriday) {
          if (update.workHours >= NORMAL_WORK_HOURS) {
            update.extraHours = parseFloat((update.workHours - NORMAL_WORK_HOURS).toFixed(2));
            update.extraHoursCompensation = update.extraHours * (hourlyRate * 2);
            update.hoursDeduction = 0;
            update.calculatedWorkDays = 1;
            update.fridayBonus = dailySalary;
          } else {
            update.extraHours = 0;
            update.extraHoursCompensation = 0;
            update.hoursDeduction = parseFloat((NORMAL_WORK_HOURS - update.workHours).toFixed(2));
            update.calculatedWorkDays = 1;
            update.fridayBonus = 0;
          }
        } else if (update.workHours >= NORMAL_WORK_HOURS) {
          update.extraHours = parseFloat((update.workHours - NORMAL_WORK_HOURS).toFixed(2));
          update.extraHoursCompensation = update.extraHours * hourlyRate;
          update.hoursDeduction = 0;
          update.calculatedWorkDays = 1;
          update.fridayBonus = 0;
        } else {
          update.extraHours = 0;
          update.extraHoursCompensation = 0;
          update.hoursDeduction = parseFloat((NORMAL_WORK_HOURS - update.workHours).toFixed(2));
          update.calculatedWorkDays = 1;
          update.fridayBonus = 0;
        }
      }
    } else if (update.status === 'present' && (update.checkIn || update.checkOut)) {
      update.workHours = NORMAL_WORK_HOURS;
      update.extraHours = 0;
      update.extraHoursCompensation = 0;
      update.hoursDeduction = 0;
      update.calculatedWorkDays = 1;
      const workedFriday = update.workedFriday !== undefined ? update.workedFriday : doc.workedFriday;
      if (isFriday && workedFriday && ['dayStation', 'nightStation'].includes(doc.shiftType)) {
        update.fridayBonus = dailySalary;
      } else {
        update.fridayBonus = 0;
      }
    } else {
      update.workHours = 0;
      update.extraHours = 0;
      update.extraHoursCompensation = 0;
      update.hoursDeduction = 0;
      update.calculatedWorkDays = 0;
      update.fridayBonus = 0;
    }

    // تحديث totalExtraHours تراكميًا
    const startOfMonth = new Date(doc.date.getFullYear(), doc.date.getMonth(), 1);
    const previousRecords = await this.model
      .find({
        employeeCode: doc.employeeCode,
        date: { $gte: startOfMonth, $lt: doc.date },
      })
      .sort({ date: 1 })
      .lean();

    let cumulativeExtraHours = 0;
    for (const record of previousRecords) {
      if (
        (record.shiftType === '24/24' && record.status === 'present') ||
        (['dayStation', 'nightStation'].includes(record.shiftType) && record.status === 'present' && record.workedFriday)
      ) {
        cumulativeExtraHours += parseFloat(record.extraHours || 0);
      }
    }
    if (
      (doc.shiftType === '24/24' && update.status === 'present') ||
      (['dayStation', 'nightStation'].includes(doc.shiftType) && update.status === 'present' && (update.workedFriday !== undefined ? update.workedFriday : doc.workedFriday))
    ) {
      cumulativeExtraHours += parseFloat(update.extraHours || 0);
    }

    update.totalExtraHours = parseFloat(cumulativeExtraHours.toFixed(2));

    logger.info(
      `Calculated for update: employeeCode=${doc.employeeCode}, date=${doc.date.toISOString().split('T')[0]}, ` +
      `workHours=${update.workHours}, extraHours=${update.extraHours}, extraHoursCompensation=${update.extraHoursCompensation}, ` +
      `hoursDeduction=${update.hoursDeduction}, calculatedWorkDays=${update.calculatedWorkDays}, ` +
      `fridayBonus=${update.fridayBonus}, totalExtraHours=${update.totalExtraHours}`
    );
    next();
  } catch (err) {
    logger.error('Error in pre-findOneAndUpdate hook:', { error: err.message });
    next(err);
  }
});

module.exports = mongoose.model('Attendance', attendanceSchema);
