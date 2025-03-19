/**
 * @file authService.ts
 *
 * Centralized authentication logic for the DORY extension.
 * - Content scripts (popup, etc.) must use the proxy-based methods to avoid CORS.
 * - The background script can do direct fetch calls (Manifest V3 privileges).
 */

import { API_BASE_URL, ENDPOINTS } from '../config';
import { sendMessageWithTimeout } from '../utils/messagingHelpers';
import { ApiProxyRequestData, MessageType, createMessage } from '../utils/messageSystem';

/** Interface for user data from the backend */
export interface UserInfo {
  id: string;
  email: string;
  name?: string;
  picture?: string;
}

/* ----------------------------------------------------------------
 * 1) CONTENT SCRIPT METHODS (API Proxy)
 *    Used by InPagePopup, content scripts, etc.
 * ----------------------------------------------------------------*/

/**
 * checkAuth() – (Content Script)
 * Checks if the user is authenticated by first checking storage for auth token,
 * then verifying with the backend only if needed.
 */
export async function checkAuth(): Promise<boolean> {
  try {
    console.log('[Auth] Checking authentication status');
    
    // First, check if we have auth data in storage
    const storage = await chrome.storage.local.get(['auth_token', 'user']);
    const authToken = storage.auth_token;
    const userData = storage.user;
    
    // If we have both token and user data, consider authenticated without a network request
    if (authToken && userData?.id) {
      console.log('[Auth] Found valid auth token and user data in storage');
      return true;
    }
    
    // Otherwise, validate with backend
    console.log('[Auth] No valid auth data in storage, checking with backend');
    const request: ApiProxyRequestData = {
      url: `${API_BASE_URL}${ENDPOINTS.AUTH.ME}`,
      method: 'GET'
    };

    const responseData = await sendMessageWithTimeout(request);
    if (!responseData.ok) {
      console.log('[Auth] Auth check failed:', responseData.status);
      return false;
    }
    
    const backendUserData = responseData.data;
    if (!backendUserData?.id) {
      console.log('[Auth] Invalid user data received');
      return false;
    }

    // Store user data in local storage for quick UI access
    await chrome.storage.local.set({ user: backendUserData });
    console.log('[Auth] User authenticated (proxy):', backendUserData.email);
    return true;
  } catch (err) {
    console.error('[Auth] Check failed:', err);
    
    // Fallback: if we have token and user data in storage but request failed,
    // we still consider user authenticated to maintain UI state
    try {
      const storage = await chrome.storage.local.get(['auth_token', 'user']);
      if (storage.auth_token && storage.user?.id) {
        console.log('[Auth] Network request failed but found valid auth data in storage');
        return true;
      }
    } catch (storageErr) {
      console.error('[Auth] Storage check failed:', storageErr);
    }
    
    return false;
  }
}

/**
 * authenticateWithGoogleIdToken() – (Content Script)
 * Exchanges the Google ID token via the background's API proxy (/auth/token).
 */
export async function authenticateWithGoogleIdToken(idToken: string): Promise<boolean> {
  try {
    console.log('[Auth] Exchanging token via proxy (content script)...');
    const request: ApiProxyRequestData = {
      url: `${API_BASE_URL}${ENDPOINTS.AUTH.TOKEN}`,
      method: 'POST',
      body: { id_token: idToken }
    };

    const responseData = await sendMessageWithTimeout(request);

    if (!responseData.ok) {
      console.error('[Auth] Token exchange failed (proxy):', responseData.error);
      return false;
    }

    const data = responseData.data;
    if (data?.user) {
      const storageData: Record<string, any> = { user: data.user };
      if (data.access_token || data.token) {
        storageData.auth_token = data.access_token || data.token;
      }
      await chrome.storage.local.set(storageData);

      // Notify background that we are now authenticated
      chrome.runtime.sendMessage(
        createMessage(MessageType.AUTH_RESULT, { isAuthenticated: true }, 'content')
      );
      return true;
    }
    return false;
  } catch (err) {
    console.error('[Auth] Token auth failed (proxy):', err);
    return false;
  }
}

/**
 * logout() – (Content Script)
 * Calls /api/auth/logout via the background proxy, then clears local storage.
 */
export async function logout(): Promise<void> {
  try {
    console.log('[Auth] Logging out via proxy (content script)');
    const request: ApiProxyRequestData = {
      url: `${API_BASE_URL}${ENDPOINTS.AUTH.LOGOUT}`,
      method: 'POST'
    };
    await sendMessageWithTimeout(request);
  } catch (err) {
    console.error('[Auth] Logout request failed (proxy):', err);
  }

  // Clear local storage
  await chrome.storage.local.remove(['user', 'auth_token']);
  // Notify the background
  chrome.runtime.sendMessage(
    createMessage(MessageType.AUTH_RESULT, { isAuthenticated: false }, 'content')
  );
}

/**
 * login() – (Content Script)
 * Tells the background script to start the Google OAuth popup flow.
 */
export function login(): void {
  chrome.runtime.sendMessage(
    createMessage(MessageType.AUTH_REQUEST, {}, 'content')
  );
}

/* ----------------------------------------------------------------
 * 2) BACKGROUND METHODS (Direct Fetch)
 *    Used only from within the background script.
 * ----------------------------------------------------------------*/

/**
 * checkAuthDirect() – (Background)
 * Performs a direct fetch to /api/auth/me, storing user data locally if authenticated.
 */
export async function checkAuthDirect(): Promise<boolean> {
  try {
    console.log('[Auth] Checking authentication status (direct fetch, background)');
    
    // Retrieve auth token from storage
    const storage = await chrome.storage.local.get(['auth_token']);
    const authToken = storage.auth_token;
    
    // Set up headers with Authorization if token exists
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
      console.log('[Auth] Using stored auth token for verification');
    }
    
    const resp = await fetch(`${API_BASE_URL}${ENDPOINTS.AUTH.ME}`, {
      method: 'GET',
      headers,
      credentials: 'include' // Keep cookies for backward compatibility
    });
    
    if (!resp.ok) {
      console.log('[Auth] checkAuthDirect => not authenticated, status:', resp.status);
      return false;
    }
    
    const userData = await resp.json().catch(() => null);
    if (!userData?.id) {
      console.log('[Auth] checkAuthDirect => invalid user data');
      return false;
    }
    
    await chrome.storage.local.set({ user: userData });
    console.log('[Auth] checkAuthDirect => user is authenticated:', userData.email);
    return true;
  } catch (err) {
    console.error('[Auth] checkAuthDirect error:', err);
    return false;
  }
}

/**
 * authenticateWithGoogleIdTokenDirect() – (Background)
 * Exchanges a Google ID token for a session by directly calling /api/auth/token.
 */
export async function authenticateWithGoogleIdTokenDirect(idToken: string): Promise<boolean> {
  try {
    console.log('[Auth] authenticateWithGoogleIdTokenDirect => exchanging with backend');
    const resp = await fetch(`${API_BASE_URL}${ENDPOINTS.AUTH.TOKEN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id_token: idToken }),
      credentials: 'include'
    });
    if (!resp.ok) {
      console.error('[Auth] Direct token exchange failed => status:', resp.status);
      return false;
    }
    const data = await resp.json().catch(() => null);
    if (!data?.user) {
      console.log('[Auth] No user object returned in direct exchange');
      return false;
    }

    // If user + token returned, store them
    const storageData: Record<string, any> = { user: data.user };
    if (data.access_token || data.token) {
      storageData.auth_token = data.access_token || data.token;
    }
    await chrome.storage.local.set(storageData);

    return true;
  } catch (err) {
    console.error('[Auth] authenticateWithGoogleIdTokenDirect error:', err);
    return false;
  }
}

export default {
  // For content scripts:
  checkAuth,
  authenticateWithGoogleIdToken,
  logout,
  login,

  // For background:
  checkAuthDirect,
  authenticateWithGoogleIdTokenDirect
};