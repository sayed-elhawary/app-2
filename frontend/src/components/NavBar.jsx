import React, { useContext, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { LogOut, Menu, X } from 'lucide-react';
import { AuthContext } from './AuthProvider';

const NavBar = () => {
  const { user, logout } = useContext(AuthContext);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  const menuVariants = {
    hidden: { opacity: 0, y: -20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        type: 'spring',
        stiffness: 100,
        damping: 20,
        when: 'beforeChildren',
        staggerChildren: 0.1,
      },
    },
    exit: {
      opacity: 0,
      y: -20,
      transition: { duration: 0.2 },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 10 },
  };

  const navItems = user && user.role === 'admin' ? [
    { to: '/dashboard', label: 'الرئيسية' },
    { to: '/create-user', label: 'إنشاء حساب جديد' },
    { to: '/edit-user', label: 'تعديل حساب' },
    { to: '/upload-attendance', label: 'رفع البصمات' },
    { to: '/salary-report', label: 'تقرير الراتب' },
  ] : [
    { to: '/salary-report', label: 'تقرير الراتب' },
  ];

  return (
    <nav className="bg-gradient-to-r from-purple-600 to-blue-500 p-4 shadow-xl">
      <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap" rel="stylesheet" />
      <div className="container mx-auto flex justify-between items-center font-cairo">
        <div className="text-white text-xl font-bold">إدارة الموظفين</div>
        <div className="hidden md:flex gap-6 items-center">
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="text-white font-semibold text-sm hover:bg-purple-700 px-3 py-2 rounded-md transition-all duration-200"
            >
              {item.label}
            </Link>
          ))}
          <motion.button
            onClick={logout}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="flex items-center gap-2 bg-white text-purple-600 px-4 py-2 rounded-md hover:bg-purple-100 transition-all duration-200 text-sm font-semibold shadow-md"
          >
            <LogOut className="h-4 w-4 text-purple-600" />
            تسجيل الخروج
          </motion.button>
        </div>
        <motion.button
          className="md:hidden text-white focus:outline-none"
          onClick={toggleMenu}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          animate={{ rotate: isMenuOpen ? 90 : 0 }}
          transition={{ duration: 0.2 }}
        >
          {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </motion.button>
      </div>
      <AnimatePresence>
        {isMenuOpen && (
          <motion.div
            variants={menuVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="md:hidden bg-purple-100 shadow-lg mt-2 rounded-lg overflow-hidden border border-purple-200"
          >
            {navItems.map((item) => (
              <motion.div key={item.to} variants={itemVariants} className="px-4 py-2">
                <Link
                  to={item.to}
                  className="block text-purple-600 font-semibold text-sm hover:bg-purple-200 px-3 py-2 rounded-md transition-all duration-200"
                  onClick={toggleMenu}
                >
                  {item.label}
                </Link>
              </motion.div>
            ))}
            <motion.div variants={itemVariants} className="px-4 py-2">
              <button
                onClick={() => {
                  logout();
                  toggleMenu();
                }}
                className="w-full flex items-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-md hover:bg-purple-700 transition-all duration-200 text-sm font-semibold shadow-md"
              >
                <LogOut className="h-4 w-4 text-white" />
                تسجيل الخروج
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
};

export default NavBar;
