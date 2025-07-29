import React from 'react';
import { motion } from 'framer-motion';

const LoadingSpinner = () => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-purple-100/80 flex items-center justify-center z-50"
      dir="rtl"
    >
      <div className="text-center">
        <motion.div
          animate={{ scale: [1, 1.2, 1], rotate: 360 }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
          className="w-16 h-16 border-4 border-purple-600 border-t-transparent rounded-full"
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
  );
};

export default LoadingSpinner;
