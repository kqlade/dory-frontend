/**
 * @file ThemeToggle.tsx
 * 
 * A toggle button component for switching between light and dark mode
 * Uses the background API via useBackgroundPreferences
 */

import React from 'react';
import { FiSun, FiMoon } from 'react-icons/fi';
import useBackgroundPreferences from '../hooks/useBackgroundPreferences';
import './ThemeToggle.css';

const ThemeToggle: React.FC = () => {
  const { isDarkMode, toggleTheme } = useBackgroundPreferences();

  return (
    <button
      onClick={toggleTheme}
      aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
      className="theme-toggle"
    >
      {isDarkMode ? <FiSun size={20} /> : <FiMoon size={20} />}
    </button>
  );
};

export default ThemeToggle;