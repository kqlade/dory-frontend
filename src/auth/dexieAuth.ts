// src/auth/dexieAuth.ts

import { setCurrentUser, handleUserLogout } from '../db/dexieDB';

// Example of storing user data in Chrome storage
async function storeAuthenticatedUser(userId: string, userObj: any): Promise<void> {
  const userInfo = {
    id: userId,
    name: userObj?.getName?.() || 'Unknown',
    email: userObj?.getEmail?.() || 'unknown@example.com',
    authTime: Date.now(),
  };

  await chrome.storage.local.set({
    dory_current_user_id: userId,
    dory_user_info: userInfo,
  });
}

async function clearAuthenticatedUser(): Promise<void> {
  await chrome.storage.local.remove(['dory_current_user_id', 'dory_user_info']);
}

/**
 * Get current user ID if any
 */
export async function getCurrentAuthenticatedUserId(): Promise<string | null> {
  const stored = await chrome.storage.local.get('dory_current_user_id');
  return stored.dory_current_user_id || null;
}

/**
 * Check if user is authenticated
 */
export async function isUserAuthenticated(): Promise<boolean> {
  const userId = await getCurrentAuthenticatedUserId();
  return userId !== null;
}

/**
 * On Google auth success
 */
export async function onGoogleAuthSuccess(googleUser: any): Promise<void> {
  try {
    const userId = googleUser.getId(); // or the correct method from your library
    await storeAuthenticatedUser(userId, googleUser);

    // Initialize Dexie for this user
    await setCurrentUser(userId);

    console.log(`[DORY] INFO: Auth success for user ${userId}, DB ready.`);
  } catch (err) {
    console.error('[DORY] ERROR: onGoogleAuthSuccess:', err);
  }
}

/**
 * On Google auth failure
 */
export function onGoogleAuthFailure(error: any): void {
  console.error('[DORY] ERROR: Google auth failed:', error);
}

/**
 * Logout user
 */
export async function logoutUser(): Promise<void> {
  try {
    handleUserLogout(); // Dexie cleanup
    await clearAuthenticatedUser(); // remove from chrome.storage
    // If you use a library: googleAuth.signOut(); ...
    console.log('[DORY] INFO: User logged out');
  } catch (err) {
    console.error('[DORY] ERROR: logoutUser failed:', err);
  }
}

// Optional default export grouping
export default {
  onGoogleAuthSuccess,
  onGoogleAuthFailure,
  logoutUser,
  getCurrentAuthenticatedUserId,
  isUserAuthenticated,
};