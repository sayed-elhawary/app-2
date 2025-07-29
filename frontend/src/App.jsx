import React, { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import CreateUser from './pages/CreateUser';
import EditUser from './pages/EditUser';
import UploadAttendance from './pages/UploadAttendance';
import SalaryReport from './pages/SalaryReport';
import NavBar from './components/NavBar';
import { AuthContext } from './components/AuthProvider';
import { motion, AnimatePresence } from 'framer-motion';

const App = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      axios
        .get(`${process.env.REACT_APP_API_URL}/api/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        .then((res) => {
          setUser(res.data.user);
          setLoading(false);
          // توجيه المستخدم بناءً على دوره فقط إذا كان على صفحة اللوجين
          if (location.pathname === '/login') {
            navigate('/dashboard', { replace: true });
          }
        })
        .catch((err) => {
          console.error('خطأ في جلب بيانات المستخدم:', err);
          localStorage.removeItem('token');
          setUser(null);
          setLoading(false);
          if (location.pathname !== '/login') {
            navigate('/login', { replace: true });
          }
        });
    } else {
      setLoading(false);
      if (location.pathname !== '/login') {
        navigate('/login', { replace: true });
      }
    }
  }, [navigate, location]);

  const login = (userData, token) => {
    setUser(userData);
    localStorage.setItem('token', token);
    navigate('/dashboard', { replace: true });
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('token');
    navigate('/login', { replace: true });
  };

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      <AnimatePresence>
        {loading ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-gradient-to-br from-purple-100 to-blue-200 flex items-center justify-center z-50"
            dir="rtl"
          >
            <div className="text-center">
              <motion.div
                animate={{ scale: [1, 1.2, 1], rotate: 360 }}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                className="w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full"
              ></motion.div>
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.5 }}
                className="mt-4 text-purple-600 text-lg font-cairo font-semibold"
              >
                جاري التحميل...
              </motion.p>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="app"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className="min-h-screen bg-gradient-to-b from-purple-50 to-blue-100 font-cairo"
            dir="rtl"
          >
            {user && <NavBar />}
            <Routes>
              <Route path="/login" element={<Login />} />
              {user ? (
                <>
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/salary-report" element={<SalaryReport />} />
                  {user.role === 'admin' && (
                    <>
                      <Route path="/create-user" element={<CreateUser />} />
                      <Route path="/edit-user" element={<EditUser />} />
                      <Route path="/upload-attendance" element={<UploadAttendance />} />
                    </>
                  )}
                </>
              ) : (
                <Route path="*" element={<Login />} />
              )}
              <Route path="*" element={<Login />} />
            </Routes>
          </motion.div>
        )}
      </AnimatePresence>
    </AuthContext.Provider>
  );
};

export default App;
