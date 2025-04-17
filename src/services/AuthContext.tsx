import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo, ReactNode } from 'react';
import { getBackgroundAPI } from '../utils/comlinkSetup';
import type { BackgroundAPI, AuthState } from '../types';
import { STORAGE_KEYS } from '../config';

interface AuthContextType extends AuthState {
  loading: boolean;
  error: Error | null;
  login: () => Promise<boolean>;
  logout: () => Promise<boolean>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<AuthState>({
    isAuthenticated: false,
    user: null,
    accessToken: null,
    refreshToken: null,
    error: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const mountedRef = useRef(true);
  const apiRef = useRef<Promise<BackgroundAPI> | null>(null);

  const connectToBackgroundAPI = useCallback(async (): Promise<boolean> => {
    if (!mountedRef.current) return false;
    try {
      apiRef.current = getBackgroundAPI<BackgroundAPI>();
      await apiRef.current;
      return true;
    } catch (error) {
      apiRef.current = null;
      setError(new Error('Failed to connect to background API'));
      return false;
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!mountedRef.current) return;
    setError(null);
    if (!apiRef.current) {
      const connected = await connectToBackgroundAPI();
      if (!connected) {
        setLoading(false);
        return;
      }
    }
    try {
      const api = await apiRef.current!;
      const newState = await api.auth.getAuthState();
      if (mountedRef.current) setState(newState);
    } catch (error) {
      setError(new Error('Failed to refresh auth state'));
      if (
        error instanceof Error &&
        (error.message.includes('disconnected port') || error.message.includes('connection closed'))
      ) {
        apiRef.current = null;
        const reconnected = await connectToBackgroundAPI();
        if (reconnected && mountedRef.current) setTimeout(refresh, 100);
        else if (mountedRef.current) setLoading(false);
      } else {
        if (mountedRef.current) setLoading(false);
      }
    }
  }, [connectToBackgroundAPI]);

  useEffect(() => {
    mountedRef.current = true;
    let isStillMounted = true;
    (async () => {
      try {
        const connected = await connectToBackgroundAPI();
        if (!connected) throw new Error('Failed to connect to background API during initialization');
        const api = await apiRef.current!;
        const initialState = await api.auth.getAuthState();
        if (isStillMounted) setState(initialState);
      } catch (error) {
        setError(new Error('Failed to initialize API or get initial state'));
        apiRef.current = null;
      } finally {
        if (isStillMounted) setLoading(false);
      }
    })();
    return () => {
      mountedRef.current = false;
      isStillMounted = false;
      apiRef.current = null;
    };
  }, [connectToBackgroundAPI]);

  useEffect(() => {
    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
      if (areaName === 'local' && changes[STORAGE_KEYS.AUTH_STATE]) refresh();
    };
    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, [refresh]);

  useEffect(() => {
    const handleFocusOrVisibility = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', handleFocusOrVisibility);
    window.addEventListener('focus', handleFocusOrVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleFocusOrVisibility);
      window.removeEventListener('focus', handleFocusOrVisibility);
    };
  }, [refresh]);

  const login = useCallback(async (): Promise<boolean> => {
    setLoading(true);
    setError(null);
    if (!apiRef.current) {
      const connected = await connectToBackgroundAPI();
      if (!connected) {
        setLoading(false);
        setError(new Error('Login failed: Unable to connect to background service'));
        return false;
      }
    }
    try {
      const api = await apiRef.current!;
      await api.auth.login();
      await refresh();
      setLoading(false);
      return true;
    } catch (error) {
      setLoading(false);
      setError(new Error('Login failed'));
      if (
        error instanceof Error &&
        (error.message.includes('disconnected port') || error.message.includes('connection closed'))
      ) {
        apiRef.current = null;
        await connectToBackgroundAPI();
      }
      return false;
    }
  }, [refresh, connectToBackgroundAPI]);

  const logout = useCallback(async (): Promise<boolean> => {
    setLoading(true);
    setError(null);
    if (!apiRef.current) {
      const connected = await connectToBackgroundAPI();
      if (!connected) {
        setLoading(false);
        setError(new Error('Logout failed: Unable to connect to background service'));
        return false;
      }
    }
    try {
      const api = await apiRef.current!;
      await api.auth.logout();
      await refresh();
      setLoading(false);
      return true;
    } catch (error) {
      setLoading(false);
      setError(new Error('Logout failed'));
      if (
        error instanceof Error &&
        (error.message.includes('disconnected port') || error.message.includes('connection closed'))
      ) {
        apiRef.current = null;
        await connectToBackgroundAPI();
      }
      return false;
    }
  }, [refresh, connectToBackgroundAPI]);

  const user = useMemo(() => state.user, [state.user]);

  return (
    <AuthContext.Provider value={{
      ...state,
      user,
      loading,
      error,
      login,
      logout,
      refresh,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}; 