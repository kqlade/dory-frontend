/**
 * @file userService.ts
 * 
 * Centralized User Service
 * Provides unified access to user information across the application.
 */

import { User } from './eventService';

/**
 * Get the current user ID from storage
 * @returns Promise resolving to user ID string or null if not authenticated
 */
export async function getCurrentUserId(): Promise<string | null> {
  try {
    const data = await chrome.storage.local.get(['user']);
    return data.user?.id || null;
  } catch (error) {
    console.error('[UserService] Error getting user ID:', error);
    return null;
  }
}

/**
 * Get the complete user object from storage
 * @returns Promise resolving to User object or null
 */
export async function getCurrentUser(): Promise<User | null> {
  try {
    const data = await chrome.storage.local.get(['user']);
    return data.user || null;
  } catch (error) {
    console.error('[UserService] Error getting user:', error);
    return null;
  }
}

/**
 * Check if the user is authenticated
 * @returns Promise resolving to boolean indicating authentication status
 */
export async function isAuthenticated(): Promise<boolean> {
  try {
    const data = await chrome.storage.local.get(['auth_token', 'user']);
    return !!(data.auth_token && data.user?.id);
  } catch (error) {
    console.error('[UserService] Error checking authentication status:', error);
    return false;
  }
}

export default {
  getCurrentUserId,
  getCurrentUser,
  isAuthenticated
}; 