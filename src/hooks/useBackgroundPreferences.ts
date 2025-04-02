/**
 * @file useBackgroundPreferences.ts
 *
 * React hook for accessing preference-related functionality from the background.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { getBackgroundAPI } from '../utils/comlinkSetup';
import type { BackgroundAPI, PreferencesServiceAPI } from '../types';
import type { UserPreferences } from '../types/user';

interface UsePreferencesResult {
  theme: UserPreferences['theme'];
  isDarkMode: boolean;
  loading: boolean;
  toggleTheme: () => Promise<UserPreferences['theme']>;
  setTheme: (theme: UserPreferences['theme']) => Promise<boolean>;
}

export function useBackgroundPreferences(): UsePreferencesResult {
  const [theme, setTheme] = useState<UserPreferences['theme']>('system');
  const [loading, setLoading] = useState(true);
  const preferencesRef = useRef<PreferencesServiceAPI | null>(null);

  // Initialize preferences service once
  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const api = await getBackgroundAPI<BackgroundAPI>();
        // Don't await the service - keep it as a Comlink proxy
        preferencesRef.current = api.preferences;

        // Call the method on the proxy object
        const currentTheme = await api.preferences.getTheme();
        if (mounted) setTheme(currentTheme);
      } catch (err) {
        console.error('[useBackgroundPreferences] Initialization error:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const toggleTheme = useCallback(async (): Promise<UserPreferences['theme']> => {
    const service = preferencesRef.current;
    if (!service) {
      console.warn('[useBackgroundPreferences] Preferences service not ready');
      return theme;
    }

    try {
      const newTheme = await service.toggleTheme();
      setTheme(newTheme);
      return newTheme;
    } catch (error) {
      console.error('[useBackgroundPreferences] Failed to toggle theme:', error);
      return theme;
    }
  }, [theme]);

  const setThemePreference = useCallback(async (newTheme: UserPreferences['theme']): Promise<boolean> => {
    const service = preferencesRef.current;
    if (!service) {
      console.warn('[useBackgroundPreferences] Preferences service not ready');
      return false;
    }

    try {
      await service.setTheme(newTheme);
      setTheme(newTheme);
      return true;
    } catch (error) {
      console.error('[useBackgroundPreferences] Failed to set theme:', error);
      return false;
    }
  }, []);

  const effectiveTheme = theme === 'system'
    ? (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : theme;

  const isDarkMode = effectiveTheme === 'dark';

  // Update DOM class based on theme
  useEffect(() => {
    document.documentElement.classList.toggle('dark-mode', isDarkMode);
  }, [isDarkMode]);

  return {
    theme,
    isDarkMode,
    loading,
    toggleTheme,
    setTheme: setThemePreference,
  };
}

export default useBackgroundPreferences;