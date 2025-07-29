import React, { createContext } from 'react';

export const AuthContext = createContext({
  user: null, // يحتوي على بيانات المستخدم بما في ذلك role (admin أو employee)
  login: () => {},
  logout: () => {},
});
