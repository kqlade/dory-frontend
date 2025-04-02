/**
 * @file useBackgroundPreferences.ts
 * 
 * React hook for accessing preference-related functionality from the background
 */

import { useState, useEffect, useCallback } from 'react';
import { getBackgroundAPI } from '../utils/comlinkSetup';
import type { BackgroundAPI } from '../background/api';
import type { UserPreferences } from '../db/repositories/PreferencesRepository';

/**
 * Hook for accessing preference functionality from the background
 * @returns Theme state and methods for toggling/changing the theme
 */
export function useBackgroundPreferences() {
  const [theme, setTheme] = useState<UserPreferences['theme']>('system');
  const [loading, setLoading] = useState(true);

  // Initialize theme state by fetching from background
  useEffect(() => {
    let mounted = true;
    
    async function init() {
      try {
        setLoading(true);
        const api = getBackgroundAPI<BackgroundAPI>();
        const preferencesService = await api.preferences;
        const currentTheme = await preferencesService.getTheme();
        
        if (mounted) {
          setTheme(currentTheme);
          setLoading(false);
        }
      } catch (error) {
        console.error('[useBackgroundPreferences] Failed to initialize:', error);
        if (mounted) {
          setLoading(false);
        }
      }
    }
    
    init();
    
    return () => {
      mounted = false;
    };
  }, []);

  /**
   * Toggle between light and dark mode
   */
  const toggleTheme = useCallback(async () => {
    try {
      const api = getBackgroundAPI<BackgroundAPI>();
      const preferencesService = await api.preferences;
      const newTheme = await preferencesService.toggleTheme();
      setTheme(newTheme);
      return newTheme;
    } catch (error) {
      console.error('[useBackgroundPreferences] Failed to toggle theme:', error);
      return theme;
    }
  }, [theme]);

  /**
   * Set the theme explicitly
   */
  const setThemePreference = useCallback(async (newTheme: UserPreferences['theme']) => {
    try {
      const api = getBackgroundAPI<BackgroundAPI>();
      const preferencesService = await api.preferences;
      await preferencesService.setTheme(newTheme);
      setTheme(newTheme);
      return true;
    } catch (error) {
      console.error('[useBackgroundPreferences] Failed to set theme:', error);
      return false;
    }
  }, []);

  /**
   * Calculate the effective theme, accounting for 'system' preference
   */
  const effectiveTheme = useCallback(() => {
    if (theme === 'system') {
      // Use system preference if set to 'system'
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return theme;
  }, [theme]);

  const isDarkMode = effectiveTheme() === 'dark';

  // Apply the dark mode class to the body when theme changes
  useEffect(() => {
    if (isDarkMode) {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
  }, [isDarkMode]);

  return {
    theme,
    isDarkMode,
    toggleTheme,
    setTheme: setThemePreference,
    loading
  };
}

export default useBackgroundPreferences;
