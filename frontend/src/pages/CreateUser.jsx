import React, { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { AuthContext } from '../components/AuthProvider';
import LoadingSpinner from '../components/LoadingSpinner';
import SuccessCheckmark from '../components/SuccessCheckmark';

const CreateUser = () => {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
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
    mealAllowance: '500.00',
    workingDays: '5',
    shiftType: 'administrative',
    annualLeaveBalance: '21',
    monthlyLateAllowance: '120',
    netSalary: '0.00',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => {
      const cleanedValue = name === 'password' ? value.trim().replace(/[^\w\s@#$%^&*()]/g, '') : value;
      const updatedForm = { ...prev, [name]: cleanedValue };
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

    const trimmedPassword = form.password.trim();
    if (trimmedPassword.length < 6) {
      setError('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
      setLoading(false);
      return;
    }

    if (!/^[a-zA-Z0-9@#$%^&*()]+$/.test(trimmedPassword)) {
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
      await axios.post(
        `${process.env.REACT_APP_API_URL}/api/users`,
        {
          ...form,
          password: trimmedPassword,
          baseSalary: parseFloat(form.baseSalary),
          baseBonus: parseFloat(form.baseBonus),
          bonusPercentage: parseFloat(form.bonusPercentage),
          medicalInsurance: parseFloat(form.medicalInsurance),
          socialInsurance: parseFloat(form.socialInsurance),
          mealAllowance: parseFloat(form.mealAllowance),
          annualLeaveBalance: parseInt(form.annualLeaveBalance),
          monthlyLateAllowance: parseInt(form.monthlyLateAllowance),
          netSalary: parseFloat(form.netSalary),
          createdBy: user._id,
        },
        {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        }
      );
      setShowSuccess(true);
      setTimeout(() => {
        setShowSuccess(false);
        navigate('/dashboard');
      }, 2000);
    } catch (err) {
      setError(`خطأ أثناء إنشاء الحساب: ${err.response?.data?.message || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (!user || user.role !== 'admin') {
    navigate('/login');
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-purple-100 py-12 px-4 sm:px-6 lg:px-8 font-noto-sans-arabic flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="bg-white p-8 rounded-xl shadow-2xl border border-purple-200 max-w-3xl w-full"
      >
        <h2 className="text-2xl font-bold text-purple-700 mb-6 text-right">
          إنشاء حساب موظف جديد
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
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <label className="block text-gray-700 text-sm font-medium mb-2 text-right">
                كود الموظف
              </label>
              <input
                type="text"
                name="code"
                value={form.code}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-purple-200 rounded-lg text-right text-sm focus:ring-2 focus:ring-purple-400 focus:border-purple-400 transition-all duration-200 bg-white hover:bg-purple-50"
                required
                disabled={loading}
                placeholder="أدخل كود الموظف"
              />
            </div>
            <div>
              <label className="block text-gray-700 text-sm font-medium mb-2 text-right">
                كلمة المرور
              </label>
              <input
                type="password"
                name="password"
                value={form.password}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-purple-200 rounded-lg text-right text-sm focus:ring-2 focus:ring-purple-400 focus:border-purple-400 transition-all duration-200 bg-white hover:bg-purple-50"
                required
                disabled={loading}
                placeholder="أدخل كلمة المرور"
              />
            </div>
            <div>
              <label className="block text-gray-700 text-sm font-medium mb-2 text-right">
                الاسم الكامل
              </label>
              <input
                type="text"
                name="employeeName"
                value={form.employeeName}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-purple-200 rounded-lg text-right text-sm focus:ring-2 focus:ring-purple-400 focus:border-purple-400 transition-all duration-200 bg-white hover:bg-purple-50"
                required
                disabled={loading}
                placeholder="أدخل الاسم الكامل"
              />
            </div>
            <div>
              <label className="block text-gray-700 text-sm font-medium mb-2 text-right">
                القسم
              </label>
              <input
                type="text"
                name="department"
                value={form.department}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-purple-200 rounded-lg text-right text-sm focus:ring-2 focus:ring-purple-400 focus:border-purple-400 transition-all duration-200 bg-white hover:bg-purple-50"
                required
                disabled={loading}
                placeholder="أدخل القسم"
              />
            </div>
            <div>
              <label className="block text-gray-700 text-sm font-medium mb-2 text-right">
                الراتب الأساسي
              </label>
              <input
                type="number"
                name="baseSalary"
                value={form.baseSalary}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-purple-200 rounded-lg text-right text-sm focus:ring-2 focus:ring-purple-400 focus:border-purple-400 transition-all duration-200 bg-white hover:bg-purple-50"
                min="0"
                step="0.01"
                required
                disabled={loading}
                placeholder="أدخل الراتب الأساسي"
              />
            </div>
            <div>
              <label className="block text-gray-700 text-sm font-medium mb-2 text-right">
                الحافز الأساسي
              </label>
              <input
                type="number"
                name="baseBonus"
                value={form.baseBonus}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-purple-200 rounded-lg text-right text-sm focus:ring-2 focus:ring-purple-400 focus:border-purple-400 transition-all duration-200 bg-white hover:bg-purple-50"
                min="0"
                step="0.01"
                disabled={loading}
                placeholder="أدخل الحافز الأساسي"
              />
            </div>
            <div>
              <label className="block text-gray-700 text-sm font-medium mb-2 text-right">
                نسبة الحافز (%)
              </label>
              <input
                type="number"
                name="bonusPercentage"
                value={form.bonusPercentage}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-purple-200 rounded-lg text-right text-sm focus:ring-2 focus:ring-purple-400 focus:border-purple-400 transition-all duration-200 bg-white hover:bg-purple-50"
                min="0"
                max="100"
                step="0.01"
                disabled={loading}
                placeholder="أدخل نسبة الحافز"
              />
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-gray-700 text-sm font-medium mb-2 text-right">
                التأمين الطبي
              </label>
              <input
                type="number"
                name="medicalInsurance"
                value={form.medicalInsurance}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-purple-200 rounded-lg text-right text-sm focus:ring-2 focus:ring-purple-400 focus:border-purple-400 transition-all duration-200 bg-white hover:bg-purple-50"
                min="0"
                step="0.01"
                disabled={loading}
                placeholder="أدخل التأمين الطبي"
              />
            </div>
            <div>
              <label className="block text-gray-700 text-sm font-medium mb-2 text-right">
                التأمين الاجتماعي
              </label>
              <input
                type="number"
                name="socialInsurance"
                value={form.socialInsurance}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-purple-200 rounded-lg text-right text-sm focus:ring-2 focus:ring-purple-400 focus:border-purple-400 transition-all duration-200 bg-white hover:bg-purple-50"
                min="0"
                step="0.01"
                disabled={loading}
                placeholder="أدخل التأمين الاجتماعي"
              />
            </div>
            <div>
              <label className="block text-gray-700 text-sm font-medium mb-2 text-right">
                بدل الوجبة
              </label>
              <input
                type="number"
                name="mealAllowance"
                value={form.mealAllowance}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-purple-200 rounded-lg text-right text-sm focus:ring-2 focus:ring-purple-400 focus:border-purple-400 transition-all duration-200 bg-white hover:bg-purple-50"
                min="0"
                step="0.01"
                disabled={loading}
                placeholder="أدخل بدل الوجبة"
              />
            </div>
            <div>
              <label className="block text-gray-700 text-sm font-medium mb-2 text-right">
                عدد أيام العمل
              </label>
              <select
                name="workingDays"
                value={form.workingDays}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-purple-200 rounded-lg text-right text-sm focus:ring-2 focus:ring-purple-400 focus:border-purple-400 transition-all duration-200 bg-white hover:bg-purple-50"
                disabled={loading}
              >
                <option value="5">5 أيام (الجمعة والسبت إجازة)</option>
                <option value="6">6 أيام (الجمعة إجازة)</option>
              </select>
            </div>
            <div>
              <label className="block text-gray-700 text-sm font-medium mb-2 text-right">
                نوع الشيفت
              </label>
              <select
                name="shiftType"
                value={form.shiftType}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-purple-200 rounded-lg text-right text-sm focus:ring-2 focus:ring-purple-400 focus:border-purple-400 transition-all duration-200 bg-white hover:bg-purple-50"
                disabled={loading}
              >
                <option value="administrative">إداري</option>
                <option value="dayStation">محطة نهارًا</option>
                <option value="nightStation">محطة ليلًا</option>
                <option value="24/24">24/24</option>
              </select>
            </div>
            <div>
              <label className="block text-gray-700 text-sm font-medium mb-2 text-right">
                رصيد الإجازة السنوية
              </label>
              <input
                type="number"
                name="annualLeaveBalance"
                value={form.annualLeaveBalance}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-purple-200 rounded-lg text-right text-sm focus:ring-2 focus:ring-purple-400 focus:border-purple-400 transition-all duration-200 bg-white hover:bg-purple-50"
                min="0"
                disabled={loading}
                placeholder="أدخل رصيد الإجازة"
              />
            </div>
            <div>
              <label className="block text-gray-700 text-sm font-medium mb-2 text-right">
                رصيد دقائق السماح الشهري
              </label>
              <input
                type="number"
                name="monthlyLateAllowance"
                value={form.monthlyLateAllowance}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-purple-200 rounded-lg text-right text-sm focus:ring-2 focus:ring-purple-400 focus:border-purple-400 transition-all duration-200 bg-white hover:bg-purple-50"
                min="0"
                disabled={loading}
                placeholder="أدخل رصيد دقائق السماح"
              />
            </div>
            <div>
              <label className="block text-gray-700 text-sm font-medium mb-2 text-right">
                صافي الراتب
              </label>
              <input
                type="text"
                value={form.netSalary}
                className="w-full px-4 py-2 border border-purple-200 rounded-lg text-right text-sm bg-gray-100 cursor-not-allowed"
                readOnly
              />
            </div>
          </div>
          <div className="md:col-span-2 flex justify-end gap-4 mt-6">
            <motion.button
              type="submit"
              disabled={loading}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className={`px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-all duration-200 text-sm font-medium shadow-md ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {loading ? 'جارٍ الحفظ...' : 'إنشاء الموظف'}
            </motion.button>
            <motion.button
              type="button"
              onClick={() => navigate('/dashboard')}
              disabled={loading}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className={`px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-all duration-200 text-sm font-medium shadow-md ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              إلغاء
            </motion.button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

export default CreateUser;
