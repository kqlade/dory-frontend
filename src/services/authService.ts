/**
 * Authentication Service for Dory Extension
 * 
 * Provides a centralized service for handling authentication with the backend.
 * Uses cookie-based authentication for simplicity and security.
 */

const API_URL = 'http://localhost:8000/api';

export type User = {
  id: string;
  email: string;
  name?: string;
  is_active: boolean;
  is_verified: boolean;
};

/**
 * Get a Google OAuth token using Chrome's identity API
 */
function getGoogleToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      
      if (!token) {
        reject(new Error('Failed to get Google OAuth token'));
        return;
      }
      
      resolve(token);
    });
  });
}

/**
 * Login with Google OAuth
 * 
 * 1. Gets a Google OAuth token using Chrome's identity API
 * 2. Exchanges the token with our backend for an authenticated session
 * 3. The backend sets authentication cookies automatically
 * 
 * @returns A boolean indicating if login was successful and user data if available
 */
export async function loginWithGoogle(): Promise<{ success: boolean; user?: User }> {
  try {
    // Step 1: Get Google OAuth token
    const token = await getGoogleToken();
    
    // Step 2: Exchange token with backend
    const response = await fetch(`${API_URL}/auth/extension/verify-google-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token }),
      credentials: 'include', // Important for cookies
    });
    
    if (!response.ok) {
      console.error('Token exchange failed:', await response.text());
      return { success: false };
    }
    
    const data = await response.json();
    return { 
      success: true, 
      user: data.user 
    };
  } catch (error) {
    console.error('Login failed:', error);
    return { success: false };
  }
}

/**
 * Check if the user is authenticated
 * 
 * Makes a request to the /whoami endpoint, which will
 * return user data if authenticated or 401 if not
 * 
 * @returns A boolean indicating if the user is authenticated and user data if available
 */
export async function isAuthenticated(): Promise<{ authenticated: boolean; user?: User }> {
  try {
    const response = await fetch(`${API_URL}/auth/extension/whoami`, {
      credentials: 'include', // Important for cookies
    });
    
    if (!response.ok) {
      return { authenticated: false };
    }
    
    const user = await response.json();
    return { 
      authenticated: true, 
      user 
    };
  } catch (error) {
    console.error('Authentication check failed:', error);
    return { authenticated: false };
  }
}

/**
 * Logout the user
 * 
 * This simply tells the backend to clear the authentication cookies
 */
export async function logout(): Promise<void> {
  try {
    await fetch(`${API_URL}/auth/logout`, {
      method: 'POST',
      credentials: 'include', // Important for cookies
    });
    
    // Also clear any local Google OAuth token
    if (chrome.identity && chrome.identity.removeCachedAuthToken) {
      await new Promise<void>((resolve) => {
        chrome.identity.getAuthToken({ interactive: false }, (token) => {
          if (token) {
            chrome.identity.removeCachedAuthToken({ token }, () => {
              resolve();
            });
          } else {
            resolve();
          }
        });
      });
    }
  } catch (error) {
    console.error('Logout failed:', error);
  }
}

/**
 * Get the current authenticated user
 * 
 * Shorthand for checking authentication and returning the user
 * 
 * @returns The user object if authenticated, undefined otherwise
 */
export async function getCurrentUser(): Promise<User | undefined> {
  const { authenticated, user } = await isAuthenticated();
  return authenticated ? user : undefined;
} 