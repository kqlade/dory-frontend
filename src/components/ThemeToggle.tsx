// src/pages/newtab/ThemeToggle.tsx
import React from 'react';
import { FiSun, FiMoon } from 'react-icons/fi';
import useDarkMode from '../utils/useDarkMode';
import './ThemeToggle.css'; // Import the direct CSS

const ThemeToggle: React.FC = () => {
  const { isDarkMode, toggle } = useDarkMode();

  return (
    <button
      onClick={toggle}
      aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
      className="theme-toggle"
    >
      {isDarkMode ? <FiSun size={20} /> : <FiMoon size={20} />}
    </button>
  );
};

export default ThemeToggle;