import { useEffect, useState, useRef, useCallback } from 'react';
import { getBackgroundAPI } from '../utils/comlinkSetup';
import type { BackgroundAPI } from '../types';
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
  const mountedRef = useRef(true);
  // Store the promise for the API proxy
  const apiRef = useRef<Promise<BackgroundAPI> | null>(null);

  // Function to refresh auth state from background
  const refreshAuthState = useCallback(async () => {
    if (!mountedRef.current || !apiRef.current) {
      console.warn('[useAuth] Refresh requested before API is ready or component unmounted.');
      return; // Skip refresh if API promise isn't set or component unmounted
    }
    try {
      console.debug('[useAuth] Attempting to refresh auth state...');
      // Await the stored promise and then call the method
      const api = await apiRef.current;
      const newState = await api.auth.getAuthState();
      if (mountedRef.current) {
        console.debug('[useAuth] Auth state refreshed:', newState);
        setState(newState);
      }
    } catch (error) {
      console.error('[useAuth] Failed to refresh auth state:', error);
      // If refresh fails (e.g., disconnected port), maybe clear the apiRef?
      // apiRef.current = null; // Or re-attempt connection?
    }
  }, []); // No dependencies needed as it uses the ref

  // Initialize API connection and auth state once on mount
  useEffect(() => {
    mountedRef.current = true;
    let isStillMounted = true;

    console.debug('[useAuth] Initializing hook, getting API proxy...');
    // Store the promise immediately. It might fail, but the ref holds the attempt.
    apiRef.current = getBackgroundAPI<BackgroundAPI>();

    (async () => {
      try {
        // Add null check before awaiting
        if (!apiRef.current) {
          throw new Error("API reference promise was unexpectedly null during initialization.");
        }
        // Await the stored promise (now guaranteed non-null here)
        const api = await apiRef.current;
        console.debug('[useAuth] API proxy obtained. Getting initial state...');
        const initialState = await api.auth.getAuthState();
        if (isStillMounted) {
          console.debug('[useAuth] Initial auth state received:', initialState);
          setState(initialState);
        }
      } catch (error) {
        console.error('[useAuth] Failed to initialize API or get initial state:', error);
        apiRef.current = null; // Clear the ref if initialization failed
      } finally {
        if (isStillMounted) {
          setLoading(false);
        }
      }
    })();

    return () => {
      mountedRef.current = false;
      isStillMounted = false;
      // Optional: Signal Comlink to release the proxy/port?
      // Comlink doesn't have an explicit 'disconnect', relying on garbage collection.
    };
  }, []); // Empty dependency array for mount/unmount effect

  // Listen for chrome.storage changes to trigger refresh
  useEffect(() => {
    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
      if (areaName === 'local' && changes[STORAGE_KEYS.AUTH_STATE]) {
        console.debug('[useAuth] Auth state change detected in storage, refreshing...');
        refreshAuthState();
      }
    };
    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, [refreshAuthState]);

  // Check auth state when tab becomes visible or gains focus
  useEffect(() => {
    const handleFocusOrVisibility = () => {
      if (document.visibilityState === 'visible') {
        console.debug('[useAuth] Tab became visible/focused, refreshing auth state...');
        refreshAuthState();
      }
    };
    document.addEventListener('visibilitychange', handleFocusOrVisibility);
    window.addEventListener('focus', handleFocusOrVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleFocusOrVisibility);
      window.removeEventListener('focus', handleFocusOrVisibility);
    };
  }, [refreshAuthState]);

  const login = useCallback(async (): Promise<boolean> => {
    if (!apiRef.current) {
       console.error('[useAuth] Login attempted before API was initialized.');
       return false;
    }
    setLoading(true);
    try {
      console.debug('[useAuth] Attempting login...');
      // Await the stored promise
      const api = await apiRef.current;
      await api.auth.login();
      console.debug('[useAuth] Login call successful, awaiting state update via refresh.');
      await refreshAuthState(); // Refresh state after successful call
      setLoading(false); // Explicitly set loading to false after successful refresh
      return true;
    } catch (error) {
      console.error('[useAuth] Login failed:', error);
      setLoading(false);
      // If login failed due to connection, maybe clear apiRef?
      // apiRef.current = null;
      return false;
    } finally {
       // setLoading handled explicitly in both success and error cases
    }
  }, [refreshAuthState]); // Depends on refreshAuthState

  const logout = useCallback(async (): Promise<boolean> => {
    if (!apiRef.current) {
       console.error('[useAuth] Logout attempted before API was initialized.');
       return false;
    }
    setLoading(true);
    try {
      console.debug('[useAuth] Attempting logout...');
      // Await the stored promise
      const api = await apiRef.current;
      await api.auth.logout();
      console.debug('[useAuth] Logout call successful, awaiting state update via refresh.');
      await refreshAuthState(); // Refresh state after successful call
      return true;
    } catch (error) {
      console.error('[useAuth] Logout failed:', error);
      return false;
    } finally {
      setLoading(false);
    }
  }, [refreshAuthState]); // Depends on refreshAuthState

  return {
    ...state,
    loading,
    login,
    logout,
  };
}