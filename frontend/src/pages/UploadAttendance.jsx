import React, { useState, useContext, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { AuthContext } from '../components/AuthProvider';
import { Trash2, Edit, Save, X, Calendar, Upload, Search, AlertTriangle } from 'lucide-react';

const UploadAttendance = () => {
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [employeeCode, setEmployeeCode] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [filterPresent, setFilterPresent] = useState(false);
  const [filterAbsent, setFilterAbsent] = useState(false);
  const [filterSingleCheckIn, setFilterSingleCheckIn] = useState(false);
  const [shiftType, setShiftType] = useState('all');
  const [records, setRecords] = useState([]);
  const [summaries, setSummaries] = useState({});
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [editRecord, setEditRecord] = useState(null);
  const [showOfficialLeaveForm, setShowOfficialLeaveForm] = useState(false);
  const [officialLeaveData, setOfficialLeaveData] = useState({
    employeeCode: '',
    startDate: '',
    endDate: '',
    applyToAll: false,
  });
  const [showAnnualLeaveForm, setShowAnnualLeaveForm] = useState(false);
  const [annualLeaveData, setAnnualLeaveData] = useState({
    employeeCode: '',
    startDate: '',
    endDate: '',
    applyToAll: false,
    isMedicalLeave: false,
  });
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (!user || user.role !== 'admin') {
      navigate('/login');
    }
  }, [user, navigate]);

  const calculateExtraHours = (record) => {
    const { checkIn, checkOut, shiftType, workHours, date } = record;
    const isFriday = new Date(date).getDay() === 5;

    if (shiftType === 'administrative' && checkOut) {
      const [hours, minutes] = checkOut.split(':').map(Number);
      const checkOutTime = hours * 60 + minutes;
      const thresholdTime = 17 * 60 + 30; // 17:30 (5:30 PM) in minutes
      if (checkOutTime > thresholdTime) {
        return (checkOutTime - thresholdTime) / 60; // Convert minutes to hours
      }
      return 0;
    }

    if (['dayStation', 'nightStation'].includes(shiftType)) {
      if (isFriday) {
        if (checkIn && checkOut) {
          return workHours * 2;
        } else if (checkIn || checkOut) {
          return 9 * 2;
        }
        return 0;
      } else if (workHours > 9) {
        return workHours - 9;
      }
      return 0;
    }

    if (shiftType === '24/24' && workHours > 9) {
      return workHours - 9;
    }

    return 0;
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      const fileExt = selectedFile.name.split('.').pop().toLowerCase();
      if (fileExt !== 'csv' && fileExt !== 'xlsx') {
        setError('يرجى اختيار ملف بصيغة .csv أو .xlsx');
        setFile(null);
        return;
      }
      setError('');
      setFile(selectedFile);
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file) {
      setError('يرجى اختيار ملف للرفع');
      return;
    }
    setError('');
    setLoading(true);

    const formData = new FormData();
    formData.append('file', file);
    const token = localStorage.getItem('token');

    try {
      await axios.post(
        `${process.env.REACT_APP_API_URL}/api/attendance/upload`,
        formData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'multipart/form-data',
          },
        }
      );
      setSuccessMessage('تم رفع الملف بنجاح');
      setTimeout(() => {
        setSuccessMessage('');
        setFile(null);
        handleSearch();
      }, 1500);
    } catch (err) {
      if (err.response?.status === 401) {
        logout();
        navigate('/login');
      }
      setError(`خطأ أثناء رفع الملف: ${err.response?.data?.message || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    setError('');
    setLoading(true);

    const token = localStorage.getItem('token');
    const params = {
      employeeCode: employeeCode.trim(),
      startDate,
      endDate,
      filterPresent,
      filterAbsent,
      filterSingleCheckIn,
      shiftType: shiftType === 'all' ? undefined : shiftType,
    };

    try {
      const attendanceResponse = await axios.get(`${process.env.REACT_APP_API_URL}/api/attendance`, {
        headers: { Authorization: `Bearer ${token}` },
        params,
      });

      const userResponse = await axios.get(`${process.env.REACT_APP_API_URL}/api/users`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { code: employeeCode.trim() || undefined },
      });

      const userMap = userResponse.data.users.reduce((map, user) => {
        map[user.code] = user.workingDays;
        return map;
      }, {});

      const records = attendanceResponse.data.records.map((record) => {
        const extraHours = calculateExtraHours(record);
        return {
          ...record,
          workHours: record.shiftType === 'administrative' && (record.checkIn || record.checkOut) && !(record.checkIn && record.checkOut) ? 9 : record.workHours,
          extraHours,
          annualLeaveBalance: Math.floor(record.annualLeaveBalance || 0),
          monthlyLateAllowance: record.shiftType === 'administrative' ? record.monthlyLateAllowance : '-',
          workingDays: userMap[record.employeeCode] || record.workingDays || '5',
        };
      });

      const summaries = records.reduce((acc, record) => {
        const code = record.employeeCode;
        if (!acc[code]) {
          acc[code] = {
            employeeName: record.employeeName,
            totalPresentDays: 0,
            totalAbsentDays: 0,
            totalWeeklyOffDays: 0,
            totalLeaveDays: 0,
            totalOfficialLeaveDays: 0,
            totalMedicalLeaveDays: 0,
            totalLateMinutes: 0,
            totalDeductedDays: 0,
            totalLeaveCompensation: 0,
            totalMedicalLeaveDeduction: 0,
            totalCalculatedWorkDays: 0,
            totalWorkHours: 0,
            totalExtraHours: 0,
          };
        }
        if (record.status === 'present') acc[code].totalPresentDays += 1;
        if (record.status === 'absent') acc[code].totalAbsentDays += 1;
        if (record.status === 'weekly_off') acc[code].totalWeeklyOffDays += 1;
        if (record.status === 'leave') acc[code].totalLeaveDays += 1;
        if (record.status === 'official_leave') acc[code].totalOfficialLeaveDays += 1;
        if (record.status === 'medical_leave') acc[code].totalMedicalLeaveDays += 1;
        acc[code].totalLateMinutes += record.shiftType === 'administrative' ? (record.lateMinutes || 0) : 0;
        acc[code].totalDeductedDays += record.deductedDays || 0;
        acc[code].totalLeaveCompensation += record.leaveCompensation || 0;
        acc[code].totalMedicalLeaveDeduction += record.medicalLeaveDeduction || 0;
        acc[code].totalCalculatedWorkDays += record.calculatedWorkDays || 0;
        acc[code].totalWorkHours += record.workHours || 0;
        acc[code].totalExtraHours += record.extraHours || 0;
        return acc;
      }, {});

      Object.keys(summaries).forEach((employeeCode) => {
        if (records.some((record) => record.employeeCode === employeeCode && record.shiftType === 'administrative')) {
          const lastRecord = records
            .filter((record) => record.employeeCode === employeeCode && record.shiftType === 'administrative')
            .sort((a, b) => new Date(b.date) - new Date(a.date))[0];
          if (lastRecord && lastRecord.monthlyLateAllowance < 30) {
            summaries[employeeCode].warning = `تحذير: رصيد السماح بالتأخير منخفض (${lastRecord.monthlyLateAllowance} دقيقة)`;
          }
        }
      });

      setRecords(records);
      setSummaries(summaries);
      if (records.length === 0) {
        setError('لا توجد سجلات مطابقة لمعايير البحث.');
      }
    } catch (err) {
      if (err.response?.status === 401) {
        logout();
        navigate('/login');
      }
      setError(`خطأ أثناء البحث: ${err.response?.data?.message || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleShowAll = async () => {
    setError('');
    setLoading(true);

    const token = localStorage.getItem('token');
    const params = {
      startDate,
      endDate,
      shiftType: shiftType === 'all' ? undefined : shiftType,
    };

    try {
      const attendanceResponse = await axios.get(`${process.env.REACT_APP_API_URL}/api/attendance`, {
        headers: { Authorization: `Bearer ${token}` },
        params,
      });

      const userResponse = await axios.get(`${process.env.REACT_APP_API_URL}/api/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const userMap = userResponse.data.users.reduce((map, user) => {
        map[user.code] = user.workingDays;
        return map;
      }, {});

      const records = attendanceResponse.data.records.map((record) => {
        const extraHours = calculateExtraHours(record);
        return {
          ...record,
          workHours: record.shiftType === 'administrative' && (record.checkIn || record.checkOut) && !(record.checkIn && record.checkOut) ? 9 : record.workHours,
          extraHours,
          annualLeaveBalance: Math.floor(record.annualLeaveBalance || 0),
          monthlyLateAllowance: record.shiftType === 'administrative' ? record.monthlyLateAllowance : '-',
          workingDays: userMap[record.employeeCode] || record.workingDays || '5',
        };
      });

      const summaries = records.reduce((acc, record) => {
        const code = record.employeeCode;
        if (!acc[code]) {
          acc[code] = {
            employeeName: record.employeeName,
            totalPresentDays: 0,
            totalAbsentDays: 0,
            totalWeeklyOffDays: 0,
            totalLeaveDays: 0,
            totalOfficialLeaveDays: 0,
            totalMedicalLeaveDays: 0,
            totalLateMinutes: 0,
            totalDeductedDays: 0,
            totalLeaveCompensation: 0,
            totalMedicalLeaveDeduction: 0,
            totalCalculatedWorkDays: 0,
            totalWorkHours: 0,
            totalExtraHours: 0,
          };
        }
        if (record.status === 'present') acc[code].totalPresentDays += 1;
        if (record.status === 'absent') acc[code].totalAbsentDays += 1;
        if (record.status === 'weekly_off') acc[code].totalWeeklyOffDays += 1;
        if (record.status === 'leave') acc[code].totalLeaveDays += 1;
        if (record.status === 'official_leave') acc[code].totalOfficialLeaveDays += 1;
        if (record.status === 'medical_leave') acc[code].totalMedicalLeaveDays += 1;
        acc[code].totalLateMinutes += record.shiftType === 'administrative' ? (record.lateMinutes || 0) : 0;
        acc[code].totalDeductedDays += record.deductedDays || 0;
        acc[code].totalLeaveCompensation += record.leaveCompensation || 0;
        acc[code].totalMedicalLeaveDeduction += record.medicalLeaveDeduction || 0;
        acc[code].totalCalculatedWorkDays += record.calculatedWorkDays || 0;
        acc[code].totalWorkHours += record.workHours || 0;
        acc[code].totalExtraHours += record.extraHours || 0;
        return acc;
      }, {});

      Object.keys(summaries).forEach((employeeCode) => {
        if (records.some((record) => record.employeeCode === employeeCode && record.shiftType === 'administrative')) {
          const lastRecord = records
            .filter((record) => record.employeeCode === employeeCode && record.shiftType === 'administrative')
            .sort((a, b) => new Date(b.date) - new Date(a.date))[0];
          if (lastRecord && lastRecord.monthlyLateAllowance < 30) {
            summaries[employeeCode].warning = `تحذير: رصيد السماح بالتأخير منخفض (${lastRecord.monthlyLateAllowance} دقيقة)`;
          }
        }
      });

      setRecords(records);
      setSummaries(summaries);
      if (records.length === 0) {
        setError('لا توجد سجلات متاحة.');
      }
    } catch (err) {
      if (err.response?.status === 401) {
        logout();
        navigate('/login');
      }
      setError(`خطأ أثناء عرض جميع السجلات: ${err.response?.data?.message || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAll = async () => {
    setShowDeleteConfirm(true);
  };

  const confirmDeleteAll = async () => {
    setError('');
    setLoading(true);

    const token = localStorage.getItem('token');

    try {
      await axios.delete(`${process.env.REACT_APP_API_URL}/api/attendance`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setRecords([]);
      setSummaries({});
      setSuccessMessage('تم حذف جميع البصمات بنجاح');
      setTimeout(() => {
        setSuccessMessage('');
      }, 1500);
    } catch (err) {
      if (err.response?.status === 401) {
        logout();
        navigate('/login');
      }
      setError(`خطأ أثناء الحذف: ${err.response?.data?.message || err.message}`);
    } finally {
      setLoading(false);
      setShowDeleteConfirm(false);
    }
  };

  const validateTimeFormat = (time) => {
    if (!time) return true;
    const regex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    return regex.test(time);
  };

  const handleEdit = (record) => {
    if (!record._id) {
      setError('خطأ: السجل لا يحتوي على معرف صالح');
      return;
    }
    setEditRecord({
      id: record._id,
      employeeCode: record.employeeCode,
      date: new Date(record.date).toISOString().split('T')[0],
      checkIn: record.checkIn || '',
      checkOut: record.checkOut || '',
      status: record.status,
      isAnnualLeave: record.status === 'leave' && record.leaveCompensation === 0 && record.medicalLeaveDeduction === 0,
      isLeaveCompensation: record.status === 'leave' && record.leaveCompensation > 0,
      isMedicalLeave: record.status === 'medical_leave',
      calculatedWorkDays: record.calculatedWorkDays || 0,
      extraHours: calculateExtraHours(record),
      monthlyLateAllowance: record.shiftType === 'administrative' ? record.monthlyLateAllowance : 0,
      shiftType: record.shiftType,
      workingDays: record.workingDays,
    });
    setShowEditModal(true);
  };

  const handleEditChange = (e) => {
    const { name, value, type, checked } = e.target;
    setEditRecord((prev) => {
      const newRecord = { ...prev, [name]: type === 'checkbox' ? checked : value };
      if (name === 'checkOut' || name === 'checkIn') {
        newRecord.extraHours = calculateExtraHours({ ...newRecord, [name]: value });
      }
      if (name === 'monthlyLateAllowance') {
        const allowance = parseInt(value, 10);
        newRecord.monthlyLateAllowance = isNaN(allowance) || allowance < 0 ? 0 : allowance;
      }
      if (name === 'isAnnualLeave' && checked) {
        newRecord.isLeaveCompensation = false;
        newRecord.isMedicalLeave = false;
        newRecord.status = 'leave';
        newRecord.checkIn = '';
        newRecord.checkOut = '';
        newRecord.calculatedWorkDays = 0;
        newRecord.extraHours = 0;
      } else if (name === 'isLeaveCompensation' && checked) {
        newRecord.isAnnualLeave = false;
        newRecord.isMedicalLeave = false;
        newRecord.status = 'leave';
        newRecord.checkIn = '';
        newRecord.checkOut = '';
        newRecord.calculatedWorkDays = 0;
        newRecord.extraHours = 0;
      } else if (name === 'isMedicalLeave' && checked) {
        newRecord.isAnnualLeave = false;
        newRecord.isLeaveCompensation = false;
        newRecord.status = 'medical_leave';
        newRecord.checkIn = '';
        newRecord.checkOut = '';
        newRecord.calculatedWorkDays = 0;
        newRecord.extraHours = 0;
      } else if (name === 'status' && value !== 'leave' && value !== 'medical_leave') {
        newRecord.isAnnualLeave = false;
        newRecord.isLeaveCompensation = false;
        newRecord.isMedicalLeave = false;
      } else if (
        (name === 'isAnnualLeave' && !checked && !newRecord.isLeaveCompensation && !newRecord.isMedicalLeave) ||
        (name === 'isLeaveCompensation' && !checked && !newRecord.isAnnualLeave && !newRecord.isMedicalLeave) ||
        (name === 'isMedicalLeave' && !checked && !newRecord.isAnnualLeave && !newRecord.isLeaveCompensation)
      ) {
        newRecord.status = 'absent';
        newRecord.checkIn = '';
        newRecord.checkOut = '';
        newRecord.calculatedWorkDays = 0;
        newRecord.extraHours = 0;
      }
      return newRecord;
    });
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (!editRecord.id) {
      setError('خطأ: معرف السجل غير موجود');
      setLoading(false);
      return;
    }

    if (editRecord.checkIn && !validateTimeFormat(editRecord.checkIn)) {
      setError('صيغة وقت الحضور غير صحيحة، استخدم HH:mm (مثال: 08:30)');
      setLoading(false);
      return;
    }

    if (editRecord.checkOut && !validateTimeFormat(editRecord.checkOut)) {
      setError('صيغة وقت الانصراف غير صحيحة، استخدم HH:mm (مثال: 17:00)');
      setLoading(false);
      return;
    }

    if (editRecord.shiftType === 'administrative' && (isNaN(editRecord.monthlyLateAllowance) || editRecord.monthlyLateAllowance < 0)) {
      setError('رصيد السماح بالتأخير يجب أن يكون عددًا صحيحًا إيجابيًا');
      setLoading(false);
      return;
    }

    const token = localStorage.getItem('token');
    const payload = {
      ...editRecord,
      monthlyLateAllowance: editRecord.shiftType === 'administrative' ? editRecord.monthlyLateAllowance : undefined,
    };

    try {
      await axios.put(
        `${process.env.REACT_APP_API_URL}/api/attendance/${editRecord.id}`,
        payload,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      setSuccessMessage('تم تعديل السجل بنجاح');
      setTimeout(() => {
        setSuccessMessage('');
        setEditRecord(null);
        setShowEditModal(false);
        handleSearch();
      }, 1000);
    } catch (err) {
      if (err.response?.status === 401) {
        logout();
        navigate('/login');
      }
      setError(
        err.response?.data?.message.includes('رصيد الإجازة')
          ? 'رصيد الإجازة السنوية غير كافٍ'
          : `خطأ أثناء التعديل: ${err.response?.data?.message || err.message}`
      );
    } finally {
      setLoading(false);
    }
  };

  const handleOfficialLeaveChange = (e) => {
    const { name, value, type, checked } = e.target;
    setOfficialLeaveData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleOfficialLeaveSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const token = localStorage.getItem('token');

    try {
      await axios.post(
        `${process.env.REACT_APP_API_URL}/api/attendance/official_leave`,
        { ...officialLeaveData, employeeCode: officialLeaveData.employeeCode.trim() },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      setSuccessMessage('تم تحديد الإجازة الرسمية بنجاح');
      setTimeout(() => {
        setSuccessMessage('');
        setShowOfficialLeaveForm(false);
        setOfficialLeaveData({ employeeCode: '', startDate: '', endDate: '', applyToAll: false });
        handleSearch();
      }, 1000);
    } catch (err) {
      if (err.response?.status === 401) {
        logout();
        navigate('/login');
      }
      setError(`خطأ أثناء تحديد الإجازة الرسمية: ${err.response?.data?.message || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleAnnualLeaveChange = (e) => {
    const { name, value, type, checked } = e.target;
    setAnnualLeaveData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleAnnualLeaveSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const token = localStorage.getItem('token');

    try {
      await axios.post(
        `${process.env.REACT_APP_API_URL}/api/attendance/annual_leave`,
        { ...annualLeaveData, employeeCode: annualLeaveData.employeeCode.trim() },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      setSuccessMessage('تم تحديد الإجازة السنوية بنجاح');
      setTimeout(() => {
        setSuccessMessage('');
        setShowAnnualLeaveForm(false);
        setAnnualLeaveData({
          employeeCode: '',
          startDate: '',
          endDate: '',
          applyToAll: false,
          isMedicalLeave: false,
        });
        handleSearch();
      }, 1000);
    } catch (err) {
      if (err.response?.status === 401) {
        logout();
        navigate('/login');
      }
      setError(
        err.response?.data?.message.includes('رصيد الإجازة')
          ? 'رصيد الإجازة السنوية غير كافٍ'
          : `خطأ أثناء تحديد الإجازة السنوية: ${err.response?.data?.message || err.message}`
      );
    } finally {
      setLoading(false);
    }
  };

  const formatNumber = (value) => {
    if (typeof value === 'number') {
      return Number.isInteger(value) ? value.toString() : value.toFixed(2);
    }
    return value === '-' ? '-' : '0';
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-50 to-white py-8 px-4 sm:px-6 lg:px-8 font-cairo text-right">
      <link
        href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap"
        rel="stylesheet"
      />
      <AnimatePresence>
        {loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              className="h-12 w-12 border-4 border-t-purple-600 border-purple-200 rounded-full"
            />
          </motion.div>
        )}
        {successMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="fixed top-6 left-6 bg-purple-100 text-purple-800 p-4 rounded-xl shadow-lg z-50 text-sm font-semibold flex items-center"
          >
            <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
            {successMessage}
          </motion.div>
        )}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed top-6 left-6 bg-red-100 text-red-700 p-4 rounded-xl shadow-lg z-50 text-sm font-semibold flex items-center"
          >
            <AlertTriangle className="w-5 h-5 ml-2" />
            {error}
          </motion.div>
        )}
        {showDeleteConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="bg-white p-6 rounded-xl shadow-2xl border border-purple-100 max-w-sm w-full"
            >
              <h3 className="text-lg font-bold text-purple-800 mb-4">تأكيد الحذف</h3>
              <p className="text-sm text-gray-600 mb-6">هل أنت متأكد من حذف جميع بصمات الحضور؟</p>
              <div className="flex justify-end gap-3">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={confirmDeleteAll}
                  className="bg-red-500 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-red-600 flex items-center"
                >
                  <Trash2 className="h-4 w-4 ml-2" />
                  حذف
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setShowDeleteConfirm(false)}
                  className="bg-gray-300 text-gray-800 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-gray-400 flex items-center"
                >
                  <X className="h-4 w-4 ml-2" />
                  إلغاء
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="bg-white p-8 rounded-2xl shadow-2xl border border-purple-100 max-w-7xl mx-auto"
      >
        <h2 className="text-2xl font-bold text-purple-800 mb-6">إدارة بصمات الموظفين</h2>
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row gap-4 items-end">
            <div className="relative w-full sm:w-1/2">
              <input
                type="file"
                accept=".csv,.xlsx"
                onChange={handleFileChange}
                className="w-full px-4 py-2 border border-purple-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-400 focus:border-purple-400 bg-white hover:bg-purple-50 transition-colors duration-200 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-purple-100 file:text-purple-700 hover:file:bg-purple-200"
                disabled={loading}
              />
              <Upload className="absolute left-3 top-2.5 h-5 w-5 text-purple-500" />
            </div>
            <motion.button
              type="button"
              onClick={handleUpload}
              disabled={loading || !file}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className={`w-full sm:w-auto bg-purple-600 text-white px-6 py-2 rounded-lg text-sm font-semibold hover:bg-purple-700 transition-colors duration-200 flex items-center ${loading || !file ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <Upload className="h-4 w-4 ml-2" />
              رفع الملف
            </motion.button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="relative">
              <label className="block text-purple-700 text-sm font-semibold mb-1">كود الموظف</label>
              <input
                type="text"
                value={employeeCode}
                onChange={(e) => setEmployeeCode(e.target.value)}
                className="w-full px-4 py-2 border border-purple-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-400 focus:border-purple-400 bg-white hover:bg-purple-50 transition-colors duration-200 pl-10"
                disabled={loading}
                placeholder="مثال: 3343"
              />
              <Search className="absolute left-3 top-9 h-5 w-5 text-purple-500" />
            </div>
            <div className="relative">
              <label className="block text-purple-700 text-sm font-semibold mb-1">من التاريخ</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-4 py-2 border border-purple-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-400 focus:border-purple-400 bg-white hover:bg-purple-50 transition-colors duration-200 pl-10"
                disabled={loading}
              />
              <Calendar className="absolute left-3 top-9 h-5 w-5 text-purple-500" />
            </div>
            <div className="relative">
              <label className="block text-purple-700 text-sm font-semibold mb-1">إلى التاريخ</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-4 py-2 border border-purple-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-400 focus:border-purple-400 bg-white hover:bg-purple-50 transition-colors duration-200 pl-10"
                disabled={loading}
              />
              <Calendar className="absolute left-3 top-9 h-5 w-5 text-purple-500" />
            </div>
            <div>
              <label className="block text-purple-700 text-sm font-semibold mb-1">نوع الدوام</label>
              <select
                value={shiftType}
                onChange={(e) => setShiftType(e.target.value)}
                className="w-full px-4 py-2 border border-purple-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-400 focus:border-purple-400 bg-white hover:bg-purple-50 transition-colors duration-200"
                disabled={loading}
              >
                <option value="all">الكل</option>
                <option value="administrative">إداري</option>
                <option value="dayStation">محطة نهار</option>
                <option value="nightStation">محطة ليل</option>
                <option value="24/24">24/24</option>
              </select>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-4 justify-end">
            <label className="flex items-center text-purple-700 text-sm font-semibold">
              <input
                type="checkbox"
                checked={filterPresent}
                onChange={(e) => {
                  setFilterPresent(e.target.checked);
                  if (e.target.checked) {
                    setFilterAbsent(false);
                    setFilterSingleCheckIn(false);
                  }
                }}
                className="ml-2 h-4 w-4 text-purple-600 focus:ring-purple-400 border-purple-300 rounded"
                disabled={loading}
              />
              إظهار أيام الحضور فقط
            </label>
            <label className="flex items-center text-purple-700 text-sm font-semibold">
              <input
                type="checkbox"
                checked={filterAbsent}
                onChange={(e) => {
                  setFilterAbsent(e.target.checked);
                  if (e.target.checked) {
                    setFilterPresent(false);
                    setFilterSingleCheckIn(false);
                  }
                }}
                className="ml-2 h-4 w-4 text-purple-600 focus:ring-purple-400 border-purple-300 rounded"
                disabled={loading}
              />
              إظهار أيام الغياب فقط
            </label>
            <label className="flex items-center text-purple-700 text-sm font-semibold">
              <input
                type="checkbox"
                checked={filterSingleCheckIn}
                onChange={(e) => {
                  setFilterSingleCheckIn(e.target.checked);
                  if (e.target.checked) {
                    setFilterPresent(false);
                    setFilterAbsent(false);
                  }
                }}
                className="ml-2 h-4 w-4 text-purple-600 focus:ring-purple-400 border-purple-300 rounded"
                disabled={loading}
              />
              إظهار البصمة الواحدة فقط
            </label>
          </div>
          <div className="flex flex-col sm:flex-row justify-end gap-4">
            <motion.button
              onClick={handleSearch}
              disabled={loading}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className={`bg-purple-600 text-white px-6 py-2 rounded-lg text-sm font-semibold hover:bg-purple-700 transition-colors duration-200 flex items-center ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <Search className="h-4 w-4 ml-2" />
              بحث
            </motion.button>
            <motion.button
              onClick={handleShowAll}
              disabled={loading}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className={`bg-purple-600 text-white px-6 py-2 rounded-lg text-sm font-semibold hover:bg-purple-700 transition-colors duration-200 flex items-center ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <Search className="h-4 w-4 ml-2" />
              عرض الكل
            </motion.button>
            <motion.button
              onClick={() => setShowOfficialLeaveForm(true)}
              disabled={loading}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className={`bg-purple-600 text-white px-6 py-2 rounded-lg text-sm font-semibold hover:bg-purple-700 transition-colors duration-200 flex items-center ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <Calendar className="h-4 w-4 ml-2" />
              إجازة رسمية
            </motion.button>
            <motion.button
              onClick={() => setShowAnnualLeaveForm(true)}
              disabled={loading}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className={`bg-purple-600 text-white px-6 py-2 rounded-lg text-sm font-semibold hover:bg-purple-700 transition-colors duration-200 flex items-center ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <Calendar className="h-4 w-4 ml-2" />
              إجازة سنوية
            </motion.button>
            <motion.button
              onClick={handleDeleteAll}
              disabled={loading}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className={`bg-red-500 text-white px-6 py-2 rounded-lg text-sm font-semibold hover:bg-red-600 transition-colors duration-200 flex items-center ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <Trash2 className="h-4 w-4 ml-2" />
              حذف جميع البصمات
            </motion.button>
          </div>
          {showOfficialLeaveForm && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="bg-purple-50 p-6 rounded-xl shadow-md border border-purple-200 mb-6"
            >
              <h3 className="text-lg font-bold text-purple-800 mb-4">تحديد إجازة رسمية</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="relative">
                  <label className="block text-purple-700 text-sm font-semibold mb-1">كود الموظف</label>
                  <input
                    type="text"
                    name="employeeCode"
                    value={officialLeaveData.employeeCode}
                    onChange={handleOfficialLeaveChange}
                    className="w-full px-4 py-2 border border-purple-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-400 focus:border-purple-400 bg-white hover:bg-purple-50 transition-colors duration-200 pl-10"
                    disabled={loading || officialLeaveData.applyToAll}
                    placeholder="مثال: 3343"
                  />
                  <Search className="absolute left-3 top-9 h-5 w-5 text-purple-500" />
                </div>
                <div className="relative">
                  <label className="block text-purple-700 text-sm font-semibold mb-1">من التاريخ</label>
                  <input
                    type="date"
                    name="startDate"
                    value={officialLeaveData.startDate}
                    onChange={handleOfficialLeaveChange}
                    className="w-full px-4 py-2 border border-purple-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-400 focus:border-purple-400 bg-white hover:bg-purple-50 transition-colors duration-200 pl-10"
                    disabled={loading}
                  />
                  <Calendar className="absolute left-3 top-9 h-5 w-5 text-purple-500" />
                </div>
                <div className="relative">
                  <label className="block text-purple-700 text-sm font-semibold mb-1">إلى التاريخ</label>
                  <input
                    type="date"
                    name="endDate"
                    value={officialLeaveData.endDate}
                    onChange={handleOfficialLeaveChange}
                    className="w-full px-4 py-2 border border-purple-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-400 focus:border-purple-400 bg-white hover:bg-purple-50 transition-colors duration-200 pl-10"
                    disabled={loading}
                  />
                  <Calendar className="absolute left-3 top-9 h-5 w-5 text-purple-500" />
                </div>
                <div className="lg:col-span-3">
                  <label className="flex items-center text-purple-700 text-sm font-semibold">
                    <input
                      type="checkbox"
                      name="applyToAll"
                      checked={officialLeaveData.applyToAll}
                      onChange={handleOfficialLeaveChange}
                      className="ml-2 h-4 w-4 text-purple-600 focus:ring-purple-400 border-purple-300 rounded"
                      disabled={loading}
                    />
                    تطبيق للجميع
                  </label>
                </div>
                <div className="lg:col-span-3 flex justify-end gap-4">
                  <motion.button
                    type="button"
                    onClick={handleOfficialLeaveSubmit}
                    disabled={loading}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className={`bg-purple-600 text-white px-6 py-2 rounded-lg text-sm font-semibold hover:bg-purple-700 transition-colors duration-200 flex items-center ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <Save className="h-4 w-4 ml-2" />
                    حفظ
                  </motion.button>
                  <motion.button
                    type="button"
                    onClick={() => setShowOfficialLeaveForm(false)}
                    disabled={loading}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className={`bg-gray-300 text-gray-800 px-6 py-2 rounded-lg text-sm font-semibold hover:bg-gray-400 transition-colors duration-200 flex items-center ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <X className="h-4 w-4 ml-2" />
                    إلغاء
                  </motion.button>
                </div>
              </div>
            </motion.div>
          )}
          {showAnnualLeaveForm && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="bg-purple-50 p-6 rounded-xl shadow-md border border-purple-200 mb-6"
            >
              <h3 className="text-lg font-bold text-purple-800 mb-4">تحديد إجازة سنوية</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="relative">
                  <label className="block text-purple-700 text-sm font-semibold mb-1">كود الموظف</label>
                  <input
                    type="text"
                    name="employeeCode"
                    value={annualLeaveData.employeeCode}
                    onChange={handleAnnualLeaveChange}
                    className="w-full px-4 py-2 border border-purple-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-400 focus:border-purple-400 bg-white hover:bg-purple-50 transition-colors duration-200 pl-10"
                    disabled={loading || annualLeaveData.applyToAll}
                    placeholder="مثال: 3343"
                  />
                  <Search className="absolute left-3 top-9 h-5 w-5 text-purple-500" />
                </div>
                <div className="relative">
                  <label className="block text-purple-700 text-sm font-semibold mb-1">من التاريخ</label>
                  <input
                    type="date"
                    name="startDate"
                    value={annualLeaveData.startDate}
                    onChange={handleAnnualLeaveChange}
                    className="w-full px-4 py-2 border border-purple-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-400 focus:border-purple-400 bg-white hover:bg-purple-50 transition-colors duration-200 pl-10"
                    disabled={loading}
                  />
                  <Calendar className="absolute left-3 top-9 h-5 w-5 text-purple-500" />
                </div>
                <div className="relative">
                  <label className="block text-purple-700 text-sm font-semibold mb-1">إلى التاريخ</label>
                  <input
                    type="date"
                    name="endDate"
                    value={annualLeaveData.endDate}
                    onChange={handleAnnualLeaveChange}
                    className="w-full px-4 py-2 border border-purple-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-400 focus:border-purple-400 bg-white hover:bg-purple-50 transition-colors duration-200 pl-10"
                    disabled={loading}
                  />
                  <Calendar className="absolute left-3 top-9 h-5 w-5 text-purple-500" />
                </div>
                <div className="lg:col-span-3 space-y-2">
                  <label className="flex items-center text-purple-700 text-sm font-semibold">
                    <input
                      type="checkbox"
                      name="applyToAll"
                      checked={annualLeaveData.applyToAll}
                      onChange={handleAnnualLeaveChange}
                      className="ml-2 h-4 w-4 text-purple-600 focus:ring-purple-400 border-purple-300 rounded"
                      disabled={loading}
                    />
                    تطبيق للجميع
                  </label>
                  <label className="flex items-center text-purple-700 text-sm font-semibold">
                    <input
                      type="checkbox"
                      name="isMedicalLeave"
                      checked={annualLeaveData.isMedicalLeave}
                      onChange={handleAnnualLeaveChange}
                      className="ml-2 h-4 w-4 text-purple-600 focus:ring-purple-400 border-purple-300 rounded"
                      disabled={loading}
                    />
                    إجازة مرضية
                  </label>
                </div>
                <div className="lg:col-span-3 flex justify-end gap-4">
                  <motion.button
                    type="button"
                    onClick={handleAnnualLeaveSubmit}
                    disabled={loading}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className={`bg-purple-600 text-white px-6 py-2 rounded-lg text-sm font-semibold hover:bg-purple-700 transition-colors duration-200 flex items-center ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <Save className="h-4 w-4 ml-2" />
                    حفظ
                  </motion.button>
                  <motion.button
                    type="button"
                    onClick={() => setShowAnnualLeaveForm(false)}
                    disabled={loading}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className={`bg-gray-300 text-gray-800 px-6 py-2 rounded-lg text-sm font-semibold hover:bg-gray-400 transition-colors duration-200 flex items-center ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <X className="h-4 w-4 ml-2" />
                    إلغاء
                  </motion.button>
                </div>
              </div>
            </motion.div>
          )}
          {showEditModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="bg-white p-6 rounded-xl shadow-2xl border border-purple-100 w-full max-w-md"
              >
                <h3 className="text-lg font-bold text-purple-800 mb-4">تعديل سجل الحضور</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-purple-700 text-sm font-semibold mb-1">كود الموظف</label>
                    <input
                      type="text"
                      value={editRecord.employeeCode}
                      className="w-full px-4 py-2 border border-purple-300 rounded-lg text-sm bg-purple-50 cursor-not-allowed"
                      readOnly
                    />
                  </div>
                  <div>
                    <label className="block text-purple-700 text-sm font-semibold mb-1">التاريخ</label>
                    <input
                      type="date"
                      value={editRecord.date}
                      className="w-full px-4 py-2 border border-purple-300 rounded-lg text-sm bg-purple-50 cursor-not-allowed"
                      readOnly
                    />
                  </div>
                  <div>
                    <label className="block text-purple-700 text-sm font-semibold mb-1">الحضور</label>
                    <input
                      type="text"
                      value={editRecord.checkIn}
                      onChange={handleEditChange}
                      name="checkIn"
                      className="w-full px-4 py-2 border border-purple-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-400 focus:border-purple-400 bg-white hover:bg-purple-50 transition-colors duration-200"
                      disabled={loading || editRecord.isAnnualLeave || editRecord.isLeaveCompensation || editRecord.isMedicalLeave}
                      placeholder="HH:mm (مثال: 08:30)"
                    />
                  </div>
                  <div>
                    <label className="block text-purple-700 text-sm font-semibold mb-1">الانصراف</label>
                    <input
                      type="text"
                      value={editRecord.checkOut}
                      onChange={handleEditChange}
                      name="checkOut"
                      className="w-full px-4 py-2 border border-purple-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-400 focus:border-purple-400 bg-white hover:bg-purple-50 transition-colors duration-200"
                      disabled={loading || editRecord.isAnnualLeave || editRecord.isLeaveCompensation || editRecord.isMedicalLeave}
                      placeholder="HH:mm (مثال: 17:00)"
                    />
                  </div>
                  {editRecord.shiftType === 'administrative' && (
                    <div>
                      <label className="block text-purple-700 text-sm font-semibold mb-1">رصيد السماح بالتأخير (دقائق)</label>
                      <input
                        type="number"
                        value={editRecord.monthlyLateAllowance}
                        onChange={handleEditChange}
                        name="monthlyLateAllowance"
                        min="0"
                        className="w-full px-4 py-2 border border-purple-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-400 focus:border-purple-400 bg-white hover:bg-purple-50 transition-colors duration-200"
                        disabled={loading}
                        placeholder="أدخل عدد الدقائق"
                      />
                    </div>
                  )}
                  <div>
                    <label className="block text-purple-700 text-sm font-semibold mb-1">الحالة</label>
                    <select
                      value={editRecord.status}
                      onChange={handleEditChange}
                      name="status"
                      className="w-full px-4 py-2 border border-purple-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-400 focus:border-purple-400 bg-white hover:bg-purple-50 transition-colors duration-200"
                      disabled={loading}
                    >
                      <option value="present">حضور</option>
                      <option value="absent">غياب</option>
                      <option value="weekly_off">إجازة أسبوعية</option>
                      <option value="leave">إجازة</option>
                      <option value="official_leave">إجازة رسمية</option>
                      <option value="medical_leave">إجازة مرضية</option>
                    </select>
                  </div>
                  <div className="sm:col-span-2 space-y-2">
                    <label className="flex items-center text-purple-700 text-sm font-semibold">
                      <input
                        type="checkbox"
                        name="isAnnualLeave"
                        checked={editRecord.isAnnualLeave}
                        onChange={handleEditChange}
                        className="ml-2 h-4 w-4 text-purple-600 focus:ring-purple-400 border-purple-300 rounded"
                        disabled={loading}
                      />
                      إجازة سنوية
                    </label>
                    <label className="flex items-center text-purple-700 text-sm font-semibold">
                      <input
                        type="checkbox"
                        name="isLeaveCompensation"
                        checked={editRecord.isLeaveCompensation}
                        onChange={handleEditChange}
                        className="ml-2 h-4 w-4 text-purple-600 focus:ring-purple-400 border-purple-300 rounded"
                        disabled={loading}
                      />
                      بدل إجازة
                    </label>
                    <label className="flex items-center text-purple-700 text-sm font-semibold">
                      <input
                        type="checkbox"
                        name="isMedicalLeave"
                        checked={editRecord.isMedicalLeave}
                        onChange={handleEditChange}
                        className="ml-2 h-4 w-4 text-purple-600 focus:ring-purple-400 border-purple-300 rounded"
                        disabled={loading}
                      />
                      إجازة مرضية
                    </label>
                  </div>
                  <div className="sm:col-span-2 flex justify-end gap-4">
                    <motion.button
                      type="button"
                      onClick={handleEditSubmit}
                      disabled={loading}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className={`bg-purple-600 text-white px-6 py-2 rounded-lg text-sm font-semibold hover:bg-purple-700 transition-colors duration-200 flex items-center ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <Save className="h-4 w-4 ml-2" />
                      حفظ
                    </motion.button>
                    <motion.button
                      type="button"
                      onClick={() => setShowEditModal(false)}
                      disabled={loading}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className={`bg-gray-300 text-gray-800 px-6 py-2 rounded-lg text-sm font-semibold hover:bg-gray-400 transition-colors duration-200 flex items-center ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <X className="h-4 w-4 ml-2" />
                      إلغاء
                    </motion.button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
          {records.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="overflow-x-auto rounded-lg border border-purple-200 bg-white"
            >
              <table className="w-full text-right text-sm">
                <thead className="sticky top-0 bg-purple-100">
                  <tr>
                    <th className="px-4 py-3 font-semibold text-purple-800">كود الموظف</th>
                    <th className="px-4 py-3 font-semibold text-purple-800">اسم الموظف</th>
                    <th className="px-4 py-3 font-semibold text-purple-800">التاريخ</th>
                    <th className="px-4 py-3 font-semibold text-purple-800">الحضور</th>
                    <th className="px-4 py-3 font-semibold text-purple-800">الانصراف</th>
                    <th className="px-4 py-3 font-semibold text-purple-800">نوع الدوام</th>
                    <th className="px-4 py-3 font-semibold text-purple-800">أيام العمل</th>
                    <th className="px-4 py-3 font-semibold text-purple-800">دقائق التأخير</th>
                    <th className="px-4 py-3 font-semibold text-purple-800">رصيد السماح بالتأخير</th>
                    <th className="px-4 py-3 font-semibold text-purple-800">الأيام المخصومة</th>
                    <th className="px-4 py-3 font-semibold text-purple-800">رصيد الإجازة</th>
                    <th className="px-4 py-3 font-semibold text-purple-800">حالة الحضور</th>
                    <th className="px-4 py-3 font-semibold text-purple-800">بدل الإجازة</th>
                    <th className="px-4 py-3 font-semibold text-purple-800">خصم إجازة مرضية</th>
                    <th className="px-4 py-3 font-semibold text-purple-800">ساعات العمل</th>
                    <th className="px-4 py-3 font-semibold text-purple-800">الساعات الإضافية</th>
                    <th className="px-4 py-3 font-semibold text-purple-800">الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((record, index) => {
                    const workHours = record.shiftType === 'administrative' && (record.checkIn || record.checkOut) && !(record.checkIn && record.checkOut)
                      ? '9.00'
                      : formatNumber(record.workHours);
                    const extraHours = formatNumber(record.extraHours);
                    const rowClass =
                      record.status === 'absent'
                        ? 'bg-red-50 text-red-600'
                        : record.status === 'weekly_off'
                        ? 'bg-green-50 text-green-600'
                        : record.status === 'leave' || record.status === 'official_leave' || record.status === 'medical_leave'
                        ? 'bg-yellow-50 text-yellow-600'
                        : index % 2 === 0
                        ? 'bg-white'
                        : 'bg-purple-50';
                    const isLate = record.shiftType === 'administrative' && record.lateMinutes > 0;
                    const isLowAllowance = record.shiftType === 'administrative' && record.monthlyLateAllowance !== '-' && record.monthlyLateAllowance < 30;
                    const displayWorkingDays = record.workingDays === '5' ? '5 أيام' : record.workingDays === '6' ? '6 أيام' : 'غير محدد';
                    return (
                      <motion.tr
                        key={record._id || Math.random()}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.3, delay: index * 0.05 }}
                        className={`border-b border-purple-200 hover:bg-purple-100 transition-colors duration-200 ${rowClass}`}
                      >
                        <td className="px-4 py-3">{record.employeeCode}</td>
                        <td className="px-4 py-3">{record.employeeName}</td>
                        <td className="px-4 py-3">{new Date(record.date).toLocaleDateString('ar-EG')}</td>
                        <td className="px-4 py-3">{record.checkIn || '-'}</td>
                        <td className="px-4 py-3">{record.checkOut || '-'}</td>
                        <td className="px-4 py-3">
                          {record.shiftType === 'administrative'
                            ? 'إداري'
                            : record.shiftType === 'dayStation'
                            ? 'محطة نهار'
                            : record.shiftType === 'nightStation'
                            ? 'محطة ليل'
                            : record.shiftType === '24/24'
                            ? '24/24'
                            : '-'}
                        </td>
                        <td className={`px-4 py-3 ${displayWorkingDays === 'غير محدد' ? 'text-red-600 font-semibold' : ''}`}>
                          {displayWorkingDays}
                          {displayWorkingDays === 'غير محدد' && (
                            <AlertTriangle className="inline h-4 w-4 mr-1 text-red-600" />
                          )}
                        </td>
                        <td className={`px-4 py-3 ${isLate ? 'font-semibold text-red-600' : ''}`}>
                          {record.shiftType === 'administrative' ? formatNumber(record.lateMinutes || 0) : '-'}
                        </td>
                        <td className={`px-4 py-3 ${isLowAllowance ? 'font-semibold text-red-600' : ''}`}>
                          {record.monthlyLateAllowance}
                          {isLowAllowance && (
                            <AlertTriangle className="inline h-4 w-4 mr-1 text-red-600" />
                          )}
                        </td>
                        <td className={`px-4 py-3 ${record.deductedDays > 0 ? 'font-semibold text-red-600' : ''}`}>
                          {formatNumber(record.deductedDays)}
                        </td>
                        <td className="px-4 py-3">{formatNumber(record.annualLeaveBalance)}</td>
                        <td className="px-4 py-3">
                          {record.status === 'present'
                            ? 'حضور'
                            : record.status === 'absent'
                            ? 'غياب'
                            : record.status === 'weekly_off'
                            ? 'إجازة أسبوعية'
                            : record.status === 'leave'
                            ? 'إجازة'
                            : record.status === 'official_leave'
                            ? 'إجازة رسمية'
                            : record.status === 'medical_leave'
                            ? 'إجازة مرضية'
                            : '-'}
                        </td>
                        <td className="px-4 py-3">{formatNumber(record.leaveCompensation)}</td>
                        <td className="px-4 py-3">{formatNumber(record.medicalLeaveDeduction)}</td>
                        <td className="px-4 py-3">{workHours}</td>
                        <td className="px-4 py-3">{extraHours}</td>
                        <td className="px-4 py-3">
                          <motion.button
                            onClick={() => handleEdit(record)}
                            whileHover={{ scale: 1.1, rotate: 5 }}
                            whileTap={{ scale: 0.9 }}
                            className="bg-purple-600 text-white p-2 rounded-lg hover:bg-purple-700 transition-colors duration-200"
                          >
                            <Edit className="h-4 w-4" />
                          </motion.button>
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </motion.div>
          )}
          {Object.keys(summaries).length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="mt-6 overflow-x-auto rounded-lg border border-purple-200 bg-white"
            >
              <h3 className="text-lg font-bold text-purple-800 mb-4 px-4 pt-4">ملخص الحضور</h3>
              <table className="w-full text-right text-sm">
                <thead className="sticky top-0 bg-purple-100">
                  <tr>
                    <th className="px-4 py-3 font-semibold text-purple-800">كود الموظف</th>
                    <th className="px-4 py-3 font-semibold text-purple-800">اسم الموظف</th>
                    <th className="px-4 py-3 font-semibold text-purple-800">أيام الحضور</th>
                    <th className="px-4 py-3 font-semibold text-purple-800">أيام الغياب</th>
                    <th className="px-4 py-3 font-semibold text-purple-800">أيام الإجازة الأسبوعية</th>
                    <th className="px-4 py-3 font-semibold text-purple-800">أيام الإجازة</th>
                    <th className="px-4 py-3 font-semibold text-purple-800">أيام الإجازة الرسمية</th>
                    <th className="px-4 py-3 font-semibold text-purple-800">أيام الإجازة المرضية</th>
                    <th className="px-4 py-3 font-semibold text-purple-800">إجمالي دقائق التأخير</th>
                    <th className="px-4 py-3 font-semibold text-purple-800">إجمالي الأيام المخصومة</th>
                    <th className="px-4 py-3 font-semibold text-purple-800">إجمالي بدل الإجازة</th>
                    <th className="px-4 py-3 font-semibold text-purple-800">إجمالي خصم الإجازة المرضية</th>
                    <th className="px-4 py-3 font-semibold text-purple-800">إجمالي أيام العمل المحسوبة</th>
                    <th className="px-4 py-3 font-semibold text-purple-800">إجمالي ساعات العمل</th>
                    <th className="px-4 py-3 font-semibold text-purple-800">إجمالي الساعات الإضافية</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.keys(summaries).map((employeeCode, index) => {
                    const summary = summaries[employeeCode];
                    const isLowAllowance = records.some(
                      (record) =>
                        record.employeeCode === employeeCode &&
                        record.shiftType === 'administrative' &&
                        record.monthlyLateAllowance !== '-' &&
                        record.monthlyLateAllowance < 30
                    );
                    return (
                      <motion.tr
                        key={employeeCode}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.3, delay: index * 0.05 }}
                        className={`border-b border-purple-200 hover:bg-purple-100 transition-colors duration-200 ${
                          index % 2 === 0 ? 'bg-white' : 'bg-purple-50'
                        } ${isLowAllowance ? 'text-red-600 font-semibold' : ''}`}
                      >
                        <td className="px-4 py-3">{employeeCode}</td>
                        <td className="px-4 py-3">{summary.employeeName}</td>
                        <td className="px-4 py-3">{formatNumber(summary.totalPresentDays)}</td>
                        <td className="px-4 py-3">{formatNumber(summary.totalAbsentDays)}</td>
                        <td className="px-4 py-3">{formatNumber(summary.totalWeeklyOffDays)}</td>
                        <td className="px-4 py-3">{formatNumber(summary.totalLeaveDays)}</td>
                        <td className="px-4 py-3">{formatNumber(summary.totalOfficialLeaveDays)}</td>
                        <td className="px-4 py-3">{formatNumber(summary.totalMedicalLeaveDays)}</td>
                        <td className="px-4 py-3">{formatNumber(summary.totalLateMinutes)}</td>
                        <td className="px-4 py-3">{formatNumber(summary.totalDeductedDays)}</td>
                        <td className="px-4 py-3">{formatNumber(summary.totalLeaveCompensation)}</td>
                        <td className="px-4 py-3">{formatNumber(summary.totalMedicalLeaveDeduction)}</td>
                        <td className="px-4 py-3">{formatNumber(summary.totalCalculatedWorkDays)}</td>
                        <td className="px-4 py-3">{formatNumber(summary.totalWorkHours)}</td>
                        <td className="px-4 py-3">{formatNumber(summary.totalExtraHours)}</td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </motion.div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default UploadAttendance;
