import React, { memo } from 'react';
import { FiSun, FiMoon } from 'react-icons/fi';
import useBackgroundPreferences from '../hooks/useBackgroundPreferences';
import './ThemeToggle.css';

/**
 * ThemeToggle – clickable icon button that flips the colour scheme.
 * Pointer‑events rely on CSS, so keep this element at z‑index 11.
 */
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

export default memo(ThemeToggle);