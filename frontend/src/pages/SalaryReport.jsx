import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { AuthContext } from '../components/AuthProvider';
import { Edit, CheckCircle } from 'lucide-react';
import LoadingSpinner from '../components/LoadingSpinner';
import { saveAs } from 'file-saver';
import * as XLSX from 'xlsx';
import { Document, Packer, Paragraph, Table, TableCell, TableRow, WidthType, TextRun, AlignmentType, BorderStyle } from 'docx';

const SalaryReport = () => {
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();
  const [employeeCode, setEmployeeCode] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [shiftType, setShiftType] = useState('all');
  const [summaries, setSummaries] = useState({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [editFinance, setEditFinance] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);

  const shiftOptions = [
    { value: 'all', label: 'جميع الشيفتات' },
    { value: 'administrative', label: 'إداري' },
    { value: 'dayStation', label: 'محطة نهارًا' },
    { value: 'nightStation', label: 'محطة ليلًا' },
    { value: '24/24', label: '24/24' },
  ];

  // دالة للتحقق من صحة التواريخ
  const validateDates = () => {
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return 'تاريخ البداية أو النهاية غير صالح';
      }
      if (start > end) {
        return 'تاريخ البداية يجب أن يكون قبل تاريخ النهاية';
      }
    }
    return null;
  };

  // دالة لحساب صافي الراتب وإجمالي الخصومات (تُستخدم عند التعديل)
  const calculateNetSalary = (summary) => {
    const baseSalary = parseFloat(summary.baseSalary || 0);
    const mealAllowance = parseFloat(summary.mealAllowance || 0); // القيمة المتبقية بعد الخصم
    const totalExtraHoursCompensation = parseFloat(summary.totalExtraHoursCompensation || 0);
    const totalFridayBonus = parseFloat(summary.totalFridayBonus || 0);
    const totalLeaveCompensation = parseFloat(summary.totalLeaveCompensation || 0);
    const absentDays = parseFloat(summary.absentDays || 0);
    const deductedDays = parseFloat(summary.deductedDays || 0);
    const totalMealAllowanceDeduction = parseFloat(summary.totalMealAllowanceDeduction || 0);
    const totalHoursDeduction = summary.shiftType === 'administrative' ? 0 : parseFloat(summary.totalHoursDeduction || 0);
    const totalMedicalLeaveDeduction = parseFloat(summary.totalMedicalLeaveDeduction || 0);
    const medicalInsurance = parseFloat(summary.medicalInsurance || 0);
    const socialInsurance = parseFloat(summary.socialInsurance || 0);
    const violationsDeduction = parseFloat(summary.violationsDeduction || 0);
    const advancesDeduction = parseFloat(summary.advancesDeduction || 0);
    const dailySalary = baseSalary / 30;
    const hourlyRate = dailySalary / 9;

    let totalDeductions;
    if (summary.shiftType === 'administrative') {
      totalDeductions = (
        (absentDays + deductedDays) * dailySalary +
        medicalInsurance +
        socialInsurance +
        totalMealAllowanceDeduction +
        violationsDeduction +
        advancesDeduction
      );
    } else {
      totalDeductions = (
        (absentDays * dailySalary) +
        (totalHoursDeduction * hourlyRate) +
        totalMedicalLeaveDeduction +
        totalMealAllowanceDeduction +
        medicalInsurance +
        socialInsurance +
        violationsDeduction +
        advancesDeduction
      );
    }

    let netSalary = (
      baseSalary +
      mealAllowance +
      totalExtraHoursCompensation +
      totalFridayBonus +
      totalLeaveCompensation -
      totalDeductions
    );

    netSalary = netSalary < 0 ? 0 : netSalary;

    return { netSalary, totalDeductions };
  };

  useEffect(() => {
    if (!user) {
      navigate('/login', { replace: true });
      return;
    }
    if (user.role !== 'admin') {
      fetchEmployeeSalaryReport();
    }
  }, [user, navigate]);

  const fetchEmployeeSalaryReport = async () => {
    setError('');
    setLoading(true);
    try {
      const dateError = validateDates();
      if (dateError) {
        setError(dateError);
        setLoading(false);
        return;
      }

      const token = localStorage.getItem('token');
      const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/users/salary-report`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { code: user.employeeCode, startDate, endDate },
      });
      const updatedSummaries = Object.entries(response.data.summaries).reduce((acc, [key, summary]) => {
        const absentDays = parseFloat(summary.absentDays || 0);
        const maxMealAllowance = parseFloat(summary.maxMealAllowance || 500); // القيمة الأصلية من نموذج User
        const totalMealAllowanceDeduction = Math.min(absentDays * 50, maxMealAllowance);
        const mealAllowance = maxMealAllowance - totalMealAllowanceDeduction; // القيمة المتبقية
        const totalHoursDeduction = summary.shiftType === 'administrative' ? 0 : parseFloat(summary.totalHoursDeduction || 0);
        const deductedDays = parseFloat(summary.deductedDays || 0);

        acc[key] = {
          ...summary,
          mealAllowance,
          totalMealAllowanceDeduction,
          totalExtraHours: summary.shiftType === 'administrative' ? parseFloat(summary.totalExtraHours || 0) : 0,
          totalHoursDeduction,
          netSalary: parseFloat(summary.netSalary || 0),
          totalDeductions: parseFloat(summary.totalDeductions || 0),
          deductedDays,
          totalAbsentDeduction: summary.shiftType === 'administrative' ? parseFloat(summary.totalAbsentDeduction || 0) : (absentDays * (parseFloat(summary.baseSalary || 0) / 30)),
        };
        return acc;
      }, {});
      setSummaries(updatedSummaries);
      if (Object.keys(updatedSummaries).length === 0) {
        setError('لا توجد بيانات متاحة لتقرير راتبك.');
      }
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 2000);
    } catch (err) {
      const errorMessage = err.response?.data?.message
        ? err.response.data.message.includes('User validation failed')
          ? 'خطأ في البيانات: تحقق من صحة المدخلات.'
          : err.response.data.message
        : 'حدث خطأ غير متوقع. يرجى المحاولة لاحقًا.';
      setError(errorMessage);
      if (err.response?.status === 401) {
        logout();
        navigate('/login', { replace: true });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    setError('');
    setLoading(true);

    const dateError = validateDates();
    if (dateError) {
      setError(dateError);
      setLoading(false);
      return;
    }

    const token = localStorage.getItem('token');
    const params = user.role === 'admin'
      ? { code: employeeCode, startDate, endDate, shiftType }
      : { code: user.employeeCode, startDate, endDate };

    try {
      const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/users/salary-report`, {
        headers: { Authorization: `Bearer ${token}` },
        params,
      });
      const updatedSummaries = Object.entries(response.data.summaries).reduce((acc, [key, summary]) => {
        const absentDays = parseFloat(summary.absentDays || 0);
        const maxMealAllowance = parseFloat(summary.maxMealAllowance || 500); // القيمة الأصلية من نموذج User
        const totalMealAllowanceDeduction = Math.min(absentDays * 50, maxMealAllowance);
        const mealAllowance = maxMealAllowance - totalMealAllowanceDeduction; // القيمة المتبقية
        const totalHoursDeduction = summary.shiftType === 'administrative' ? 0 : parseFloat(summary.totalHoursDeduction || 0);
        const deductedDays = parseFloat(summary.deductedDays || 0);

        acc[key] = {
          ...summary,
          mealAllowance,
          totalMealAllowanceDeduction,
          totalExtraHours: summary.shiftType === 'administrative' ? parseFloat(summary.totalExtraHours || 0) : 0,
          totalHoursDeduction,
          netSalary: parseFloat(summary.netSalary || 0),
          totalDeductions: parseFloat(summary.totalDeductions || 0),
          deductedDays,
          totalAbsentDeduction: summary.shiftType === 'administrative' ? parseFloat(summary.totalAbsentDeduction || 0) : (absentDays * (parseFloat(summary.baseSalary || 0) / 30)),
        };
        return acc;
      }, {});
      setSummaries(updatedSummaries);
      if (Object.keys(updatedSummaries).length === 0) {
        setError('لا توجد سجلات مطابقة لمعايير البحث.');
      }
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 2000);
    } catch (err) {
      const errorMessage = err.response?.data?.message
        ? err.response.data.message.includes('User validation failed')
          ? 'خطأ في البيانات: تحقق من صحة المدخلات.'
          : err.response.data.message
        : 'حدث خطأ غير متوقع. يرجى المحاولة لاحقًا.';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleShowAll = async () => {
    setError('');
    setLoading(true);

    const dateError = validateDates();
    if (dateError) {
      setError(dateError);
      setLoading(false);
      return;
    }

    const token = localStorage.getItem('token');
    const params = { startDate, endDate, shiftType };

    try {
      const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/users/salary-report`, {
        headers: { Authorization: `Bearer ${token}` },
        params,
      });
      const updatedSummaries = Object.entries(response.data.summaries).reduce((acc, [key, summary]) => {
        const absentDays = parseFloat(summary.absentDays || 0);
        const maxMealAllowance = parseFloat(summary.maxMealAllowance || 500); // القيمة الأصلية من نموذج User
        const totalMealAllowanceDeduction = Math.min(absentDays * 50, maxMealAllowance);
        const mealAllowance = maxMealAllowance - totalMealAllowanceDeduction; // القيمة المتبقية
        const totalHoursDeduction = summary.shiftType === 'administrative' ? 0 : parseFloat(summary.totalHoursDeduction || 0);
        const deductedDays = parseFloat(summary.deductedDays || 0);

        acc[key] = {
          ...summary,
          mealAllowance,
          totalMealAllowanceDeduction,
          totalExtraHours: summary.shiftType === 'administrative' ? parseFloat(summary.totalExtraHours || 0) : 0,
          totalHoursDeduction,
          netSalary: parseFloat(summary.netSalary || 0),
          totalDeductions: parseFloat(summary.totalDeductions || 0),
          deductedDays,
          totalAbsentDeduction: summary.shiftType === 'administrative' ? parseFloat(summary.totalAbsentDeduction || 0) : (absentDays * (parseFloat(summary.baseSalary || 0) / 30)),
        };
        return acc;
      }, {});
      setSummaries(updatedSummaries);
      if (Object.keys(updatedSummaries).length === 0) {
        setError('لا توجد سجلات متاحة.');
      }
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 2000);
    } catch (err) {
      const errorMessage = err.response?.data?.message
        ? err.response.data.message.includes('User validation failed')
          ? 'خطأ في البيانات: تحقق من صحة المدخلات.'
          : err.response.data.message
        : 'حدث خطأ غير متوقع. يرجى المحاولة لاحقًا.';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleEditFinance = (summary) => {
    setEditFinance({
      id: Object.keys(summaries).find((key) => summaries[key].employeeCode === summary.employeeCode),
      employeeCode: summary.employeeCode,
      violationsTotal: parseFloat(summary.violationsTotal || 0),
      violationsDeduction: parseFloat(summary.violationsDeduction || 0),
      advancesTotal: parseFloat(summary.advancesTotal || 0),
      advancesDeduction: parseFloat(summary.advancesDeduction || 0),
      netSalary: parseFloat(summary.netSalary || 0),
      baseSalary: parseFloat(summary.baseSalary || 0),
      mealAllowance: parseFloat(summary.mealAllowance || 0),
      totalExtraHoursCompensation: parseFloat(summary.totalExtraHoursCompensation || 0),
      totalFridayBonus: parseFloat(summary.totalFridayBonus || 0),
      totalLeaveCompensation: parseFloat(summary.totalLeaveCompensation || 0),
      totalAbsentDeduction: parseFloat(summary.totalAbsentDeduction || 0),
      totalHoursDeduction: parseFloat(summary.totalHoursDeduction || 0),
      totalMedicalLeaveDeduction: parseFloat(summary.totalMedicalLeaveDeduction || 0),
      totalMealAllowanceDeduction: parseFloat(summary.totalMealAllowanceDeduction || 0),
      medicalInsurance: parseFloat(summary.medicalInsurance || 0),
      socialInsurance: parseFloat(summary.socialInsurance || 0),
      shiftType: summary.shiftType || 'administrative',
      deductedDays: parseFloat(summary.deductedDays || 0),
      absentDays: parseFloat(summary.absentDays || 0),
      totalDeductions: parseFloat(summary.totalDeductions || 0),
    });
    setShowEditModal(true);
  };

  const handleEditFinanceChange = (e) => {
    const { name, value } = e.target;
    setEditFinance((prev) => {
      const newValue = value === '' ? 0 : parseFloat(value);
      const updatedFinance = {
        ...prev,
        [name]: isNaN(newValue) ? 0 : Math.max(0, newValue),
      };
      const { netSalary, totalDeductions } = calculateNetSalary(updatedFinance);
      return { ...updatedFinance, netSalary, totalDeductions };
    });
  };

  const handleEditFinanceSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const token = localStorage.getItem('token');
    const payload = {
      violationsTotal: editFinance.violationsTotal || 0,
      violationsDeduction: editFinance.violationsDeduction || 0,
      advancesTotal: editFinance.advancesTotal || 0,
      advancesDeduction: editFinance.advancesDeduction || 0,
      netSalary: editFinance.netSalary || 0,
      deductedDays: editFinance.deductedDays || 0,
    };

    // التحقق من صحة القيم
    if (Object.values(payload).some(value => isNaN(value) || value < 0)) {
      setError('يرجى إدخال قيم رقمية غير سلبية لجميع الحقول.');
      setLoading(false);
      return;
    }
    if (payload.violationsDeduction > payload.violationsTotal) {
      setError('خصم المخالفات لا يمكن أن يتجاوز إجمالي المخالفات.');
      setLoading(false);
      return;
    }
    if (payload.advancesDeduction > payload.advancesTotal) {
      setError('خصم السلف لا يمكن أن يتجاوز إجمالي السلف.');
      setLoading(false);
      return;
    }

    try {
      await axios.patch(
        `${process.env.REACT_APP_API_URL}/api/users/update-finance/${editFinance.id}`,
        payload,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      // تحديث الملخصات محليًا
      setSummaries((prevSummaries) => {
        const updatedSummaries = { ...prevSummaries };
        const summaryKey = editFinance.id;
        if (updatedSummaries[summaryKey]) {
          const currentSummary = updatedSummaries[summaryKey];
          const updatedSummary = {
            ...currentSummary,
            violationsTotal: payload.violationsTotal,
            violationsDeduction: payload.violationsDeduction,
            advancesTotal: payload.advancesTotal,
            advancesDeduction: payload.advancesDeduction,
            netSalary: payload.netSalary,
            totalDeductions: editFinance.totalDeductions,
            deductedDays: payload.deductedDays,
          };
          updatedSummaries[summaryKey] = updatedSummary;
        }
        return updatedSummaries;
      });

      // إعادة جلب البيانات
      if (user.role === 'admin') {
        await handleSearch();
      } else {
        await fetchEmployeeSalaryReport();
      }

      setShowSuccess(true);
      setTimeout(() => {
        setShowSuccess(false);
        setEditFinance(null);
        setShowEditModal(false);
      }, 2000);
    } catch (err) {
      const errorMessage = err.response?.data?.message
        ? err.response.data.message.includes('User validation failed')
          ? 'خطأ في البيانات: تحقق من صحة المدخلات.'
          : err.response.data.message
        : 'حدث خطأ غير متوقع. يرجى المحاولة لاحقًا.';
      setError(errorMessage);
      if (err.response?.status === 401) {
        logout();
        navigate('/login', { replace: true });
      }
    } finally {
      setLoading(false);
    }
  };

  const formatNumber = (value) => {
    return typeof value === 'number' && !isNaN(value) ? value.toFixed(2) : '0.00';
  };

  const exportToExcel = () => {
    const headers = [
      'صافي الراتب',
      'استقطاع السلف',
      'إجمالي السلف',
      'خصم المخالفات',
      'إجمالي المخالفات',
      'إجمالي خصم بدل الوجبة',
      'إجمالي خصم الغياب',
      'إجمالي خصم الساعات',
      ...(Object.values(summaries).some(summary => !['dayStation', 'nightStation'].includes(summary.shiftType)) ? ['إجمالي بدل الجمعة'] : []),
      'إجمالي تعويض الساعات الإضافية',
      'إجمالي ساعات العمل',
      'إجمالي الساعات الإضافية',
      'إجمالي أيام العمل',
      'إجمالي خصم الإجازة المرضية',
      'إجمالي بدل الإجازة',
      'إجمالي الخصومات',
      'أيام الإجازة المرضية',
      'أيام الإجازة الرسمية',
      'أيام الإجازة',
      'أيام الإجازة الأسبوعية',
      'أيام الغياب',
      'أيام الحضور',
      'أيام العمل الأسبوعية',
      'التأمين الاجتماعي',
      'التأمين الطبي',
      'نوع الشيفت',
      'بدل الوجبة',
      'الراتب الأساسي',
      'اسم الموظف',
      'كود الموظف',
      'أيام الخصم',
    ];

    const data = Object.entries(summaries).map(([_, summary]) => {
      const row = [
        formatNumber(summary.netSalary || 0),
        formatNumber(summary.advancesDeduction || 0),
        formatNumber(summary.advancesTotal || 0),
        formatNumber(summary.violationsDeduction || 0),
        formatNumber(summary.violationsTotal || 0),
        formatNumber(summary.totalMealAllowanceDeduction || 0),
        formatNumber(summary.totalAbsentDeduction || 0),
        formatNumber(summary.totalHoursDeduction || 0),
      ];
      if (Object.values(summaries).some(s => !['dayStation', 'nightStation'].includes(s.shiftType))) {
        row.push(formatNumber(summary.totalFridayBonus || 0));
      }
      row.push(
        formatNumber(summary.totalExtraHoursCompensation || 0),
        formatNumber(summary.totalWorkHours || 0),
        formatNumber(summary.totalExtraHours || 0),
        summary.totalWorkDays || 0,
        formatNumber(summary.totalMedicalLeaveDeduction || 0),
        formatNumber(summary.totalLeaveCompensation || 0),
        formatNumber(summary.totalDeductions || 0),
        summary.medicalLeaveDays || 0,
        summary.officialLeaveDays || 0,
        summary.leaveDays || 0,
        summary.weeklyOffDays || 0,
        summary.absentDays || 0,
        summary.presentDays || 0,
        summary.workingDays || '',
        formatNumber(summary.socialInsurance || 0),
        formatNumber(summary.medicalInsurance || 0),
        summary.shiftType === 'administrative' ? 'إداري' : summary.shiftType === 'dayStation' ? 'محطة نهارًا' : summary.shiftType === 'nightStation' ? 'محطة ليلًا' : '24/24',
        formatNumber(summary.mealAllowance || 0),
        formatNumber(summary.baseSalary || 0),
        summary.employeeName || '',
        summary.employeeCode || '',
        formatNumber(summary.deductedDays || 0)
      );
      return row;
    });

    const totals = headers.map((header, index) => {
      if (['كود الموظف', 'اسم الموظف', 'نوع الشيفت', 'أيام العمل الأسبوعية'].includes(header)) {
        return header === 'كود الموظف' ? 'الإجمالي' : '';
      }
      const sum = data.reduce((acc, row) => {
        const value = parseFloat(row[index]);
        return isNaN(value) ? acc : acc + value;
      }, 0);
      return formatNumber(sum);
    });

    data.push(totals);

    const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);

    ws['!cols'] = headers.map(() => ({ wch: 15 }));
    headers.forEach((_, index) => {
      const cell = XLSX.utils.encode_cell({ r: 0, c: index });
      ws[cell].s = {
        font: { bold: true, color: { rgb: 'FFFFFF' } },
        fill: { fgColor: { rgb: '6B7280' } },
        alignment: { horizontal: 'right', vertical: 'center', readingOrder: 2 },
        border: {
          top: { style: 'thin', color: { rgb: '000000' } },
          bottom: { style: 'thin', color: { rgb: '000000' } },
          left: { style: 'thin', color: { rgb: '000000' } },
          right: { style: 'thin', color: { rgb: '000000' } },
        },
      };
    });

    data.forEach((row, rowIndex) => {
      row.forEach((_, colIndex) => {
        const cell = XLSX.utils.encode_cell({ r: rowIndex + 1, c: colIndex });
        ws[cell].s = {
          alignment: { horizontal: 'right', vertical: 'center', readingOrder: 2 },
          border: {
            top: { style: 'thin', color: { rgb: '000000' } },
            bottom: { style: 'thin', color: { rgb: '000000' } },
            left: { style: 'thin', color: { rgb: '000000' } },
            right: { style: 'thin', color: { rgb: '000000' } },
          },
        };
      });
    });

    totals.forEach((_, colIndex) => {
      const cell = XLSX.utils.encode_cell({ r: data.length, c: colIndex });
      ws[cell].s = {
        font: { bold: true },
        fill: { fgColor: { rgb: 'F3E8FF' } },
        alignment: { horizontal: 'right', vertical: 'center', readingOrder: 2 },
        border: {
          top: { style: 'thin', color: { rgb: '000000' } },
          bottom: { style: 'thin', color: { rgb: '000000' } },
          left: { style: 'thin', color: { rgb: '000000' } },
          right: { style: 'thin', color: { rgb: '000000' } },
        },
      };
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Salary Report');
    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { type: 'application/octet-stream' });
    saveAs(blob, `Salary_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const exportToWord = () => {
    const headers = [
      'صافي الراتب',
      'استقطاع السلف',
      'إجمالي السلف',
      'خصم المخالفات',
      'إجمالي المخالفات',
      'إجمالي خصم بدل الوجبة',
      'إجمالي خصم الغياب',
      'إجمالي خصم الساعات',
      ...(Object.values(summaries).some(summary => !['dayStation', 'nightStation'].includes(summary.shiftType)) ? ['إجمالي بدل الجمعة'] : []),
      'إجمالي تعويض الساعات الإضافية',
      'إجمالي ساعات العمل',
      'إجمالي الساعات الإضافية',
      'إجمالي أيام العمل',
      'إجمالي خصم الإجازة المرضية',
      'إجمالي بدل الإجازة',
      'إجمالي الخصومات',
      'أيام الإجازة المرضية',
      'أيام الإجازة الرسمية',
      'أيام الإجازة',
      'أيام الإجازة الأسبوعية',
      'أيام الغياب',
      'أيام الحضور',
      'أيام العمل الأسبوعية',
      'التأمين الاجتماعي',
      'التأمين الطبي',
      'نوع الشيفت',
      'بدل الوجبة',
      'الراتب الأساسي',
      'اسم الموظف',
      'كود الموظف',
      'أيام الخصم',
    ];

    const data = Object.entries(summaries).map(([_, summary]) => {
      const row = [
        formatNumber(summary.netSalary || 0),
        formatNumber(summary.advancesDeduction || 0),
        formatNumber(summary.advancesTotal || 0),
        formatNumber(summary.violationsDeduction || 0),
        formatNumber(summary.violationsTotal || 0),
        formatNumber(summary.totalMealAllowanceDeduction || 0),
        formatNumber(summary.totalAbsentDeduction || 0),
        formatNumber(summary.totalHoursDeduction || 0),
      ];
      if (Object.values(summaries).some(s => !['dayStation', 'nightStation'].includes(s.shiftType))) {
        row.push(formatNumber(summary.totalFridayBonus || 0));
      }
      row.push(
        formatNumber(summary.totalExtraHoursCompensation || 0),
        formatNumber(summary.totalWorkHours || 0),
        formatNumber(summary.totalExtraHours || 0),
        summary.totalWorkDays || 0,
        formatNumber(summary.totalMedicalLeaveDeduction || 0),
        formatNumber(summary.totalLeaveCompensation || 0),
        formatNumber(summary.totalDeductions || 0),
        summary.medicalLeaveDays || 0,
        summary.officialLeaveDays || 0,
        summary.leaveDays || 0,
        summary.weeklyOffDays || 0,
        summary.absentDays || 0,
        summary.presentDays || 0,
        summary.workingDays || '',
        formatNumber(summary.socialInsurance || 0),
        formatNumber(summary.medicalInsurance || 0),
        summary.shiftType === 'administrative' ? 'إداري' : summary.shiftType === 'dayStation' ? 'محطة نهارًا' : summary.shiftType === 'nightStation' ? 'محطة ليلًا' : '24/24',
        formatNumber(summary.mealAllowance || 0),
        formatNumber(summary.baseSalary || 0),
        summary.employeeName || '',
        summary.employeeCode || '',
        formatNumber(summary.deductedDays || 0)
      );
      return row;
    });

    const totals = headers.map((header, index) => {
      if (['كود الموظف', 'اسم الموظف', 'نوع الشيفت', 'أيام العمل الأسبوعية'].includes(header)) {
        return header === 'كود الموظف' ? 'الإجمالي' : '';
      }
      const sum = data.reduce((acc, row) => {
        const value = parseFloat(row[index]);
        return isNaN(value) ? acc : acc + value;
      }, 0);
      return formatNumber(sum);
    });

    const doc = new Document({
      sections: [
        {
          properties: { page: { margin: { left: 720, right: 720, top: 720, bottom: 720 } } },
          children: [
            new Paragraph({
              children: [new TextRun({ text: 'تقرير الراتب', size: 28, bold: true, font: 'Noto Sans Arabic' })],
              alignment: AlignmentType.RIGHT,
              spacing: { after: 200 },
            }),
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              borders: {
                top: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
                bottom: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
                left: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
                right: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
                insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
                insideVertical: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
              },
              rows: [
                new TableRow({
                  children: headers.map(
                    header =>
                      new TableCell({
                        children: [new Paragraph({ children: [new TextRun({ text: header, size: 20, bold: true, font: 'Noto Sans Arabic' })], alignment: AlignmentType.RIGHT })],
                        width: { size: 100 / headers.length, type: WidthType.PERCENTAGE },
                        margins: { top: 50, bottom: 50, left: 50, right: 50 },
                      })
                  ),
                }),
                ...data.map(
                  row =>
                    new TableRow({
                      children: row.map(
                        cell =>
                          new TableCell({
                            children: [new Paragraph({ children: [new TextRun({ text: String(cell), size: 18, font: 'Noto Sans Arabic' })], alignment: AlignmentType.RIGHT })],
                            width: { size: 100 / headers.length, type: WidthType.PERCENTAGE },
                            margins: { top: 50, bottom: 50, left: 50, right: 50 },
                          })
                      ),
                    })
                ),
                new TableRow({
                  children: totals.map(
                    total =>
                      new TableCell({
                        children: [new Paragraph({ children: [new TextRun({ text: String(total), size: 18, bold: true, font: 'Noto Sans Arabic' })], alignment: AlignmentType.RIGHT })],
                        width: { size: 100 / headers.length, type: WidthType.PERCENTAGE },
                        margins: { top: 50, bottom: 50, left: 50, right: 50 },
                      })
                  ),
                }),
              ],
            }),
          ],
        },
      ],
    });

    Packer.toBlob(doc).then(blob => {
      saveAs(blob, `Salary_Report_${new Date().toISOString().split('T')[0]}.docx`);
    });
  };

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-purple-100 py-8 px-4 sm:px-6 lg:px-8 font-noto-sans-arabic flex flex-col items-center">
      <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@400;600;700&display=swap" rel="stylesheet" />
      <AnimatePresence>
        {loading && <LoadingSpinner />}
        {showSuccess && (
          <motion.div
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1, rotate: 360 }}
            exit={{ opacity: 0, scale: 0 }}
            transition={{ duration: 0.8, ease: 'easeInOut' }}
            className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-green-500 text-white p-6 rounded-full shadow-2xl z-50 flex items-center justify-center"
          >
            <CheckCircle className="h-12 w-12" />
          </motion.div>
        )}
        {showEditModal && user.role === 'admin' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              className="bg-white p-6 sm:p-8 rounded-xl shadow-2xl border border-purple-200 w-full max-w-lg"
            >
              <h3 className="text-xl font-bold text-purple-700 mb-6 text-right">تعديل البيانات المالية</h3>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-red-50 text-red-600 p-3 rounded-lg mb-4 text-right text-sm"
                >
                  {error}
                </motion.div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-700 text-sm font-medium mb-2 text-right">
                    كود الموظف
                  </label>
                  <input
                    type="text"
                    value={editFinance.employeeCode}
                    className="w-full px-4 py-2 border border-purple-200 rounded-lg text-right text-sm bg-gray-100 cursor-not-allowed"
                    readOnly
                  />
                </div>
                <div>
                  <label className="block text-gray-700 text-sm font-medium mb-2 text-right">
                    إجمالي المخالفات
                  </label>
                  <input
                    type="number"
                    name="violationsTotal"
                    value={editFinance.violationsTotal}
                    onChange={handleEditFinanceChange}
                    className="w-full px-4 py-2 border border-purple-200 rounded-lg text-right text-sm focus:ring-2 focus:ring-purple-400 focus:border-purple-400 transition-all duration-200 bg-white hover:bg-purple-50"
                    disabled={loading}
                    placeholder="أدخل إجمالي المخالفات"
                    min="0"
                    step="0.01"
                  />
                </div>
                <div>
                  <label className="block text-gray-700 text-sm font-medium mb-2 text-right">
                    خصم المخالفات
                  </label>
                  <input
                    type="number"
                    name="violationsDeduction"
                    value={editFinance.violationsDeduction}
                    onChange={handleEditFinanceChange}
                    className="w-full px-4 py-2 border border-purple-200 rounded-lg text-right text-sm focus:ring-2 focus:ring-purple-400 focus:border-purple-400 transition-all duration-200 bg-white hover:bg-purple-50"
                    disabled={loading}
                    placeholder="أدخل خصم المخالفات"
                    min="0"
                    step="0.01"
                  />
                </div>
                <div>
                  <label className="block text-gray-700 text-sm font-medium mb-2 text-right">
                    إجمالي السلف
                  </label>
                  <input
                    type="number"
                    name="advancesTotal"
                    value={editFinance.advancesTotal}
                    onChange={handleEditFinanceChange}
                    className="w-full px-4 py-2 border border-purple-200 rounded-lg text-right text-sm focus:ring-2 focus:ring-purple-400 focus:border-purple-400 transition-all duration-200 bg-white hover:bg-purple-50"
                    disabled={loading}
                    placeholder="أدخل إجمالي السلف"
                    min="0"
                    step="0.01"
                  />
                </div>
                <div>
                  <label className="block text-gray-700 text-sm font-medium mb-2 text-right">
                    استقطاع السلف
                  </label>
                  <input
                    type="number"
                    name="advancesDeduction"
                    value={editFinance.advancesDeduction}
                    onChange={handleEditFinanceChange}
                    className="w-full px-4 py-2 border border-purple-200 rounded-lg text-right text-sm focus:ring-2 focus:ring-purple-400 focus:border-purple-400 transition-all duration-200 bg-white hover:bg-purple-50"
                    disabled={loading}
                    placeholder="أدخل استقطاع السلف"
                    min="0"
                    step="0.01"
                  />
                </div>
                <div>
                  <label className="block text-gray-700 text-sm font-medium mb-2 text-right">
                    صافي الراتب
                  </label>
                  <input
                    type="number"
                    name="netSalary"
                    value={editFinance.netSalary}
                    className="w-full px-4 py-2 border border-purple-200 rounded-lg text-right text-sm bg-gray-100 cursor-not-allowed"
                    readOnly
                  />
                </div>
                <div>
                  <label className="block text-gray-700 text-sm font-medium mb-2 text-right">
                    أيام الخصم
                  </label>
                  <input
                    type="number"
                    name="deductedDays"
                    value={editFinance.deductedDays}
                    onChange={handleEditFinanceChange}
                    className="w-full px-4 py-2 border border-purple-200 rounded-lg text-right text-sm focus:ring-2 focus:ring-purple-400 focus:border-purple-400 transition-all duration-200 bg-white hover:bg-purple-50"
                    disabled={loading}
                    placeholder="أدخل أيام الخصم"
                    min="0"
                    step="0.01"
                  />
                </div>
                <div className="sm:col-span-2 flex justify-end gap-3">
                  <motion.button
                    type="button"
                    onClick={handleEditFinanceSubmit}
                    disabled={loading}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className={`w-full sm:w-auto bg-purple-600 text-white px-6 py-2 rounded-lg hover:bg-purple-700 transition-all duration-200 text-sm font-medium shadow-md ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    حفظ
                  </motion.button>
                  <motion.button
                    type="button"
                    onClick={() => setShowEditModal(false)}
                    disabled={loading}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className={`w-full sm:w-auto bg-gray-600 text-white px-6 py-2 rounded-lg hover:bg-gray-700 transition-all duration-200 text-sm font-medium shadow-md ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    إلغاء
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="bg-white p-6 sm:p-8 rounded-xl shadow-2xl border border-purple-200 w-full max-w-7xl"
      >
        <h2 className="text-xl sm:text-2xl font-bold text-purple-700 mb-6 text-right">تقرير الراتب</h2>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="bg-red-50 text-red-600 p-3 sm:p-4 rounded-lg mb-6 text-right text-sm"
          >
            {error}
          </motion.div>
        )}
        <div className="space-y-6 sm:space-y-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {user.role === 'admin' && (
              <>
                <div>
                  <label className="block text-gray-700 text-sm font-medium mb-2 text-right">
                    كود الموظف
                  </label>
                  <input
                    type="text"
                    value={employeeCode}
                    onChange={(e) => setEmployeeCode(e.target.value)}
                    className="w-full px-4 py-2 border border-purple-200 rounded-lg text-right text-sm focus:ring-2 focus:ring-purple-400 focus:border-purple-400 transition-all duration-200 bg-white hover:bg-purple-50"
                    disabled={loading}
                    placeholder="أدخل كود الموظف"
                  />
                </div>
                <div>
                  <label className="block text-gray-700 text-sm font-medium mb-2 text-right">
                    نوع الشيفت
                  </label>
                  <select
                    value={shiftType}
                    onChange={(e) => setShiftType(e.target.value)}
                    className="w-full px-4 py-2 border border-purple-200 rounded-lg text-right text-sm focus:ring-2 focus:ring-purple-400 focus:border-purple-400 transition-all duration-200 bg-white hover:bg-purple-50"
                    disabled={loading}
                  >
                    {shiftOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}
            <div>
              <label className="block text-gray-700 text-sm font-medium mb-2 text-right">
                من التاريخ
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-4 py-2 border border-purple-200 rounded-lg text-right text-sm focus:ring-2 focus:ring-purple-400 focus:border-purple-400 transition-all duration-200 bg-white hover:bg-purple-50"
                disabled={loading}
                placeholder="اختر تاريخ البدء"
              />
            </div>
            <div>
              <label className="block text-gray-700 text-sm font-medium mb-2 text-right">
                إلى التاريخ
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-4 py-2 border border-purple-200 rounded-lg text-right text-sm focus:ring-2 focus:ring-purple-400 focus:border-purple-400 transition-all duration-200 bg-white hover:bg-purple-50"
                disabled={loading}
                placeholder="اختر تاريخ الانتهاء"
              />
            </div>
          </div>
          <div className="flex flex-col sm:flex-row justify-end gap-3 sm:gap-4">
            <motion.button
              onClick={handleSearch}
              disabled={loading}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className={`w-full sm:w-auto bg-purple-600 text-white px-4 sm:px-6 py-2 rounded-lg hover:bg-purple-700 transition-all duration-200 text-sm font-medium shadow-md ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              بحث
            </motion.button>
            {user.role === 'admin' && (
              <>
                <motion.button
                  onClick={handleShowAll}
                  disabled={loading}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className={`w-full sm:w-auto bg-purple-600 text-white px-4 sm:px-6 py-2 rounded-lg hover:bg-purple-700 transition-all duration-200 text-sm font-medium shadow-md ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  عرض الكل
                </motion.button>
                <motion.button
                  onClick={exportToExcel}
                  disabled={loading || Object.keys(summaries).length === 0}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className={`w-full sm:w-auto bg-green-600 text-white px-4 sm:px-6 py-2 rounded-lg hover:bg-green-700 transition-all duration-200 text-sm font-medium shadow-md ${loading || Object.keys(summaries).length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  تصدير إلى Excel
                </motion.button>
                <motion.button
                  onClick={exportToWord}
                  disabled={loading || Object.keys(summaries).length === 0}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className={`w-full sm:w-auto bg-purple-600 text-white px-4 sm:px-6 py-2 rounded-lg hover:bg-purple-700 transition-all duration-200 text-sm font-medium shadow-md ${loading || Object.keys(summaries).length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  تصدير إلى Word
                </motion.button>
              </>
            )}
          </div>
          {Object.keys(summaries).length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="overflow-x-auto bg-white rounded-xl border border-purple-200"
            >
              <h3 className="text-lg sm:text-xl font-bold text-purple-700 mb-4 text-right px-4 pt-4">
                {user.role === 'admin' ? 'ملخص تقرير الراتب' : `تقرير راتب ${user.employeeName}`}
              </h3>
              {/* عرض الجدول على الشاشات الكبيرة */}
              <div className="hidden md:block">
                <table className="w-full table-auto border-collapse text-right text-sm">
                  <thead>
                    <tr className="bg-purple-100">
                      <th className="px-3 py-2 font-medium text-purple-700">كود الموظف</th>
                      <th className="px-3 py-2 font-medium text-purple-700">اسم الموظف</th>
                      <th className="px-3 py-2 font-medium text-purple-700">الراتب الأساسي</th>
                      <th className="px-3 py-2 font-medium text-purple-700">أيام العمل الأسبوعية</th>
                      <th className="px-3 py-2 font-medium text-purple-700">بدل الوجبة</th>
                      <th className="px-3 py-2 font-medium text-purple-700">خصم بدل الوجبة</th>
                      <th className="px-3 py-2 font-medium text-purple-700">نوع الشيفت</th>
                      <th className="px-3 py-2 font-medium text-purple-700">التأمين الطبي</th>
                      <th className="px-3 py-2 font-medium text-purple-700">التأمين الاجتماعي</th>
                      <th className="px-3 py-2 font-medium text-purple-700">أيام الحضور</th>
                      <th className="px-3 py-2 font-medium text-purple-700">أيام الغياب</th>
                      <th className="px-3 py-2 font-medium text-purple-700">أيام الإجازة الأسبوعية</th>
                      <th className="px-3 py-2 font-medium text-purple-700">أيام الإجازة</th>
                      <th className="px-3 py-2 font-medium text-purple-700">أيام الإجازة الرسمية</th>
                      <th className="px-3 py-2 font-medium text-purple-700">أيام الإجازة المرضية</th>
                      <th className="px-3 py-2 font-medium text-purple-700">إجمالي الخصومات</th>
                      <th className="px-3 py-2 font-medium text-purple-700">إجمالي بدل الإجازة</th>
                      <th className="px-3 py-2 font-medium text-purple-700">إجمالي خصم الإجازة المرضية</th>
                      <th className="px-3 py-2 font-medium text-purple-700">إجمالي أيام العمل</th>
                      <th className="px-3 py-2 font-medium text-purple-700">إجمالي ساعات العمل</th>
                      {Object.values(summaries).some(summary => summary.shiftType === 'administrative') && (
                        <th className="px-3 py-2 font-medium text-purple-700">إجمالي الساعات الإضافية</th>
                      )}
                      <th className="px-3 py-2 font-medium text-purple-700">إجمالي تعويض الساعات الإضافية</th>
                      {Object.values(summaries).some(summary => !['dayStation', 'nightStation'].includes(summary.shiftType)) && (
                        <th className="px-3 py-2 font-medium text-purple-700">إجمالي بدل الجمعة</th>
                      )}
                      <th className="px-3 py-2 font-medium text-purple-700">إجمالي خصم الساعات</th>
                      <th className="px-3 py-2 font-medium text-purple-700">إجمالي خصم الغياب</th>
                      <th className="px-3 py-2 font-medium text-purple-700">إجمالي المخالفات</th>
                      <th className="px-3 py-2 font-medium text-purple-700">خصم المخالفات</th>
                      <th className="px-3 py-2 font-medium text-purple-700">إجمالي السلف</th>
                      <th className="px-3 py-2 font-medium text-purple-700">استقطاع السلف</th>
                      <th className="px-3 py-2 font-medium text-purple-700">صافي الراتب</th>
                      <th className="px-3 py-2 font-medium text-purple-700">أيام الخصم</th>
                      {user.role === 'admin' && <th className="px-3 py-2 font-medium text-purple-700">الإجراءات</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(summaries).map(([userId, summary], index) => (
                      <motion.tr
                        key={userId}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.1, duration: 0.3 }}
                        className="border-b border-purple-200 hover:bg-purple-50"
                      >
                        <td className="px-3 py-2">{summary.employeeCode || ''}</td>
                        <td className="px-3 py-2">{summary.employeeName || ''}</td>
                        <td className="px-3 py-2">{formatNumber(summary.baseSalary)}</td>
                        <td className="px-3 py-2">{summary.workingDays || ''}</td>
                        <td className="px-3 py-2">{formatNumber(summary.mealAllowance)}</td>
                        <td className="px-3 py-2">{formatNumber(summary.totalMealAllowanceDeduction)}</td>
                        <td className="px-3 py-2">
                          {summary.shiftType === 'administrative' ? 'إداري' :
                           summary.shiftType === 'dayStation' ? 'محطة نهارًا' :
                           summary.shiftType === 'nightStation' ? 'محطة ليلًا' : '24/24'}
                        </td>
                        <td className="px-3 py-2">{formatNumber(summary.medicalInsurance)}</td>
                        <td className="px-3 py-2">{formatNumber(summary.socialInsurance)}</td>
                        <td className="px-3 py-2">{summary.presentDays || 0}</td>
                        <td className="px-3 py-2">{summary.absentDays || 0}</td>
                        <td className="px-3 py-2">{summary.weeklyOffDays || 0}</td>
                        <td className="px-3 py-2">{summary.leaveDays || 0}</td>
                        <td className="px-3 py-2">{summary.officialLeaveDays || 0}</td>
                        <td className="px-3 py-2">{summary.medicalLeaveDays || 0}</td>
                        <td className="px-3 py-2">{formatNumber(summary.totalDeductions)}</td>
                        <td className="px-3 py-2">{formatNumber(summary.totalLeaveCompensation)}</td>
                        <td className="px-3 py-2">{formatNumber(summary.totalMedicalLeaveDeduction)}</td>
                        <td className="px-3 py-2">{summary.totalWorkDays || 0}</td>
                        <td className="px-3 py-2">{formatNumber(summary.totalWorkHours)}</td>
                        {Object.values(summaries).some(summary => summary.shiftType === 'administrative') && (
                          <td className="px-3 py-2">{formatNumber(summary.totalExtraHours)}</td>
                        )}
                        <td className="px-3 py-2">{formatNumber(summary.totalExtraHoursCompensation)}</td>
                        {Object.values(summaries).some(summary => !['dayStation', 'nightStation'].includes(summary.shiftType)) && (
                          <td className="px-3 py-2">{formatNumber(summary.totalFridayBonus)}</td>
                        )}
                        <td className="px-3 py-2">{formatNumber(summary.totalHoursDeduction)}</td>
                        <td className="px-3 py-2">{formatNumber(summary.totalAbsentDeduction)}</td>
                        <td className="px-3 py-2">{formatNumber(summary.violationsTotal)}</td>
                        <td className="px-3 py-2">{formatNumber(summary.violationsDeduction)}</td>
                        <td className="px-3 py-2">{formatNumber(summary.advancesTotal)}</td>
                        <td className="px-3 py-2">{formatNumber(summary.advancesDeduction)}</td>
                        <td className="px-3 py-2">{formatNumber(summary.netSalary)}</td>
                        <td className="px-3 py-2">{formatNumber(summary.deductedDays)}</td>
                        {user.role === 'admin' && (
                          <td className="px-3 py-2">
                            <motion.button
                              onClick={() => handleEditFinance(summary)}
                              whileHover={{ scale: 1.1 }}
                              whileTap={{ scale: 0.9 }}
                              className="text-purple-600 hover:text-purple-700"
                            >
                              <Edit className="h-4 w-4" />
                            </motion.button>
                          </td>
                        )}
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* عرض البطاقات على الشاشات الصغيرة */}
              <div className="md:hidden space-y-4">
                {Object.entries(summaries).map(([userId, summary], index) => (
                  <motion.div
                    key={userId}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1, duration: 0.3 }}
                    className="bg-purple-50 p-4 rounded-lg border border-purple-200"
                  >
                    <div className="grid grid-cols-1 gap-2 text-right text-sm">
                      <div><span className="font-medium text-purple-700">كود الموظف:</span> {summary.employeeCode || ''}</div>
                      <div><span className="font-medium text-purple-700">اسم الموظف:</span> {summary.employeeName || ''}</div>
                      <div><span className="font-medium text-purple-700">الراتب الأساسي:</span> {formatNumber(summary.baseSalary)}</div>
                      <div><span className="font-medium text-purple-700">أيام العمل الأسبوعية:</span> {summary.workingDays || ''}</div>
                      <div><span className="font-medium text-purple-700">بدل الوجبة:</span> {formatNumber(summary.mealAllowance)}</div>
                      <div><span className="font-medium text-purple-700">خصم بدل الوجبة:</span> {formatNumber(summary.totalMealAllowanceDeduction)}</div>
                      <div>
                        <span className="font-medium text-purple-700">نوع الشيفت:</span>{' '}
                        {summary.shiftType === 'administrative'
                          ? 'إداري'
                          : summary.shiftType === 'dayStation'
                          ? 'محطة نهارًا'
                          : summary.shiftType === 'nightStation'
                          ? 'محطة ليلًا'
                          : '24/24'}
                      </div>
                      <div><span className="font-medium text-purple-700">التأمين الطبي:</span> {formatNumber(summary.medicalInsurance)}</div>
                      <div><span className="font-medium text-purple-700">التأمين الاجتماعي:</span> {formatNumber(summary.socialInsurance)}</div>
                      <div><span className="font-medium text-purple-700">أيام الحضور:</span> {summary.presentDays || 0}</div>
                      <div><span className="font-medium text-purple-700">أيام الغياب:</span> {summary.absentDays || 0}</div>
                      <div><span className="font-medium text-purple-700">أيام الإجازة الأسبوعية:</span> {summary.weeklyOffDays || 0}</div>
                      <div><span className="font-medium text-purple-700">أيام الإجازة:</span> {summary.leaveDays || 0}</div>
                      <div><span className="font-medium text-purple-700">أيام الإجازة الرسمية:</span> {summary.officialLeaveDays || 0}</div>
                      <div><span className="font-medium text-purple-700">أيام الإجازة المرضية:</span> {summary.medicalLeaveDays || 0}</div>
                      <div><span className="font-medium text-purple-700">إجمالي الخصومات:</span> {formatNumber(summary.totalDeductions)}</div>
                      <div><span className="font-medium text-purple-700">إجمالي بدل الإجازة:</span> {formatNumber(summary.totalLeaveCompensation)}</div>
                      <div><span className="font-medium text-purple-700">إجمالي خصم الإجازة المرضية:</span> {formatNumber(summary.totalMedicalLeaveDeduction)}</div>
                      <div><span className="font-medium text-purple-700">إجمالي أيام العمل:</span> {summary.totalWorkDays || 0}</div>
                      <div><span className="font-medium text-purple-700">إجمالي ساعات العمل:</span> {formatNumber(summary.totalWorkHours)}</div>
                      {summary.shiftType === 'administrative' && (
                        <div><span className="font-medium text-purple-700">إجمالي الساعات الإضافية:</span> {formatNumber(summary.totalExtraHours)}</div>
                      )}
                      <div><span className="font-medium text-purple-700">إجمالي تعويض الساعات الإضافية:</span> {formatNumber(summary.totalExtraHoursCompensation)}</div>
                      {!['dayStation', 'nightStation'].includes(summary.shiftType) && (
                        <div><span className="font-medium text-purple-700">إجمالي بدل الجمعة:</span> {formatNumber(summary.totalFridayBonus)}</div>
                      )}
                      <div><span className="font-medium text-purple-700">إجمالي خصم الساعات:</span> {formatNumber(summary.totalHoursDeduction)}</div>
                      <div><span className="font-medium text-purple-700">إجمالي خصم الغياب:</span> {formatNumber(summary.totalAbsentDeduction)}</div>
                      <div><span className="font-medium text-purple-700">إجمالي المخالفات:</span> {formatNumber(summary.violationsTotal)}</div>
                      <div><span className="font-medium text-purple-700">خصم المخالفات:</span> {formatNumber(summary.violationsDeduction)}</div>
                      <div><span className="font-medium text-purple-700">إجمالي السلف:</span> {formatNumber(summary.advancesTotal)}</div>
                      <div><span className="font-medium text-purple-700">استقطاع السلف:</span> {formatNumber(summary.advancesDeduction)}</div>
                      <div><span className="font-medium text-purple-700">صافي الراتب:</span> {formatNumber(summary.netSalary)}</div>
                      <div><span className="font-medium text-purple-700">أيام الخصم:</span> {formatNumber(summary.deductedDays)}</div>
                      {user.role === 'admin' && (
                        <div>
                          <motion.button
                            onClick={() => handleEditFinance(summary)}
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            className="text-purple-600 hover:text-purple-700 flex items-center gap-2"
                          >
                            <Edit className="h-4 w-4" /> تعديل
                          </motion.button>
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
          {Object.keys(summaries).length === 0 && !loading && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="bg-purple-50 p-4 rounded-lg border border-purple-200 text-center text-sm text-gray-600"
            >
              لا توجد بيانات لعرضها. يرجى إجراء بحث أو التحقق من معايير البحث.
            </motion.div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default SalaryReport;
