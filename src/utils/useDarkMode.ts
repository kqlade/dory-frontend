// src/pages/newtab/useDarkMode.ts
import { useState, useEffect } from 'react';

const useDarkMode = (defaultValue: boolean = false) => {
  const [isDarkMode, setIsDarkMode] = useState(defaultValue);

  useEffect(() => {
    const stored = localStorage.getItem('preferredTheme');
    if (stored) {
      setIsDarkMode(stored === 'dark');
    } else {
      // Fall back to system preference when no stored theme exists
      const systemDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
      setIsDarkMode(systemDarkMode);
    }
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (isDarkMode) {
      root.classList.add('dark-mode');
      localStorage.setItem('preferredTheme', 'dark');
    } else {
      root.classList.remove('dark-mode');
      localStorage.setItem('preferredTheme', 'light');
    }
  }, [isDarkMode]);

  const toggle = () => setIsDarkMode(prev => !prev);

  return { isDarkMode, toggle };
};

export default useDarkMode;