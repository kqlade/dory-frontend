import { useEffect, useState, useRef, useCallback } from 'react';
import { getBackgroundAPI } from '../utils/comlinkSetup';
import type { BackgroundAPI, AuthServiceAPI } from '../types';
import type { AuthState } from '../types';
import { STORAGE_KEYS } from '../config';

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    isAuthenticated: false,
    user: null,
    accessToken: null,
    refreshToken: null,
  });

  const [loading, setLoading] = useState(true);
  const authRef = useRef<AuthServiceAPI | null>(null);
  const mountedRef = useRef(true);
  const listenerRef = useRef<(() => void) | null>(null);

  // Function to refresh auth state from background
  const refreshAuthState = useCallback(async () => {
    if (!authRef.current || !mountedRef.current) return;
    try {
      const newState = await authRef.current.getAuthState();
      if (mountedRef.current) {
        setState(newState);
      }
    } catch (error) {
      console.error('[useAuth] Failed to refresh auth state:', error);
    }
  }, []);

  // Initialize auth service once
  useEffect(() => {
    mountedRef.current = true;

    (async () => {
      try {
        const api = await getBackgroundAPI<BackgroundAPI>();
        // Store the Comlink proxy directly - don't await it
        authRef.current = api.auth;

        // Call methods on the proxy object
        const initialState = await api.auth.getAuthState();
        if (mountedRef.current) {
          setState(initialState);
        }

        // Set up state change listener
        if (authRef.current && mountedRef.current) {
          // Register for direct auth state changes from the background service
          const unsubscribe = await authRef.current.onStateChange((newState: AuthState) => {
            if (mountedRef.current) {
              console.log('[useAuth] Auth state updated from background', newState);
              setState(newState);
            }
          });
          
          // Store the unsubscribe function
          listenerRef.current = unsubscribe;
        }
      } catch (error) {
        console.error('[useAuth] Failed to initialize:', error);
      } finally {
        if (mountedRef.current) {
          setLoading(false);
        }
      }
    })();

    return () => {
      mountedRef.current = false;
      // Clean up the state change listener
      if (listenerRef.current) {
        listenerRef.current();
        listenerRef.current = null;
      }
    };
  }, []);

  // Listen for chrome.storage changes
  useEffect(() => {
    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
      if (areaName === 'local' && changes[STORAGE_KEYS.AUTH_STATE]) {
        refreshAuthState();
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    
    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, [refreshAuthState]);

  // Check auth state when tab becomes visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshAuthState();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Also refresh when the window gets focus
    window.addEventListener('focus', refreshAuthState);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', refreshAuthState);
    };
  }, [refreshAuthState]);

  const login = useCallback(async (): Promise<boolean> => {
    if (!authRef.current) {
      console.warn('[useAuth] Auth service not ready');
      return false;
    }

    try {
      // Call methods directly on the proxy object
      await authRef.current.login();
      // State will be updated via the listener
      return true;
    } catch (error) {
      console.error('[useAuth] Login failed:', error);
      return false;
    }
  }, []);

  const logout = useCallback(async (): Promise<boolean> => {
    if (!authRef.current) {
      console.warn('[useAuth] Auth service not ready');
      return false;
    }

    try {
      // Call methods directly on the proxy object
      await authRef.current.logout();
      // State will be updated via the listener
      return true;
    } catch (error) {
      console.error('[useAuth] Logout failed:', error);
      return false;
    }
  }, []);

  return {
    ...state,
    loading,
    login,
    logout,
  };
}