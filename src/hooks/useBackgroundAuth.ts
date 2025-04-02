import { useEffect, useState, useRef, useCallback } from 'react';
import { getBackgroundAPI } from '../utils/comlinkSetup';
import type { BackgroundAPI, AuthServiceAPI } from '../types';
import type { AuthState } from '../types';

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
    };
  }, []);

  const login = useCallback(async (): Promise<boolean> => {
    if (!authRef.current) {
      console.warn('[useAuth] Auth service not ready');
      return false;
    }

    try {
      // Call methods directly on the proxy object
      await authRef.current.login();
      const newState = await authRef.current.getAuthState();
      setState(newState);
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
      const newState = await authRef.current.getAuthState();
      setState(newState);
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