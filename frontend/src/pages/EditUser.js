import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { AuthContext } from '../components/AuthProvider';
import { Trash2, Edit2, Search, Plus, Eye, EyeOff } from 'lucide-react';
import LoadingSpinner from '../components/LoadingSpinner';
import SuccessCheckmark from '../components/SuccessCheckmark';

const EditUser = () => {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const [searchCode, setSearchCode] = useState('');
  const [users, setUsers] = useState([]);
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({
    code: '',
    password: '',
    employeeName: '',
    department: '',
    baseSalary: '0.00',
    baseBonus: '0.00',
    bonusPercentage: '0.00',
    medicalInsurance: '0.00',
    socialInsurance: '0.00',
    mealAllowance: '0.00',
    workingDays: '5',
    shiftType: 'administrative',
    annualLeaveBalance: '21',
    monthlyLateAllowance: '120',
    netSalary: '0.00',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);
  const [bulkUpdateType, setBulkUpdateType] = useState(null);
  const [bulkUpdateData, setBulkUpdateData] = useState({
    percentage: '',
    monthlyLateAllowance: '',
    annualLeaveBalance: '',
    baseBonus: '',
    medicalInsurance: '',
    socialInsurance: '',
    shiftType: '',
    excludedUsers: [],
  });

  useEffect(() => {
    if (!user || user.role !== 'admin') {
      navigate('/login');
      return;
    }
    handleShowAll();
  }, [user, navigate]);

  const handleSearch = async () => {
    setError('');
    setLoading(true);
    try {
      const response = await axios.get(
        `${process.env.REACT_APP_API_URL}/api/users${searchCode ? `?code=${searchCode}` : ''}`,
        {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        }
      );
      setUsers(response.data.users);
      setFilteredUsers(response.data.users);
    } catch (err) {
      setError(`خطأ أثناء البحث: ${err.response?.data?.message || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleShowAll = async () => {
    setSearchCode('');
    setError('');
    setLoading(true);
    try {
      const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/users`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      setUsers(response.data.users);
      setFilteredUsers(response.data.users);
    } catch (err) {
      setError(`خطأ أثناء جلب جميع المستخدمين: ${err.response?.data?.message || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (user) => {
    setSelectedUser(user);
    setForm({
      code: user.code || '',
      password: '',
      employeeName: user.employeeName || '',
      department: user.department || '',
      baseSalary: (user.baseSalary != null ? user.baseSalary : 0).toFixed(2),
      baseBonus: (user.baseBonus != null ? user.baseBonus : 0).toFixed(2),
      bonusPercentage: (user.bonusPercentage != null ? user.bonusPercentage : 0).toFixed(2),
      medicalInsurance: (user.medicalInsurance != null ? user.medicalInsurance : 0).toFixed(2),
      socialInsurance: (user.socialInsurance != null ? user.socialInsurance : 0).toFixed(2),
      mealAllowance: (user.mealAllowance != null ? user.mealAllowance : 0).toFixed(2),
      workingDays: user.workingDays || '5',
      shiftType: user.shiftType || 'administrative',
      annualLeaveBalance: (user.annualLeaveBalance != null ? user.annualLeaveBalance : 21).toString(),
      monthlyLateAllowance: (user.monthlyLateAllowance != null ? user.monthlyLateAllowance : 120).toString(),
      netSalary: (user.netSalary != null ? user.netSalary : 0).toFixed(2),
    });
  };

  const handleDelete = async (userId) => {
    setError('');
    setLoading(true);
    try {
      await axios.delete(`${process.env.REACT_APP_API_URL}/api/users/${userId}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      setUsers(users.filter((u) => u._id !== userId));
      setFilteredUsers(filteredUsers.filter((u) => u._id !== userId));
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 2000);
    } catch (err) {
      setError(`خطأ أثناء الحذف: ${err.response?.data?.message || err.message}`);
    } finally {
      setLoading(false);
      setShowDeleteConfirm(null);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => {
      const updatedForm = { ...prev, [name]: name === 'password' ? value.trim().replace(/[^\w\s@#$%^&*()]/g, '') : value };
      const baseSalary = parseFloat(updatedForm.baseSalary || 0);
      const baseBonus = parseFloat(updatedForm.baseBonus || 0);
      const bonusPercentage = parseFloat(updatedForm.bonusPercentage || 0);
      const mealAllowance = parseFloat(updatedForm.mealAllowance || 0);
      const medicalInsurance = parseFloat(updatedForm.medicalInsurance || 0);
      const socialInsurance = parseFloat(updatedForm.socialInsurance || 0);
      updatedForm.netSalary = (
        baseSalary +
        (baseBonus * bonusPercentage) / 100 +
        mealAllowance -
        medicalInsurance -
        socialInsurance
      ).toFixed(2);
      return updatedForm;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const token = localStorage.getItem('token');
    if (!token) {
      setError('التوكن غير موجود. يرجى تسجيل الدخول مرة أخرى');
      setLoading(false);
      navigate('/login');
      return;
    }

    if (!selectedUser?._id) {
      setError('لم يتم تحديد مستخدم للتعديل');
      setLoading(false);
      return;
    }

    if (form.password && form.password.length < 6) {
      setError('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
      setLoading(false);
      return;
    }

    if (form.password && !/^[a-zA-Z0-9@#$%^&*()]+$/.test(form.password)) {
      setError('كلمة المرور تحتوي على أحرف غير صالحة');
      setLoading(false);
      return;
    }

    if (parseFloat(form.baseSalary) < 0) {
      setError('الراتب الأساسي لا يمكن أن يكون سالبًا');
      setLoading(false);
      return;
    }

    try {
      const updateData = {
        ...form,
        baseSalary: parseFloat(form.baseSalary),
        baseBonus: parseFloat(form.baseBonus),
        bonusPercentage: parseFloat(form.bonusPercentage),
        medicalInsurance: parseFloat(form.medicalInsurance),
        socialInsurance: parseFloat(form.socialInsurance),
        mealAllowance: parseFloat(form.mealAllowance),
        annualLeaveBalance: parseInt(form.annualLeaveBalance),
        monthlyLateAllowance: parseInt(form.monthlyLateAllowance),
        netSalary: parseFloat(form.netSalary),
        updatedBy: user._id,
      };

      if (!form.password) {
        delete updateData.password;
      }

      await axios.patch(
        `${process.env.REACT_APP_API_URL}/api/users/${selectedUser._id}`,
        updateData,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      setShowSuccess(true);
      setTimeout(() => {
        setShowSuccess(false);
        setSelectedUser(null);
        handleShowAll();
      }, 2000);
    } catch (err) {
      setError(`خطأ أثناء تحديث الحساب: ${err.response?.data?.message || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleBulkUpdateChange = (e) => {
    const { name, value } = e.target;
    setBulkUpdateData((prev) => ({ ...prev, [name]: value }));
  };

  const handleExcludeUser = (userId) => {
    setBulkUpdateData((prev) => ({
      ...prev,
      excludedUsers: prev.excludedUsers.includes(userId)
        ? prev.excludedUsers.filter((id) => id !== userId)
        : [...prev.excludedUsers, userId],
    }));
  };

  const handleBulkUpdateSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const token = localStorage.getItem('token');
    if (!token) {
      setError('التوكن غير موجود. يرجى تسجيل الدخول مرة أخرى');
      setLoading(false);
      navigate('/login');
      return;
    }

    try {
      const payload = {
        type: bulkUpdateType,
        percentage: parseFloat(bulkUpdateData.percentage) || 0,
        monthlyLateAllowance: parseInt(bulkUpdateData.monthlyLateAllowance) || 0,
        annualLeaveBalance: parseInt(bulkUpdateData.annualLeaveBalance) || 0,
        baseBonus: parseFloat(bulkUpdateData.baseBonus) || 0,
        medicalInsurance: parseFloat(bulkUpdateData.medicalInsurance) || 0,
        socialInsurance: parseFloat(bulkUpdateData.socialInsurance) || 0,
        shiftType: bulkUpdateData.shiftType || '',
        excludedUsers: bulkUpdateData.excludedUsers,
      };

      await axios.post(
        `${process.env.REACT_APP_API_URL}/api/users/bulk-update`,
        payload,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      setShowSuccess(true);
      setTimeout(() => {
        setShowSuccess(false);
        setBulkUpdateType(null);
        setBulkUpdateData({
          percentage: '',
          monthlyLateAllowance: '',
          annualLeaveBalance: '',
          baseBonus: '',
          medicalInsurance: '',
          socialInsurance: '',
          shiftType: '',
          excludedUsers: [],
        });
        handleShowAll();
      }, 2000);
    } catch (err) {
      setError(`خطأ أثناء التعديل الجماعي: ${err.response?.data?.message || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const formatNumber = (value) => {
    return typeof value === 'number' ? value.toFixed(2) : '0.00';
  };

  if (!user || user.role !== 'admin') {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-purple-100 py-12 px-4 sm:px-6 lg:px-8 font-noto-sans-arabic flex items-center justify-center">
      <AnimatePresence>
        {loading && <LoadingSpinner />}
        {showSuccess && <SuccessCheckmark onComplete={() => setShowSuccess(false)} />}
        {showDeleteConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/20 flex items-center justify-center z-50"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              className="bg-white p-6 rounded-xl shadow-2xl border border-purple-200 text-right max-w-md w-full"
            >
              <h3 className="text-xl font-bold text-purple-700 mb-4">
                تأكيد الحذف
              </h3>
              <p className="text-sm text-gray-600 mb-6">
                هل أنت متأكد من حذف المستخدم {showDeleteConfirm.employeeName}؟
              </p>
              <div className="flex justify-end gap-3">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => handleDelete(showDeleteConfirm._id)}
                  className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-all duration-200 text-sm font-medium"
                >
                  حذف
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setShowDeleteConfirm(null)}
                  className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-all duration-200 text-sm font-medium"
                >
                  إلغاء
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
        {bulkUpdateType && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/20 flex items-center justify-center z-50"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              className="bg-white p-8 rounded-xl shadow-2xl border border-purple-200 text-right max-w-4xl w-full"
            >
              <h3 className="text-xl font-bold text-purple-700 mb-6">
                {bulkUpdateType === 'baseSalary' && 'زيادة نسبة الراتب الأساسي'}
                {bulkUpdateType === 'monthlyLateAllowance' && 'تعديل دقائق التأخير الشهري'}
                {bulkUpdateType === 'annualLeaveBalance' && 'تعديل رصيد الإجازة السنوية'}
                {bulkUpdateType === 'baseBonus' && 'تعديل الحافز الأساسي'}
                {bulkUpdateType === 'medicalInsurance' && 'تعديل التأمين الطبي'}
                {bulkUpdateType === 'socialInsurance' && 'تعديل التأمين الاجتماعي'}
              </h3>
              <form onSubmit={handleBulkUpdateSubmit}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  {bulkUpdateType === 'baseSalary' && (
                    <div>
                      <label className="block text-gray-700 text-sm font-medium mb-2 text-right">
                        النسبة المئوية (%)
                      </label>
                      <input
                        type="number"
                        name="percentage"
                        value={bulkUpdateData.percentage}
                        onChange={handleBulkUpdateChange}
                        className="w-full px-4 py-2 border border-purple-200 rounded-lg text-right text-sm focus:ring-2 focus:ring-purple-400 focus:border-purple-400 transition-all duration-200 bg-white hover:bg-purple-50"
                        min="0"
                        step="0.01"
                        required
                        disabled={loading}
                        placeholder="أدخل النسبة المئوية"
                      />
                    </div>
                  )}
                  {['monthlyLateAllowance', 'annualLeaveBalance', 'baseBonus', 'medicalInsurance', 'socialInsurance'].includes(bulkUpdateType) && (
                    <div>
                      <label className="block text-gray-700 text-sm font-medium mb-2 text-right">
                        القيمة الجديدة
                      </label>
                      <input
                        type="number"
                        name={bulkUpdateType}
                        value={bulkUpdateData[bulkUpdateType]}
                        onChange={handleBulkUpdateChange}
                        className="w-full px-4 py-2 border border-purple-200 rounded-lg text-right text-sm focus:ring-2 focus:ring-purple-400 focus:border-purple-400 transition-all duration-200 bg-white hover:bg-purple-50"
                        min="0"
                        step={['baseBonus', 'medicalInsurance', 'socialInsurance'].includes(bulkUpdateType) ? '0.01' : '1'}
                        required
                        disabled={loading}
                        placeholder="أدخل القيمة الجديدة"
                      />
                    </div>
                  )}
                  <div>
                    <label className="block text-gray-700 text-sm font-medium mb-2 text-right">
                      نوع الشيفت (اختياري)
                    </label>
                    <select
                      name="shiftType"
                      value={bulkUpdateData.shiftType}
                      onChange={handleBulkUpdateChange}
                      className="w-full px-4 py-2 border border-purple-200 rounded-lg text-right text-sm focus:ring-2 focus:ring-purple-400 focus:border-purple-400 transition-all duration-200 bg-white hover:bg-purple-50"
                      disabled={loading}
                    >
                      <option value="">الجميع</option>
                      <option value="administrative">إداري</option>
                      <option value="dayStation">محطة نهارًا</option>
                      <option value="nightStation">محطة ليلًا</option>
                      <option value="24/24">24/24</option>
                    </select>
                  </div>
                </div>
                <div className="mb-6">
                  <h4 className="text-sm font-medium text-gray-700 mb-3 text-right">
                    استثناء الموظفين
                  </h4>
                  <div className="max-h-64 overflow-y-auto rounded-lg border border-purple-200 bg-white">
                    <table className="w-full text-right">
                      <thead>
                        <tr className="bg-purple-100 sticky top-0">
                          <th className="p-3 text-sm font-medium">استثناء</th>
                          <th className="p-3 text-sm font-medium">كود الموظف</th>
                          <th className="p-3 text-sm font-medium">الاسم</th>
                          <th className="p-3 text-sm font-medium">القسم</th>
                          <th className="p-3 text-sm font-medium">نوع الشيفت</th>
                        </tr>
                      </thead>
                      <tbody>
                        {users.map((u) => (
                          <tr key={u._id} className="border-b hover:bg-purple-50">
                            <td className="p-3">
                              <input
                                type="checkbox"
                                checked={bulkUpdateData.excludedUsers.includes(u._id)}
                                onChange={() => handleExcludeUser(u._id)}
                                className="h-4 w-4 text-purple-400 rounded focus:ring-purple-400"
                              />
                            </td>
                            <td className="p-3 text-sm">{u.code || '-'}</td>
                            <td className="p-3 text-sm">{u.employeeName || '-'}</td>
                            <td className="p-3 text-sm">{u.department || '-'}</td>
                            <td className="p-3 text-sm">
                              {u.shiftType === 'administrative' ? 'إداري' :
                               u.shiftType === 'dayStation' ? 'محطة نهارًا' :
                               u.shiftType === 'nightStation' ? 'محطة ليلًا' : 
                               u.shiftType === '24/24' ? '24/24' : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="flex justify-end gap-3">
                  <motion.button
                    type="submit"
                    disabled={loading}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className={`bg-purple-600 text-white px-6 py-2 rounded-lg hover:bg-purple-700 transition-all duration-200 text-sm font-medium shadow-md ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    تطبيق التعديلات
                  </motion.button>
                  <motion.button
                    type="button"
                    onClick={() => setBulkUpdateType(null)}
                    disabled={loading}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className={`bg-gray-600 text-white px-6 py-2 rounded-lg hover:bg-gray-700 transition-all duration-200 text-sm font-medium shadow-md ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    إلغاء
                  </motion.button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="bg-white p-8 rounded-xl shadow-2xl border border-purple-200 max-w-7xl mx-auto"
      >
        <h2 className="text-2xl font-bold text-purple-700 mb-6 text-right">
          إدارة الموظفين
        </h2>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="bg-red-50 text-red-600 p-4 rounded-lg mb-6 text-right text-sm font-medium"
          >
            {error}
          </motion.div>
        )}
        <div className="flex flex-wrap gap-4 mb-8">
          {[
            { type: 'baseSalary', label: 'زيادة نسبة الراتب الأساسي' },
            { type: 'monthlyLateAllowance', label: 'تعديل دقائق التأخير الشهري' },
            { type: 'annualLeaveBalance', label: 'تعديل رصيد الإجازة السنوية' },
            { type: 'baseBonus', label: 'تعديل الحافز الأساسي' },
            { type: 'medicalInsurance', label: 'تعديل التأمين الطبي' },
            { type: 'socialInsurance', label: 'تعديل التأمين الاجتماعي' },
          ].map(({ type, label }) => (
            <motion.button
              key={type}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setBulkUpdateType(type)}
              className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-all duration-200 text-sm font-medium flex items-center gap-2 shadow-md"
            >
              <Plus className="h-4 w-4" />
              {label}
            </motion.button>
          ))}
        </div>
        {!selectedUser ? (
          <div>
            <div className="flex flex-col sm:flex-row gap-4 mb-8">
              <div className="flex-1">
                <label className="block text-gray-700 text-sm font-medium mb-2 text-right">
                  كود الموظف
                </label>
                <input
                  type="text"
                  value={searchCode}
                  onChange={(e) => setSearchCode(e.target.value)}
                  className="w-full px-4 py-2 border border-purple-200 rounded-lg text-right text-sm focus:ring-2 focus:ring-purple-400 focus:border-purple-400 transition-all duration-200 bg-white hover:bg-purple-50"
                  placeholder="أدخل كود الموظف"
                  disabled={loading}
                />
              </div>
              <div className="flex gap-3 items-end">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleSearch}
                  className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-all duration-200 text-sm font-medium flex items-center gap-2 shadow-md"
                  disabled={loading}
                >
                  <Search className="h-4 w-4" />
                  بحث
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleShowAll}
                  className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-all duration-200 text-sm font-medium shadow-md"
                  disabled={loading}
                >
                  عرض الكل
                </motion.button>
              </div>
            </div>
            {filteredUsers.length > 0 && (
              <div className="overflow-x-auto rounded-lg border border-purple-200 bg-white">
                <table className="w-full text-right">
                  <thead>
                    <tr className="bg-purple-100">
                      <th className="p-3 text-sm font-medium">كود الموظف</th>
                      <th className="p-3 text-sm font-medium">الاسم</th>
                      <th className="p-3 text-sm font-medium">القسم</th>
                      <th className="p-3 text-sm font-medium">الراتب الأساسي</th>
                      <th className="p-3 text-sm font-medium">الحافز الأساسي</th>
                      <th className="p-3 text-sm font-medium">نسبة الحافز (%)</th>
                      <th className="p-3 text-sm font-medium">التأمين الطبي</th>
                      <th className="p-3 text-sm font-medium">التأمين الاجتماعي</th>
                      <th className="p-3 text-sm font-medium">بدل وجبة</th>
                      <th className="p-3 text-sm font-medium">أيام العمل</th>
                      <th className="p-3 text-sm font-medium">نوع الشيفت</th>
                      <th className="p-3 text-sm font-medium">رصيد الإجازة</th>
                      <th className="p-3 text-sm font-medium">دقائق التأخير</th>
                      <th className="p-3 text-sm font-medium">الصافي</th>
                      <th className="p-3 text-sm font-medium">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((u) => (
                      <tr key={u._id} className="border-b hover:bg-purple-50">
                        <td className="p-3 text-sm">{u.code || '-'}</td>
                        <td className="p-3 text-sm">{u.employeeName || '-'}</td>
                        <td className="p-3 text-sm">{u.department || '-'}</td>
                        <td className="p-3 text-sm">{formatNumber(u.baseSalary)}</td>
                        <td className="p-3 text-sm">{formatNumber(u.baseBonus)}</td>
                        <td className="p-3 text-sm">{formatNumber(u.bonusPercentage)}</td>
                        <td className="p-3 text-sm">{formatNumber(u.medicalInsurance)}</td>
                        <td className="p-3 text-sm">{formatNumber(u.socialInsurance)}</td>
                        <td className="p-3 text-sm">{formatNumber(u.mealAllowance)}</td>
                        <td className="p-3 text-sm">{u.workingDays === '5' ? '5 أيام' : u.workingDays === '6' ? '6 أيام' : '-'}</td>
                        <td className="p-3 text-sm">
                          {u.shiftType === 'administrative' ? 'إداري' :
                           u.shiftType === 'dayStation' ? 'محطة نهارًا' :
                           u.shiftType === 'nightStation' ? 'محطة ليلًا' : 
                           u.shiftType === '24/24' ? '24/24' : '-'}
                        </td>
                        <td className="p-3 text-sm">{u.annualLeaveBalance != null ? u.annualLeaveBalance : '-'}</td>
                        <td className="p-3 text-sm">{u.monthlyLateAllowance != null ? u.monthlyLateAllowance : '-'}</td>
                        <td className="p-3 text-sm">{formatNumber(u.netSalary)}</td>
                        <td className="p-3 text-sm flex gap-2">
                          <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => handleEdit(u)}
                            className="bg-purple-600 text-white px-3 py-2 rounded-lg hover:bg-purple-700 transition-all duration-200"
                          >
                            <Edit2 className="h-4 w-4" />
                          </motion.button>
                          <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => setShowDeleteConfirm(u)}
                            className="bg-red-600 text-white px-3 py-2 rounded-lg hover:bg-red-700 transition-all duration-200"
                          >
                            <Trash2 className="h-4 w-4" />
                          </motion.button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[
              { name: 'code', label: 'كود الموظف', type: 'text', required: true, placeholder: 'أدخل كود الموظف' },
              { 
                name: 'password', 
                label: 'كلمة المرور (اتركها فارغة لعدم التغيير)', 
                type: showPassword ? 'text' : 'password',
                placeholder: 'أدخل كلمة المرور',
                extra: (
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute left-2 top-2 text-gray-600"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                )
              },
              { name: 'employeeName', label: 'الاسم الكامل', type: 'text', required: true, placeholder: 'أدخل الاسم الكامل' },
              { name: 'department', label: 'القسم', type: 'text', required: true, placeholder: 'أدخل القسم' },
              { name: 'baseSalary', label: 'الراتب الأساسي', type: 'number', min: '0', step: '0.01', required: true, placeholder: 'أدخل الراتب الأساسي' },
              { name: 'baseBonus', label: 'الحافز الأساسي', type: 'number', min: '0', step: '0.01', placeholder: 'أدخل الحافز الأساسي' },
              { name: 'bonusPercentage', label: 'نسبة الحافز (%)', type: 'number', min: '0', max: '100', step: '0.01', placeholder: 'أدخل نسبة الحافز' },
              { name: 'medicalInsurance', label: 'التأمين الطبي', type: 'number', min: '0', step: '0.01', placeholder: 'أدخل التأمين الطبي' },
              { name: 'socialInsurance', label: 'التأمين الاجتماعي', type: 'number', min: '0', step: '0.01', placeholder: 'أدخل التأمين الاجتماعي' },
              { name: 'mealAllowance', label: 'بدل وجبة', type: 'number', min: '0', step: '0.01', placeholder: 'أدخل بدل الوجبة' },
              { name: 'workingDays', label: 'عدد أيام العمل', type: 'select', options: [
                { value: '5', label: '5 أيام (الجمعة والسبت إجازة)' },
                { value: '6', label: '6 أيام (الجمعة إجازة)' },
              ]},
              { name: 'shiftType', label: 'نوع الشيفت', type: 'select', options: [
                { value: 'administrative', label: 'إداري' },
                { value: 'dayStation', label: 'محطة نهارًا' },
                { value: 'nightStation', label: 'محطة ليلًا' },
                { value: '24/24', label: '24/24' },
              ]},
              { name: 'annualLeaveBalance', label: 'رصيد الإجازة السنوية', type: 'number', min: '0', placeholder: 'أدخل رصيد الإجازة' },
              { name: 'monthlyLateAllowance', label: 'رصيد دقائق التأخير الشهري', type: 'number', min: '0', placeholder: 'أدخل رصيد دقائق التأخير' },
              { name: 'netSalary', label: 'صافي الراتب', type: 'text', readOnly: true },
            ].map((field) => (
              <div key={field.name} className="relative">
                <label className="block text-gray-700 text-sm font-medium mb-2 text-right">
                  {field.label}
                </label>
                {field.type === 'select' ? (
                  <select
                    name={field.name}
                    value={form[field.name]}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-purple-200 rounded-lg text-right text-sm focus:ring-2 focus:ring-purple-400 focus:border-purple-400 transition-all duration-200 bg-white hover:bg-purple-50"
                    disabled={loading}
                  >
                    {field.options.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                ) : (
                  <>
                    <input
                      type={field.type}
                      name={field.name}
                      value={form[field.name]}
                      onChange={handleChange}
                      className={`w-full px-4 py-2 border border-purple-200 rounded-lg text-right text-sm focus:ring-2 focus:ring-purple-400 focus:border-purple-400 transition-all duration-200 bg-white ${field.readOnly ? 'cursor-not-allowed bg-gray-100' : 'hover:bg-purple-50'}`}
                      min={field.min}
                      max={field.max}
                      step={field.step}
                      required={field.required}
                      readOnly={field.readOnly}
                      disabled={loading}
                      placeholder={field.placeholder}
                    />
                    {field.extra && field.extra}
                  </>
                )}
              </div>
            ))}
            <div className="md:col-span-2 flex justify-end gap-3">
              <motion.button
                type="submit"
                disabled={loading}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className={`w-full md:w-auto bg-purple-600 text-white px-6 py-2 rounded-lg hover:bg-purple-700 transition-all duration-200 text-sm font-medium shadow-md ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {loading ? 'جارٍ الحفظ...' : 'حفظ التغييرات'}
              </motion.button>
              <motion.button
                type="button"
                onClick={() => setSelectedUser(null)}
                disabled={loading}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className={`w-full md:w-auto bg-gray-600 text-white px-6 py-2 rounded-lg hover:bg-gray-700 transition-all duration-200 text-sm font-medium shadow-md ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                إلغاء
              </motion.button>
            </div>
          </form>
        )}
      </motion.div>
    </div>
  );
};

export default EditUser;
