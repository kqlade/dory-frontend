
import { useState, useEffect } from 'react';
import { STORAGE_KEYS } from '../config';

/**
 * Hook to manage dark mode theme preference.
 * Retrieves from localStorage, falls back to system preference,
 * and persists changes to localStorage.
 * 
 * @param defaultValue Optional default value for dark mode
 * @returns Object with current dark mode state and toggle function
 */
const useDarkMode = (defaultValue: boolean = false) => {
  const [isDarkMode, setIsDarkMode] = useState(defaultValue);

  // Initialize from localStorage or system preference
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.PREFERRED_THEME_KEY);
      if (stored) {
        setIsDarkMode(stored === 'dark');
      } else {
        // Fall back to system preference when no stored theme exists
        const systemDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
        setIsDarkMode(systemDarkMode);
      }
    } catch (err) {
      console.error('[useDarkMode] Error reading theme preference:', err);
      // Fall back to system preference on error
      const systemDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
      setIsDarkMode(systemDarkMode);
    }
  }, []);

  // Update DOM and persist preference when theme changes
  useEffect(() => {
    try {
      const root = document.documentElement;
      if (isDarkMode) {
        root.classList.add('dark-mode');
        localStorage.setItem(STORAGE_KEYS.PREFERRED_THEME_KEY, 'dark');
      } else {
        root.classList.remove('dark-mode');
        localStorage.setItem(STORAGE_KEYS.PREFERRED_THEME_KEY, 'light');
      }
    } catch (err) {
      console.error('[useDarkMode] Error saving theme preference:', err);
    }
  }, [isDarkMode]);

  /**
   * Toggle between light and dark mode
   */
  const toggle = () => setIsDarkMode(prev => !prev);

  return { isDarkMode, toggle };
};

export default useDarkMode;