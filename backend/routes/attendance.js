const express = require('express');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const mongoose = require('mongoose');
const XLSX = require('xlsx');
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const auth = require('../middleware/auth');
const router = express.Router();

const upload = multer({ dest: 'uploads/' });
const NORMAL_WORK_HOURS = 9; // تحديد الدوام الطبيعي 9 ساعات

// دالة لتنظيف قيم checkIn و checkOut
function cleanRecord(record) {
  return {
    ...record,
    checkIn: record.checkIn === '-' || !record.checkIn?.trim() ? null : record.checkIn,
    checkOut: record.checkOut === '-' || !record.checkOut?.trim() ? null : record.checkOut,
  };
}

// دالة لتحويل workingDays للعرض
function formatWorkingDays(workingDays) {
  return workingDays === '5' ? '5 أيام' : workingDays === '6' ? '6 أيام' : workingDays;
}

// دالة لإزالة السجلات المكررة
async function removeDuplicates(employeeCode, date) {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const duplicates = await Attendance.find({
    employeeCode,
    date: { $gte: startOfDay, $lte: endOfDay },
  });

  if (duplicates.length > 1) {
    const idsToRemove = duplicates.slice(1).map(record => record._id);
    await Attendance.deleteMany({ _id: { $in: idsToRemove } });
    console.log(`Deleted ${idsToRemove.length} duplicate records for ${employeeCode} on ${startOfDay.toISOString().split('T')[0]}`);
  }
}

// دالة لحساب الحالة بناءً على التاريخ وأيام العمل ونوع الدوام
function calculateStatus(date, workingDays, shiftType) {
  const daysOfWeek = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  const day = daysOfWeek[date.getDay()];

  let workDaysArray;
  if (shiftType === '24/24') {
    workDaysArray = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'السبت'];
  } else if (shiftType === 'dayStation' || shiftType === 'nightStation') {
    workDaysArray = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'السبت'];
  } else {
    workDaysArray = workingDays === '5'
      ? ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس']
      : ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];
  }

  const status = workDaysArray.includes(day) ? 'absent' : 'weekly_off';
  console.log(`Calculated status for ${date.toISOString().split('T')[0]}: ${status}`);
  return status;
}

// دالة لحساب دقائق التأخير (معدلة للشيفت الإداري)
function calculateLateMinutes(user, checkIn) {
  if (!checkIn || user.shiftType !== 'administrative') return 0;

  const [checkInHours, checkInMinutes] = checkIn.split(':').map(Number);
  const checkInTime = checkInHours * 60 + checkInMinutes;
  const shiftStart = 8 * 60 + 30; // 08:30
  const allowanceEnd = 9 * 60 + 15; // 09:15

  if (checkInTime <= allowanceEnd) {
    return 0;
  }

  const lateMinutes = checkInTime - shiftStart;
  console.log(`Calculated late minutes: ${lateMinutes} for checkIn: ${checkIn}, shiftStart: ${shiftStart}, allowanceEnd: ${allowanceEnd}`);
  return lateMinutes;
}

// دالة لحساب الأيام المستقطعة (معدلة لتجنب خصم يوم كامل عند بصمة واحدة)
function calculateDeductedDays(excessLateMinutes, checkIn) {
  if (!checkIn) return 0; // لا خصم إذا كانت هناك بصمة واحدة
  if (excessLateMinutes === 0) return 0;

  const [checkInHours, checkInMinutes] = checkIn.split(':').map(Number);
  const checkInTime = checkInHours * 60 + checkInMinutes;

  let deductedDays = 0;
  if (checkInTime >= 9 * 60 + 16 && checkInTime <= 11 * 60) {
    deductedDays = 0.25; // من 09:16 إلى 11:00: ربع يوم
  } else if (checkInTime >= 11 * 60 + 1 && checkInTime <= 16 * 60) {
    deductedDays = 0.5; // من 11:01 إلى 16:00: نصف يوم
  } else if (checkInTime >= 16 * 60 + 1 && checkInTime <= 17 * 60 + 20) {
    deductedDays = 0.25; // من 16:01 إلى 17:20: ربع يوم
  } else if (checkInTime > 17 * 60 + 20) {
    deductedDays = 1; // بعد 17:20: يوم كامل
  }
  console.log(`Calculated deducted days: ${deductedDays} for excessLateMinutes: ${excessLateMinutes}, checkIn: ${checkIn}`);
  return deductedDays;
}

// دالة لحساب ساعات العمل والساعات الإضافية (معدلة لتسجيل 9 ساعات عند بصمة واحدة)
function calculateWorkHours(record, user, dailyRate, regularHourRate) {
  let workHours = 0;
  let extraHours = 0;
  let extraHoursCompensation = 0;
  let hoursDeduction = 0;
  let calculatedWorkDays = (record.checkIn || record.checkOut) ? 1 : 0;
  let fridayBonus = 0;

  if (record.checkIn || record.checkOut) {
    // إذا كانت هناك بصمة واحدة أو اثنتين
    if (user.shiftType === 'administrative') {
      workHours = NORMAL_WORK_HOURS; // 9 ساعات للشيفت الإداري
      extraHours = 0;
      extraHoursCompensation = 0;
      hoursDeduction = 0;
      calculatedWorkDays = 1;
    } else if (record.checkIn && record.checkOut && record.status === 'present') {
      const checkInDate = new Date(record.date);
      checkInDate.setHours(parseInt(record.checkIn.split(':')[0]), parseInt(record.checkIn.split(':')[1]));
      let checkOutDate = new Date(record.date);
      checkOutDate.setHours(parseInt(record.checkOut.split(':')[0]), parseInt(record.checkOut.split(':')[1]));

      if (checkOutDate < checkInDate) {
        checkOutDate.setDate(checkOutDate.getDate() + 1);
      }

      workHours = (checkOutDate - checkInDate) / (1000 * 60 * 60);
      workHours = Math.max(0, workHours);

      if (user.shiftType === '24/24') {
        if (workHours >= NORMAL_WORK_HOURS) {
          extraHours = workHours - NORMAL_WORK_HOURS;
          extraHoursCompensation = extraHours * regularHourRate;
          calculatedWorkDays = 1;
          hoursDeduction = 0;
        } else {
          extraHours = 0;
          extraHoursCompensation = 0;
          calculatedWorkDays = 1;
          hoursDeduction = NORMAL_WORK_HOURS - workHours;
        }
      } else if (user.shiftType === 'dayStation' || user.shiftType === 'nightStation') {
        const isFriday = record.date.getDay() === 5;
        const extraHourRate = isFriday ? regularHourRate * 2 : regularHourRate;
        if (isFriday) {
          workHours *= 2;
          extraHours = workHours / 2;
          extraHoursCompensation = extraHours * extraHourRate;
          calculatedWorkDays = 2;
          hoursDeduction = 0;
          if (record.checkIn) {
            fridayBonus = dailyRate;
          }
        } else if (workHours < NORMAL_WORK_HOURS) {
          hoursDeduction = NORMAL_WORK_HOURS - workHours;
          extraHours = 0;
          extraHoursCompensation = 0;
          calculatedWorkDays = 1;
        } else if (workHours > NORMAL_WORK_HOURS) {
          extraHours = workHours - NORMAL_WORK_HOURS;
          extraHoursCompensation = extraHours * extraHourRate;
          calculatedWorkDays = 1;
          hoursDeduction = 0;
        } else {
          extraHours = 0;
          extraHoursCompensation = 0;
          calculatedWorkDays = 1;
          hoursDeduction = 0;
        }
      }
    } else {
      // حالة البصمة الواحدة (checkIn أو checkOut فقط)
      workHours = NORMAL_WORK_HOURS; // 9 ساعات
      extraHours = 0;
      extraHoursCompensation = 0;
      hoursDeduction = 0;
      calculatedWorkDays = 1;
      if ((user.shiftType === 'dayStation' || user.shiftType === 'nightStation') && record.date.getDay() === 5 && record.checkIn) {
        fridayBonus = dailyRate;
      }
    }
  }

  return { workHours, extraHours, extraHoursCompensation, hoursDeduction, calculatedWorkDays, fridayBonus };
}

// دالة موحدة لتحديث جميع سجلات الموظف
async function updateAllRecords(employeeCode, user, req) {
  const records = await Attendance.find({ employeeCode }).sort({ date: 1 });
  let monthlyLateAllowance = user.monthlyLateAllowance || 120;
  let totalExtraHours = 0;
  const monthlySalary = user.baseSalary || 5000;
  const dailyRate = monthlySalary / 30;
  const regularHourRate = dailyRate / NORMAL_WORK_HOURS;

  const annualLeaveBalance = user.annualLeaveBalance !== undefined ? Math.max(user.annualLeaveBalance, 0) : 0;
  console.log(`Updating all records for employee ${employeeCode} with monthlyLateAllowance = ${monthlyLateAllowance}`);

  for (const record of records) {
    await removeDuplicates(employeeCode, record.date);

    if (record.status === 'leave' || record.status === 'official_leave' || record.status === 'medical_leave') {
      record.checkIn = null;
      record.checkOut = null;
      record.lateMinutes = 0;
      record.deductedDays = 0;
      record.calculatedWorkDays = 0;
      record.extraHours = 0;
      record.extraHoursCompensation = 0;
      record.workHours = 0;
      record.hoursDeduction = 0;
      record.fridayBonus = 0;
      record.leaveCompensation = record.status === 'leave' && record.leaveCompensation ? record.leaveCompensation : 0;
      record.medicalLeaveDeduction = record.status === 'medical_leave' ? (dailyRate * 0.25) : 0;
    } else {
      record.lateMinutes = user.shiftType === 'administrative' ? calculateLateMinutes(user, record.checkIn) : 0;
      if (record.lateMinutes > 0) {
        if (monthlyLateAllowance >= record.lateMinutes) {
          monthlyLateAllowance -= record.lateMinutes;
          record.deductedDays = 0;
        } else {
          const excessLateMinutes = record.lateMinutes - monthlyLateAllowance;
          monthlyLateAllowance = 0;
          record.deductedDays = calculateDeductedDays(excessLateMinutes, record.checkIn);
        }
      } else {
        record.deductedDays = 0;
      }

      const hoursData = calculateWorkHours(record, user, dailyRate, regularHourRate);
      record.workHours = hoursData.workHours;
      record.extraHours = hoursData.extraHours;
      record.extraHoursCompensation = hoursData.extraHoursCompensation;
      record.hoursDeduction = hoursData.hoursDeduction;
      record.calculatedWorkDays = hoursData.calculatedWorkDays;
      record.fridayBonus = hoursData.fridayBonus;
      totalExtraHours += hoursData.extraHours;
      record.totalExtraHours = totalExtraHours;
      record.status = record.checkIn || record.checkOut ? 'present' : calculateStatus(record.date, user.workingDays, user.shiftType);
    }

    record.monthlyLateAllowance = monthlyLateAllowance;
    record.annualLeaveBalance = annualLeaveBalance;
    record.employeeName = user.employeeName;
    record.workingDays = user.workingDays;
    await record.save();
  }

  await User.updateOne(
    { code: employeeCode },
    { $set: { monthlyLateAllowance } }
  );
  console.log(`Updated User monthlyLateAllowance for ${employeeCode} to ${monthlyLateAllowance}`);
}

// POST /api/attendance/upload
router.post('/upload', auth, upload.single('file'), async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'غير مصرح لك برفع البصمات' });
  }

  if (!req.file) {
    return res.status(400).json({ message: 'لم يتم رفع أي ملف' });
  }

  const results = [];
  try {
    console.log('Starting file parsing...');
    const filePath = req.file.path;
    const fileExt = req.file.originalname.split('.').pop().toLowerCase();

    if (fileExt === 'csv') {
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (row) => {
          console.log('Row received:', row);
          if (row['No.'] && row['Date/Time']) {
            const dateTime = new Date(row['Date/Time']);
            if (!isNaN(dateTime)) {
              results.push({
                employeeCode: row['No.'].toString(),
                dateTime,
              });
            } else {
              console.log(`Invalid Date/Time format for row: ${JSON.stringify(row)}`);
            }
          } else {
            console.log(`Missing No. or Date/Time in row: ${JSON.stringify(row)}`);
          }
        })
        .on('end', async () => {
          await processAttendance(results, req, res);
        });
    } else if (fileExt === 'xlsx') {
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet);
      console.log('XLSX rows:', rows);

      for (const row of rows) {
        if (row['No.'] && row['Date/Time']) {
          const dateTime = new Date(row['Date/Time']);
          if (!isNaN(dateTime)) {
            results.push({
              employeeCode: row['No.'].toString(),
              dateTime,
            });
          } else {
            console.log(`Invalid Date/Time format for row: ${JSON.stringify(row)}`);
          }
        } else {
          console.log(`Missing No. or Date/Time in row: ${JSON.stringify(row)}`);
        }
      }
      await processAttendance(results, req, res);
    } else {
      throw new Error('نوع الملف غير مدعوم. استخدم .csv أو .xlsx');
    }
  } catch (err) {
    console.error(`Error during upload: ${err.message}`);
    res.status(400).json({ message: `خطأ أثناء رفع البصمات: ${err.message}` });
  } finally {
    if (req.file && req.file.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (err) {
        console.error(`Error deleting file: ${err.message}`);
      }
    }
  }
});

// معالجة بيانات الحضور
async function processAttendance(results, req, res) {
  console.log(`Parsed ${results.length} valid entries`);
  const groupedByCode = {};

  const cleanedResults = results.map(cleanRecord);
  for (const entry of cleanedResults) {
    const employeeCode = entry.employeeCode;
    if (!groupedByCode[employeeCode]) {
      groupedByCode[employeeCode] = [];
    }
    groupedByCode[employeeCode].push(entry);
  }

  for (const employeeCode in groupedByCode) {
    const user = await User.findOne({ code: employeeCode });
    if (!user) {
      console.log(`No user found for employeeCode: ${employeeCode}`);
      continue;
    }

    const entries = groupedByCode[employeeCode].sort((a, b) => a.dateTime - b.dateTime);
    const monthlySalary = user.baseSalary || 5000;
    const dailyRate = monthlySalary / 30;
    const regularHourRate = dailyRate / NORMAL_WORK_HOURS;

    const filteredEntries = [];
    for (let i = 0; i < entries.length; i++) {
      if (i === 0) {
        filteredEntries.push(entries[i]);
      } else {
        const prevTime = entries[i - 1].dateTime;
        const currentTime = entries[i].dateTime;
        const timeDiffMinutes = (currentTime - prevTime) / (1000 * 60);
        if (timeDiffMinutes > 30) {
          filteredEntries.push(entries[i]);
        } else {
          console.log(`Ignored entry for ${employeeCode} at ${currentTime} (within 30 minutes of ${prevTime})`);
        }
      }
    }

    if (user.shiftType === '24/24') {
      const records = [];
      let lastCheckIn = null;
      let lastCheckInDate = null;
      let totalExtraHours = 0;

      for (let i = 0; i < filteredEntries.length; i++) {
        const entry = filteredEntries[i];
        const date = new Date(entry.dateTime);
        date.setHours(0, 0, 0, 0);
        const time = entry.dateTime.toTimeString().slice(0, 5);

        await removeDuplicates(employeeCode, date);

        if (date.getDay() === 5) {
          const existingRecord = await Attendance.findOne({ employeeCode, date });
          if (!existingRecord) {
            const newRecord = new Attendance({
              employeeCode,
              employeeName: user.employeeName,
              date,
              checkIn: null,
              checkOut: null,
              shiftType: user.shiftType,
              workingDays: user.workingDays,
              lateMinutes: 0,
              deductedDays: 0,
              calculatedWorkDays: 0,
              extraHours: 0,
              extraHoursCompensation: 0,
              workHours: 0,
              hoursDeduction: 0,
              fridayBonus: 0,
              annualLeaveBalance: user.annualLeaveBalance || 21,
              monthlyLateAllowance: user.monthlyLateAllowance || 120,
              status: 'weekly_off',
              createdBy: req.user.id,
              leaveCompensation: 0,
              medicalLeaveDeduction: 0,
              totalExtraHours,
            });
            await newRecord.save();
            console.log(`Created weekly off record for ${employeeCode} on ${date.toISOString()}`);
          }
          continue;
        }

        if (!lastCheckIn) {
          lastCheckIn = new Date(entry.dateTime);
          lastCheckInDate = new Date(date);
          records.push({
            employeeCode,
            date: lastCheckInDate,
            checkIn: time,
            checkOut: null,
            calculatedWorkDays: 1,
            extraHours: 0,
            extraHoursCompensation: 0,
            workHours: NORMAL_WORK_HOURS,
            hoursDeduction: 0,
            fridayBonus: 0,
            status: 'present',
            totalExtraHours,
          });
        } else {
          const checkOutDate = new Date(date);
          const prevRecord = records[records.length - 1];
          let checkOutTime = new Date(entry.dateTime);

          if (checkOutTime < lastCheckIn || checkOutTime.getDate() !== lastCheckIn.getDate()) {
            checkOutTime.setDate(lastCheckInDate.getDate() + 1);
            console.log(`Adjusted checkOutTime to next day: ${checkOutTime.toISOString()}`);
          }

          if (prevRecord.checkOut === null) {
            prevRecord.checkOut = checkOutTime.toTimeString().slice(0, 5);
            const hoursData = calculateWorkHours(prevRecord, user, dailyRate, regularHourRate);
            prevRecord.workHours = hoursData.workHours;
            prevRecord.extraHours = hoursData.extraHours;
            prevRecord.extraHoursCompensation = hoursData.extraHoursCompensation;
            prevRecord.hoursDeduction = hoursData.hoursDeduction;
            prevRecord.calculatedWorkDays = hoursData.calculatedWorkDays;
            prevRecord.fridayBonus = hoursData.fridayBonus;
            totalExtraHours += hoursData.extraHours;
            prevRecord.totalExtraHours = totalExtraHours;
            console.log(`Processed record for ${employeeCode} on ${prevRecord.date.toISOString()}: workHours=${hoursData.workHours}, extraHours=${hoursData.extraHours}`);
            lastCheckIn = null;
          } else {
            records.push({
              employeeCode,
              date: checkOutDate,
              checkIn: time,
              checkOut: null,
              calculatedWorkDays: 1,
              extraHours: 0,
              extraHoursCompensation: 0,
              workHours: NORMAL_WORK_HOURS,
              hoursDeduction: 0,
              fridayBonus: 0,
              status: 'present',
              totalExtraHours,
            });
            lastCheckIn = new Date(entry.dateTime);
            lastCheckInDate = checkOutDate;
          }
        }
      }

      for (const record of records) {
        const existingRecord = await Attendance.findOne({ employeeCode, date: record.date });
        const status = record.checkIn || record.checkOut ? 'present' : calculateStatus(record.date, user.workingDays, user.shiftType);

        if (existingRecord) {
          console.log(`Updating record for ${employeeCode} on ${record.date.toISOString()}`);
          existingRecord.checkIn = record.checkIn || existingRecord.checkIn;
          existingRecord.checkOut = record.checkOut || existingRecord.checkOut;
          existingRecord.status = status;
          existingRecord.lateMinutes = 0;
          existingRecord.deductedDays = 0;
          existingRecord.calculatedWorkDays = record.calculatedWorkDays;
          existingRecord.extraHours = record.extraHours;
          existingRecord.extraHoursCompensation = record.extraHoursCompensation;
          existingRecord.workHours = record.workHours;
          existingRecord.hoursDeduction = record.hoursDeduction;
          existingRecord.fridayBonus = record.fridayBonus;
          existingRecord.employeeName = user.employeeName;
          existingRecord.shiftType = user.shiftType;
          existingRecord.workingDays = user.workingDays;
          existingRecord.totalExtraHours = record.totalExtraHours;
          await existingRecord.save();
          console.log(`Updated record: ${JSON.stringify(existingRecord, null, 2)}`);
        } else {
          const newRecord = new Attendance({
            employeeCode,
            employeeName: user.employeeName,
            date: record.date,
            checkIn: record.checkIn,
            checkOut: record.checkOut,
            shiftType: user.shiftType,
            workingDays: user.workingDays,
            lateMinutes: 0,
            deductedDays: 0,
            calculatedWorkDays: record.calculatedWorkDays,
            extraHours: record.extraHours,
            extraHoursCompensation: record.extraHoursCompensation,
            workHours: record.workHours,
            hoursDeduction: record.hoursDeduction,
            fridayBonus: record.fridayBonus,
            annualLeaveBalance: user.annualLeaveBalance || 21,
            monthlyLateAllowance: user.monthlyLateAllowance || 120,
            status,
            createdBy: req.user.id,
            leaveCompensation: 0,
            medicalLeaveDeduction: 0,
            totalExtraHours: record.totalExtraHours,
          });
          await newRecord.save();
          console.log(`Created new record: ${JSON.stringify(newRecord, null, 2)}`);
        }
      }

      await updateAllRecords(employeeCode, user, req);
    } else {
      const groupedByDate = {};
      for (const entry of filteredEntries) {
        const date = new Date(entry.dateTime);
        date.setHours(0, 0, 0, 0);
        const dateKey = date.toISOString();
        const time = entry.dateTime.toTimeString().slice(0, 5);
        const hours = entry.dateTime.getHours();

        if (!groupedByDate[dateKey]) {
          groupedByDate[dateKey] = [];
        }
        groupedByDate[dateKey].push({ time, isCheckIn: user.shiftType === 'dayStation' ? hours < 12 : user.shiftType === 'nightStation' ? hours < 24 : hours < 12 });
      }

      console.log('Grouped entries:', JSON.stringify(groupedByDate, null, 2));

      const sortedDates = Object.keys(groupedByDate).sort();
      for (const dateKey of sortedDates) {
        const times = groupedByDate[dateKey].sort((a, b) => a.time.localeCompare(b.time));
        const date = new Date(dateKey);

        await removeDuplicates(employeeCode, date);

        const existingRecord = await Attendance.findOne({
          employeeCode,
          date,
        });

        let checkIn = null;
        let checkOut = null;
        if (times.length === 1) {
          if (times[0].isCheckIn) {
            checkIn = times[0].time;
          } else {
            checkOut = times[0].time;
          }
        } else if (times.length > 1) {
          checkIn = times[0].time;
          checkOut = times[times.length - 1].time;
        }

        let lateMinutes = 0;
        let deductedDays = 0;
        let hoursDeduction = 0;

        if (user.shiftType === 'administrative' && checkIn) {
          lateMinutes = calculateLateMinutes(user, checkIn);
        }

        let workHours = 0;
        let extraHours = 0;
        let extraHoursCompensation = 0;
        let fridayBonus = 0;
        let calculatedWorkDays = (checkIn || checkOut) ? 1 : 0;

        if (checkIn || checkOut) {
          workHours = NORMAL_WORK_HOURS; // 9 ساعات لأي بصمة
          extraHours = 0;
          extraHoursCompensation = 0;
          hoursDeduction = 0;
          calculatedWorkDays = 1;
          if (checkIn && checkOut) {
            const checkInDate = new Date(date);
            checkInDate.setHours(parseInt(checkIn.split(':')[0]), parseInt(checkIn.split(':')[1]));
            const checkOutDate = new Date(date);
            checkOutDate.setHours(parseInt(checkOut.split(':')[0]), parseInt(checkOut.split(':')[1]));
            if (checkOutDate < checkInDate) {
              checkOutDate.setDate(checkOutDate.getDate() + 1);
            }
            workHours = (checkOutDate - checkInDate) / (1000 * 60 * 60);
            if (user.shiftType === 'dayStation' || user.shiftType === 'nightStation') {
              const isFriday = date.getDay() === 5;
              const extraHourRate = isFriday ? regularHourRate * 2 : regularHourRate;
              if (isFriday) {
                workHours *= 2;
                extraHours = workHours / 2;
                extraHoursCompensation = extraHours * extraHourRate;
                calculatedWorkDays = 2;
                hoursDeduction = 0;
                if (checkIn) {
                  fridayBonus = dailyRate;
                }
              } else if (workHours < NORMAL_WORK_HOURS) {
                hoursDeduction = NORMAL_WORK_HOURS - workHours;
                extraHours = 0;
                extraHoursCompensation = 0;
                calculatedWorkDays = 1;
              } else if (workHours > NORMAL_WORK_HOURS) {
                extraHours = workHours - NORMAL_WORK_HOURS;
                extraHoursCompensation = extraHours * extraHourRate;
                calculatedWorkDays = 1;
                hoursDeduction = 0;
              } else {
                extraHours = 0;
                extraHoursCompensation = 0;
                calculatedWorkDays = 1;
                hoursDeduction = 0;
              }
            }
          } else if ((user.shiftType === 'dayStation' || user.shiftType === 'nightStation') && date.getDay() === 5 && checkIn) {
            fridayBonus = dailyRate;
          }
        }

        const status = (checkIn || checkOut) ? 'present' : calculateStatus(date, user.workingDays, user.shiftType);

        if (existingRecord) {
          console.log(`Updating record for ${employeeCode} on ${dateKey}`);
          existingRecord.checkIn = checkIn || existingRecord.checkIn;
          existingRecord.checkOut = checkOut || existingRecord.checkOut;
          existingRecord.status = status;
          existingRecord.lateMinutes = lateMinutes;
          existingRecord.deductedDays = deductedDays;
          existingRecord.calculatedWorkDays = calculatedWorkDays;
          existingRecord.extraHours = extraHours;
          existingRecord.extraHoursCompensation = extraHoursCompensation;
          existingRecord.workHours = workHours;
          existingRecord.hoursDeduction = hoursDeduction;
          existingRecord.fridayBonus = fridayBonus;
          existingRecord.employeeName = user.employeeName;
          existingRecord.shiftType = user.shiftType;
          existingRecord.workingDays = user.workingDays;
          await existingRecord.save();
          console.log(`Updated record: ${JSON.stringify(existingRecord, null, 2)}`);
        } else {
          const newRecord = new Attendance({
            employeeCode,
            employeeName: user.employeeName,
            date,
            checkIn,
            checkOut,
            shiftType: user.shiftType,
            workingDays: user.workingDays,
            lateMinutes,
            deductedDays,
            calculatedWorkDays,
            extraHours,
            extraHoursCompensation,
            workHours,
            hoursDeduction,
            fridayBonus,
            annualLeaveBalance: user.annualLeaveBalance || 21,
            monthlyLateAllowance: user.monthlyLateAllowance || 120,
            status,
            createdBy: req.user.id,
            leaveCompensation: 0,
            medicalLeaveDeduction: 0,
          });
          await newRecord.save();
          console.log(`Created new record: ${JSON.stringify(newRecord, null, 2)}`);
        }
      }

      await updateAllRecords(employeeCode, user, req);
    }
  }
  res.status(201).json({ message: 'تم رفع البصمات بنجاح' });
}

// GET /api/attendance
router.get('/', auth, async (req, res) => {
  const { employeeCode, startDate, endDate, filterPresent, filterAbsent, filterSingleCheckIn, shiftType } = req.query;
  const query = {};

  if (employeeCode) {
    query.employeeCode = String(employeeCode).trim();
  }
  if (startDate && endDate) {
    query.date = {
      $gte: new Date(startDate),
      $lte: new Date(endDate),
    };
  }
  if (shiftType && shiftType !== 'all') {
    query.shiftType = String(shiftType).trim();
  }

  try {
    let records = await Attendance.find(query).sort({ date: 1 }).lean();
    console.log(`Query sent to MongoDB: ${JSON.stringify(query)}`);
    console.log(`Found ${records.length} records`);

    records = records.map(cleanRecord);

    const users = employeeCode
      ? await User.find({ code: String(employeeCode).trim() })
      : await User.find();
    console.log(`Found ${users.length} users`);

    // تحديث monthlyLateAllowance لكل موظف
    const userMap = users.reduce((map, user) => {
      map[user.code] = user;
      return map;
    }, {});
    for (const employeeCode of [...new Set(records.map(r => r.employeeCode))]) {
      const user = userMap[employeeCode];
      if (!user) continue;

      let monthlyLateAllowance = user.monthlyLateAllowance || 120;
      const employeeRecords = records
        .filter(r => r.employeeCode === employeeCode && r.shiftType === 'administrative')
        .sort((a, b) => new Date(a.date) - new Date(b.date));

      for (let i = 0; i < employeeRecords.length; i++) {
        const record = employeeRecords[i];
        let totalLateMinutes = 0;
        for (let j = 0; j <= i; j++) {
          totalLateMinutes += calculateLateMinutes(user, employeeRecords[j].checkIn);
        }
        record.monthlyLateAllowance = Math.max(0, monthlyLateAllowance - totalLateMinutes);
        record.deductedDays = totalLateMinutes > monthlyLateAllowance
          ? calculateDeductedDays(totalLateMinutes - monthlyLateAllowance, record.checkIn)
          : 0;
        // تحديث السجل في قاعدة البيانات
        await Attendance.updateOne(
          { _id: record._id },
          { $set: { monthlyLateAllowance: record.monthlyLateAllowance, deductedDays: record.deductedDays } }
        );
      }
      // تحديث monthlyLateAllowance في نموذج User
      await User.updateOne(
        { code: employeeCode },
        { $set: { monthlyLateAllowance: employeeRecords.length > 0 ? employeeRecords[employeeRecords.length - 1].monthlyLateAllowance : monthlyLateAllowance } }
      );
    }

    const result = [];
    const daysOfWeek = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);

      let lastMonthlyLateAllowance = {};
      let lastAnnualLeaveBalance = {};
      let lastTotalExtraHours = {};
      for (const user of users) {
        if (shiftType && shiftType !== 'all' && user.shiftType !== String(shiftType).trim()) continue;
        lastMonthlyLateAllowance[user.code] = user.monthlyLateAllowance || 120;
        lastAnnualLeaveBalance[user.code] = user.annualLeaveBalance || 21;
        lastTotalExtraHours[user.code] = 0;
        const lastRecord = await Attendance.findOne({ employeeCode: user.code })
          .sort({ date: -1 })
          .exec();
        if (lastRecord) {
          if (lastRecord.monthlyLateAllowance !== undefined) {
            lastMonthlyLateAllowance[user.code] = lastRecord.monthlyLateAllowance;
          }
          if (lastRecord.annualLeaveBalance !== undefined) {
            lastAnnualLeaveBalance[user.code] = lastRecord.annualLeaveBalance;
          }
          if (lastRecord.totalExtraHours !== undefined) {
            lastTotalExtraHours[user.code] = lastRecord.totalExtraHours;
          }
        }

        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          const record = records.find(
            (r) =>
              r.employeeCode === user.code &&
              r.date.toDateString() === d.toDateString()
          );

          if (record) {
            if (
              (filterPresent === 'true' && record.status !== 'present') ||
              (filterAbsent === 'true' && record.status !== 'absent') ||
              (filterSingleCheckIn === 'true' &&
                !(
                  (record.checkIn && !record.checkOut) ||
                  (!record.checkIn && record.checkOut)
                ))
            ) {
              continue;
            }
            record.workingDays = formatWorkingDays(user.workingDays);
            lastMonthlyLateAllowance[user.code] = record.monthlyLateAllowance || lastMonthlyLateAllowance[user.code];
            lastAnnualLeaveBalance[user.code] = record.annualLeaveBalance || lastAnnualLeaveBalance[user.code];
            lastTotalExtraHours[user.code] = record.totalExtraHours || lastTotalExtraHours[user.code];
            result.push(record);
          } else {
            const status = calculateStatus(d, user.workingDays, user.shiftType);
            if (filterAbsent === 'true' && status !== 'absent') {
              continue;
            }
            if (
              (filterPresent === 'true' && status !== 'present') ||
              (filterSingleCheckIn === 'true')
            ) {
              continue;
            }
            const monthlySalary = user.baseSalary || 5000;
            const dailyRate = monthlySalary / 30;
            result.push({
              _id: new mongoose.Types.ObjectId().toString(),
              employeeCode: user.code,
              employeeName: user.employeeName,
              date: new Date(d),
              checkIn: null,
              checkOut: null,
              shiftType: user.shiftType,
              workingDays: formatWorkingDays(user.workingDays),
              lateMinutes: 0,
              deductedDays: 0,
              calculatedWorkDays: 0,
              extraHours: 0,
              extraHoursCompensation: 0,
              workHours: 0,
              hoursDeduction: 0,
              fridayBonus: 0,
              annualLeaveBalance: lastAnnualLeaveBalance[user.code],
              monthlyLateAllowance: lastMonthlyLateAllowance[user.code],
              status,
              leaveCompensation: 0,
              medicalLeaveDeduction: 0,
              totalExtraHours: lastTotalExtraHours[user.code],
            });
          }
        }
      }
    } else {
      records = records.map(record => ({
        ...record,
        workingDays: formatWorkingDays(users.find(user => user.code === record.employeeCode)?.workingDays || record.workingDays),
      }));
      records = records.filter(record => {
        if (filterPresent === 'true' && record.status !== 'present') return false;
        if (filterAbsent === 'true' && record.status !== 'absent') return false;
        if (
          filterSingleCheckIn === 'true' &&
          !(
            (record.checkIn && !record.checkOut) ||
            (!record.checkIn && record.checkOut)
          )
        ) return false;
        if (shiftType && shiftType !== 'all' && record.shiftType !== String(shiftType).trim()) return false;
        return true;
      });
      result.push(...records);
    }

    const summaries = {};
    result.forEach((record) => {
      if (!summaries[record.employeeCode]) {
        const monthlySalary = users.find(user => user.code === record.employeeCode)?.baseSalary || 5000;
        const dailyRate = monthlySalary / 30;
        const regularHourRate = dailyRate / NORMAL_WORK_HOURS;
        summaries[record.employeeCode] = {
          employeeName: record.employeeName,
          presentDays: 0,
          absentDays: 0,
          weeklyOffDays: 0,
          leaveDays: 0,
          officialLeaveDays: 0,
          medicalLeaveDays: 0,
          totalWorkDays: 0,
          totalExtraHours: 0,
          totalExtraHoursCompensation: 0,
          totalWorkHours: 0,
          totalHoursDeduction: 0,
          totalHoursDeductionCost: 0,
          totalFridayBonus: 0,
          totalLateMinutes: 0,
          totalDeductedDays: 0,
          totalLeaveCompensation: 0,
          totalMedicalLeaveDeduction: 0,
          totalLateDeduction: 0,
          netExtraHoursCompensation: 0,
          dailyRate,
          regularHourRate,
        };
      }
      if (record.status === 'present') {
        summaries[record.employeeCode].presentDays++;
        summaries[record.employeeCode].totalWorkDays += record.calculatedWorkDays || 1;
        summaries[record.employeeCode].totalExtraHours += record.extraHours || 0;
        summaries[record.employeeCode].totalExtraHoursCompensation += record.extraHoursCompensation || 0;
        summaries[record.employeeCode].totalWorkHours += record.workHours || 0;
        summaries[record.employeeCode].totalHoursDeduction += record.hoursDeduction || 0;
        summaries[record.employeeCode].totalHoursDeductionCost += (record.hoursDeduction || 0) * summaries[record.employeeCode].dailyRate / NORMAL_WORK_HOURS;
        summaries[record.employeeCode].totalFridayBonus += record.fridayBonus || 0;
      } else if (record.status === 'absent') {
        summaries[record.employeeCode].absentDays++;
      } else if (record.status === 'weekly_off') {
        summaries[record.employeeCode].weeklyOffDays++;
      } else if (record.status === 'leave') {
        summaries[record.employeeCode].leaveDays++;
      } else if (record.status === 'official_leave') {
        summaries[record.employeeCode].officialLeaveDays++;
      } else if (record.status === 'medical_leave') {
        summaries[record.employeeCode].medicalLeaveDays++;
      }
      summaries[record.employeeCode].totalLateMinutes += record.lateMinutes || 0;
      summaries[record.employeeCode].totalDeductedDays += record.deductedDays || 0;
      summaries[record.employeeCode].totalLeaveCompensation += record.leaveCompensation || 0;
      summaries[record.employeeCode].totalMedicalLeaveDeduction += record.medicalLeaveDeduction || 0;
    });

    for (const employeeCode in summaries) {
      const user = await User.findOne({ code: employeeCode });
      const isFriday = result.some(record => record.employeeCode === employeeCode && record.date.getDay() === 5 && record.status === 'present');
      const extraHourRate = isFriday ? summaries[employeeCode].regularHourRate * 2 : summaries[employeeCode].regularHourRate;
      summaries[employeeCode].totalExtraHoursCompensation = summaries[employeeCode].totalExtraHours * extraHourRate;
      summaries[employeeCode].netExtraHoursCompensation =
        summaries[employeeCode].totalExtraHoursCompensation - summaries[employeeCode].totalLateDeduction;
    }

    console.log(`Returning ${result.length} records and ${Object.keys(summaries).length} summaries`);
    res.json({ records: result, summaries });
  } catch (err) {
    console.error(`Error fetching records: ${err.message}`);
    res.status(500).json({ message: `خطأ في جلب السجلات: ${err.message}` });
  }
});

// PUT /api/attendance/:id
router.put('/:id', auth, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'غير مصرح لك بتعديل البصمات' });
  }

  try {
    const { checkIn, checkOut, status, isAnnualLeave, isLeaveCompensation, isMedicalLeave } = req.body;
    console.log('PUT request body:', req.body);
    console.log('PUT request params:', req.params);

    let record = await Attendance.findById(req.params.id);
    let isNewRecord = false;

    if (!record) {
      const user = await User.findOne({ code: req.body.employeeCode });
      if (!user) {
        return res.status(404).json({ message: 'المستخدم غير موجود' });
      }
      record = new Attendance({
        _id: req.params.id,
        employeeCode: req.body.employeeCode,
        employeeName: user.employeeName,
        date: new Date(req.body.date),
        shiftType: user.shiftType,
        workingDays: user.workingDays,
        createdBy: req.user.id,
      });
      isNewRecord = true;
    }

    await removeDuplicates(record.employeeCode, record.date);

    const user = await User.findOne({ code: record.employeeCode });
    if (!user) {
      return res.status(404).json({ message: 'المستخدم غير موجود' });
    }

    console.log(`Before update: annualLeaveBalance for employee ${record.employeeCode} = ${user.annualLeaveBalance}`);

    const monthlySalary = user.baseSalary || 5000;
    const dailyRate = monthlySalary / 30;
    const regularHourRate = dailyRate / NORMAL_WORK_HOURS;

    const originalStatus = record.status || 'absent';

    record.checkIn = checkIn && checkIn !== '-' ? checkIn.trim() : null;
    record.checkOut = checkOut && checkOut !== '-' ? checkOut.trim() : null;
    record.status = status || (record.checkIn || record.checkOut ? 'present' : calculateStatus(record.date, user.workingDays, user.shiftType));

    if (isAnnualLeave || isMedicalLeave) {
      if (isAnnualLeave && user.annualLeaveBalance <= 0) {
        return res.status(400).json({ message: 'رصيد الإجازة غير كافٍ' });
      }
      record.status = isMedicalLeave ? 'medical_leave' : 'leave';
      record.checkIn = null;
      record.checkOut = null;
      record.lateMinutes = 0;
      record.deductedDays = 0;
      record.calculatedWorkDays = 0;
      record.extraHours = 0;
      record.extraHoursCompensation = 0;
      record.workHours = 0;
      record.hoursDeduction = 0;
      record.fridayBonus = 0;
      record.leaveCompensation = 0;
      record.medicalLeaveDeduction = isMedicalLeave ? dailyRate * 0.25 : 0;
    } else if (isLeaveCompensation) {
      record.status = 'leave';
      record.checkIn = null;
      record.checkOut = null;
      record.lateMinutes = 0;
      record.deductedDays = 0;
      record.calculatedWorkDays = 0;
      record.extraHours = 0;
      record.extraHoursCompensation = 0;
      record.workHours = 0;
      record.hoursDeduction = 0;
      record.fridayBonus = 0;
      record.leaveCompensation = dailyRate * 2;
      record.medicalLeaveDeduction = 0;
    } else {
      const hoursData = calculateWorkHours(record, user, dailyRate, regularHourRate);
      record.lateMinutes = user.shiftType === 'administrative' ? calculateLateMinutes(user, record.checkIn) : 0;
      record.workHours = hoursData.workHours;
      record.extraHours = hoursData.extraHours;
      record.extraHoursCompensation = hoursData.extraHoursCompensation;
      record.hoursDeduction = hoursData.hoursDeduction;
      record.calculatedWorkDays = hoursData.calculatedWorkDays;
      record.fridayBonus = hoursData.fridayBonus;
    }

    record.workingDays = user.workingDays;
    await record.save();

    let leaveAdjustment = 0;
    if ((isAnnualLeave || isMedicalLeave) && originalStatus !== 'leave' && originalStatus !== 'medical_leave') {
      leaveAdjustment = -1;
    } else if (!(isAnnualLeave || isMedicalLeave) && (originalStatus === 'leave' || originalStatus === 'medical_leave')) {
      leaveAdjustment = 1;
    }

    if (leaveAdjustment !== 0) {
      await User.updateOne(
        { code: record.employeeCode },
        { $inc: { annualLeaveBalance: leaveAdjustment } }
      );
      await User.updateOne(
        { code: record.employeeCode },
        { $max: { annualLeaveBalance: 0 } }
      );
    }

    const updatedUser = await User.findOne({ code: record.employeeCode });
    await updateAllRecords(record.employeeCode, updatedUser, req);

    const responseRecord = { ...record.toObject(), workingDays: formatWorkingDays(record.workingDays) };
    console.log(`Updated record: ${JSON.stringify(responseRecord, null, 2)}`);
    res.json({ message: 'تم تعديل السجل بنجاح', record: responseRecord });
  } catch (err) {
    console.error(`Error updating record: ${err.message}`);
    res.status(400).json({ message: `خطأ أثناء التعديل: ${err.message}` });
  }
});

// POST /api/attendance/official_leave
router.post('/official_leave', auth, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'غير مصرح لك بتحديد إجازة رسمية' });
  }

  const { employeeCode, startDate, endDate, applyToAll } = req.body;
  if (!startDate || !endDate || (!employeeCode && !applyToAll)) {
    return res.status(400).json({ message: 'يرجى تقديم كود الموظف أو تحديد تطبيق للجميع مع نطاق التواريخ' });
  }

  try {
    const start = new Date(startDate);
    const end = new Date(endDate);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    const users = applyToAll ? await User.find() : await User.find({ code: employeeCode });
    if (users.length === 0) {
      return res.status(404).json({ message: 'لم يتم العثور على موظفين' });
    }

    for (const user of users) {
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        await removeDuplicates(user.code, d);

        const existingRecord = await Attendance.findOne({
          employeeCode: user.code,
          date: { $gte: d, $lt: new Date(d.getTime() + 24 * 60 * 60 * 1000) },
        });

        if (existingRecord) {
          existingRecord.status = 'official_leave';
          existingRecord.checkIn = null;
          existingRecord.checkOut = null;
          existingRecord.lateMinutes = 0;
          existingRecord.deductedDays = 0;
          existingRecord.calculatedWorkDays = 0;
          existingRecord.extraHours = 0;
          existingRecord.extraHoursCompensation = 0;
          existingRecord.workHours = 0;
          existingRecord.hoursDeduction = 0;
          existingRecord.fridayBonus = 0;
          existingRecord.employeeName = user.employeeName;
          existingRecord.shiftType = user.shiftType;
          existingRecord.workingDays = user.workingDays;
          await existingRecord.save();
          console.log(`Updated official leave for ${user.code} on ${d.toISOString()}`);
        } else {
          const newRecord = new Attendance({
            employeeCode: user.code,
            employeeName: user.employeeName,
            date: new Date(d),
            status: 'official_leave',
            shiftType: user.shiftType,
            workingDays: user.workingDays,
            lateMinutes: 0,
            deductedDays: 0,
            calculatedWorkDays: 0,
            extraHours: 0,
            extraHoursCompensation: 0,
            workHours: 0,
            hoursDeduction: 0,
            fridayBonus: 0,
            annualLeaveBalance: user.annualLeaveBalance || 21,
            monthlyLateAllowance: user.monthlyLateAllowance || 120,
            leaveCompensation: 0,
            medicalLeaveDeduction: 0,
            createdBy: req.user.id,
            totalExtraHours: 0,
          });
          await newRecord.save();
          console.log(`Created official leave for ${user.code} on ${d.toISOString()}`);
        }
      }

      await updateAllRecords(user.code, user, req);
    }

    res.json({ message: 'تم تحديد الإجازة الرسمية بنجاح' });
  } catch (err) {
    console.error(`Error setting official leave: ${err.message}`);
    res.status(400).json({ message: `خطأ أثناء تحديد الإجازة الرسمية: ${err.message}` });
  }
});

// POST /api/attendance/annual_leave
router.post('/annual_leave', auth, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'غير مصرح لك بتحديد إجازة سنوية' });
  }

  const { employeeCode, startDate, endDate, applyToAll, isMedicalLeave } = req.body;
  if (!startDate || !endDate || (!employeeCode && !applyToAll)) {
    return res.status(400).json({ message: 'يرجى تقديم كود الموظف أو تحديد تطبيق للجميع مع نطاق التواريخ' });
  }

  try {
    const start = new Date(startDate);
    const end = new Date(endDate);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    const users = applyToAll ? await User.find() : await User.find({ code: employeeCode });
    if (users.length === 0) {
      return res.status(404).json({ message: 'لم يتم العثور على موظفين' });
    }

    for (const user of users) {
      const daysCount = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
      if (user.annualLeaveBalance < daysCount) {
        return res.status(400).json({ message: `رصيد الإجازة السنوية غير كافٍ للموظف ${user.code}` });
      }

      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        await removeDuplicates(user.code, d);

        const existingRecord = await Attendance.findOne({
          employeeCode: user.code,
          date: { $gte: d, $lt: new Date(d.getTime() + 24 * 60 * 60 * 1000) },
        });

        let status = isMedicalLeave ? 'medical_leave' : 'leave';
        let medicalLeaveDeduction = 0;
        if (isMedicalLeave) {
          const dailySalary = user.baseSalary / 30;
          medicalLeaveDeduction = dailySalary * 0.25;
        }

        if (existingRecord) {
          existingRecord.status = status;
          existingRecord.checkIn = null;
          existingRecord.checkOut = null;
          existingRecord.lateMinutes = 0;
          existingRecord.deductedDays = 0;
          existingRecord.calculatedWorkDays = 0;
          existingRecord.extraHours = 0;
          existingRecord.extraHoursCompensation = 0;
          existingRecord.workHours = 0;
          existingRecord.hoursDeduction = 0;
          existingRecord.fridayBonus = 0;
          existingRecord.employeeName = user.employeeName;
          existingRecord.shiftType = user.shiftType;
          existingRecord.workingDays = user.workingDays;
          existingRecord.leaveCompensation = 0;
          existingRecord.medicalLeaveDeduction = medicalLeaveDeduction;
          await existingRecord.save();
          console.log(`Updated ${status} for ${user.code} on ${d.toISOString()}`);
        } else {
          const newRecord = new Attendance({
            employeeCode: user.code,
            employeeName: user.employeeName,
            date: new Date(d),
            status,
            shiftType: user.shiftType,
            workingDays: user.workingDays,
            lateMinutes: 0,
            deductedDays: 0,
            calculatedWorkDays: 0,
            extraHours: 0,
            extraHoursCompensation: 0,
            workHours: 0,
            hoursDeduction: 0,
            fridayBonus: 0,
            annualLeaveBalance: user.annualLeaveBalance || 21,
            monthlyLateAllowance: user.monthlyLateAllowance || 120,
            leaveCompensation: 0,
            medicalLeaveDeduction,
            createdBy: req.user.id,
            totalExtraHours: 0,
          });
          await newRecord.save();
          console.log(`Created ${status} for ${user.code} on ${d.toISOString()}`);
        }
      }

      await updateAllRecords(user.code, user, req);
    }

    res.json({ message: 'تم تحديد الإجازة السنوية بنجاح' });
  } catch (err) {
    console.error(`Error setting annual leave: ${err.message}`);
    res.status(400).json({ message: `خطأ أثناء تحديد الإجازة السنوية: ${err.message}` });
  }
});

// DELETE /api/attendance
router.delete('/', auth, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'غير مصرح لك بحذف البصمات' });
  }

  try {
    await Attendance.deleteMany({});
    console.log('All attendance records deleted');
    res.json({ message: 'تم حذف جميع البصمات بنجاح' });
  } catch (err) {
    console.error(`Error deleting records: ${err.message}`);
    res.status(500).json({ message: `خطأ أثناء الحذف: ${err.message}` });
  }
});

module.exports = router;
