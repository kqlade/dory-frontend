import { useState, useEffect } from 'react';

const useDarkMode = (defaultValue: boolean = false) => {
  const [isDarkMode, setIsDarkMode] = useState(defaultValue);

  useEffect(() => {
    const root = document.documentElement;
    if (isDarkMode) {
      root.classList.add('dark-mode');
    } else {
      root.classList.remove('dark-mode');
    }
  }, [isDarkMode]);

  const toggle = () => setIsDarkMode(prev => !prev);

  return { isDarkMode, toggle };
};

export default useDarkMode;