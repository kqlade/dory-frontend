/**
 * authService.ts
 *
 * Streamlined authentication service for the Dory extension.
 * Handles Google OAuth token exchange and session management.
 */

import { API_BASE_URL, ENDPOINTS } from '../config';
/**
 * User information interface returned by the backend
 */
export interface UserInfo {
  id: string;
  email: string;
  name?: string;
  picture?: string;
}

/**
 * Check if user is currently authenticated by calling /api/auth/me
 * Returns true if authenticated, false otherwise
 */
export async function checkAuth(): Promise<boolean> {
  try {
    // Try to get saved token
    const storage = await chrome.storage.local.get(['auth_token']);
    const authToken = storage.auth_token;
    
    // Prepare headers (conditionally add Authorization if we have a token)
    const headers: Record<string, string> = {};
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }
    
    const resp = await fetch(`${API_BASE_URL}${ENDPOINTS.AUTH.ME}`, {
      method: 'GET',
      headers,
      credentials: 'include', // Keep cookies for backward compatibility
    });

    if (!resp.ok) return false;

    const data = await resp.json();
    if (!data?.id) return false;

    // Store user in local storage for UI access
    await chrome.storage.local.set({ user: data });
    return true;
  } catch (err) {
    console.error('[Auth] Check failed:', err);
    return false;
  }
}

/**
 * Get the current user from storage
 * Returns null if no user is stored or if there's an error
 */
export async function getCurrentUser(): Promise<UserInfo | null> {
  try {
    const data = await chrome.storage.local.get(['user']);
    return data.user || null;
  } catch (err) {
    console.error('[Auth] Get user failed:', err);
    return null;
  }
}

/**
 * Get the current user ID from storage
 * Throws an error if no user is authenticated or if there's an error
 */
export async function getCurrentUserId(): Promise<string> {
  const user = await getCurrentUser();
  if (!user || !user.id) {
    throw new Error('User authentication required');
  }
  return user.id;
}

/**
 * Trigger the OAuth flow by sending a message to the background script
 */
export function login(): void {
  chrome.runtime.sendMessage({ action: 'start_oauth' });
}

/**
 * Log out the user by clearing the session cookie and local storage
 */
export async function logout(): Promise<void> {
  try {
    // Try to get saved token
    const storage = await chrome.storage.local.get(['auth_token']);
    const authToken = storage.auth_token;
    
    // Prepare headers if we have a token
    const headers: Record<string, string> = {};
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }
    
    await fetch(`${API_BASE_URL}${ENDPOINTS.AUTH.LOGOUT}`, {
      method: 'POST',
      headers,
      credentials: 'include',
    });
  } catch (err) {
    console.error('[Auth] Logout request failed:', err);
  }

  // Always clear local storage, even if the server request fails
  await chrome.storage.local.remove(['user', 'auth_token']);
  
  // Notify background script
  chrome.runtime.sendMessage({ action: 'auth_completed' });
}

/**
 * Exchange Google ID token for a session with our backend
 * Returns true if authentication was successful
 */
export async function authenticateWithGoogleIdToken(idToken: string): Promise<boolean> {
  try {
    console.log('[Auth] Starting token exchange with backend...', {
      tokenLength: idToken.length,
      endpoint: `${API_BASE_URL}${ENDPOINTS.AUTH.TOKEN}`,
      tokenPrefix: idToken.substring(0, 10) + '...'
    });

    const resp = await fetch(`${API_BASE_URL}${ENDPOINTS.AUTH.TOKEN}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id_token: idToken }),
    });

    console.log('[Auth] Backend response:', {
      status: resp.status,
      statusText: resp.statusText,
      headers: Object.fromEntries(resp.headers.entries())
    });

    if (!resp.ok) {
      const errorText = await resp.text();
      console.error('[Auth] Token exchange failed:', {
        status: resp.status,
        error: errorText,
        requestedWith: idToken.substring(0, 10) + '...'
      });
      return false;
    }

    const data = await resp.json();
    console.log('[Auth] Token exchange response data:', {
      hasUser: !!data.user,
      hasToken: !!(data.access_token || data.token),
      userData: data.user ? {
        id: data.user.id,
        email: data.user.email
      } : null
    });

    if (data.user) {
      // Save both user data and access token (if present)
      const storageData: any = { user: data.user };
      
      // Check if the backend is returning a token and save it
      if (data.access_token || data.token) {
        storageData.auth_token = data.access_token || data.token;
      }
      
      await chrome.storage.local.set(storageData);
      return true;
    }
    
    return false;
  } catch (err: unknown) {
    const error = err as Error;
    console.error('[Auth] Token authentication failed:', {
      error: error.message,
      message: error.message,
      stack: error.stack
    });
    return false;
  }
}

export default {
  checkAuth,
  getCurrentUser,
  getCurrentUserId,
  login,
  logout,
  authenticateWithGoogleIdToken,
};