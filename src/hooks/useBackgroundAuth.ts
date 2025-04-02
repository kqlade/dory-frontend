/**
 * @file useBackgroundAPI.ts
 * 
 * React hook for accessing the background API from components
 */

import { useEffect, useState } from 'react';
import { getBackgroundAPI } from '../utils/comlinkSetup';
import type { BackgroundAPI } from '../background/api';
import type { AuthState } from '../types';

/**
 * Hook for accessing auth-related functionality from the background
 * @returns Auth state and methods for login/logout
 */
export function useAuth() {
  const [state, setState] = useState<AuthState>({
    isAuthenticated: false,
    user: null,
    accessToken: null,
    refreshToken: null
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    
    const init = async () => {
      try {
        // Get the background API and unwrap the auth property
        const api = getBackgroundAPI<BackgroundAPI>();
        const auth = await api.auth;
        
        // Get initial auth state
        const initialState = await auth.getAuthState();
        if (isMounted) {
          setState(initialState);
          setLoading(false);
        }
      } catch (error) {
        console.error('[useAuth] Failed to initialize:', error);
        if (isMounted) {
          setLoading(false);
        }
      }
    };
    
    init();
    
    return () => {
      isMounted = false;
    };
  }, []);

  const login = async () => {
    try {
      const api = getBackgroundAPI<BackgroundAPI>();
      const auth = await api.auth;
      await auth.login();
      const newState = await auth.getAuthState();
      setState(newState);
      return true;
    } catch (error) {
      console.error('[useAuth] Login failed:', error);
      return false;
    }
  };

  const logout = async () => {
    try {
      const api = getBackgroundAPI<BackgroundAPI>();
      const auth = await api.auth;
      await auth.logout();
      const newState = await auth.getAuthState();
      setState(newState);
      return true;
    } catch (error) {
      console.error('[useAuth] Logout failed:', error);
      return false;
    }
  };

  return {
    ...state,
    loading,
    login,
    logout
  };
}
