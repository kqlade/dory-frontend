/**
 * Google Auth Integration for Dory
 * 
 * This file handles Google authentication integration with the Dexie.js
 * database implementation for Dory.
 */

import { initializeUserDatabase, handleUserLogout } from '../db';

/**
 * Handles successful Google authentication
 * @param googleUser The authenticated Google user
 */
export async function onGoogleAuthSuccess(googleUser: any): Promise<void> {
  try {
    // Extract the user ID from the Google user object
    const userId = googleUser.getId(); // or appropriate method based on your Google Auth library
    
    // Store the authenticated user information
    storeAuthenticatedUser(userId, googleUser);
    
    // Initialize the database for this authenticated user
    await initializeUserDatabase(userId);
    
    console.log(`User ${userId} successfully authenticated and database initialized`);
  } catch (error) {
    console.error('Error during authentication:', error);
    // Handle authentication errors
  }
}

/**
 * Handles Google authentication failure
 * @param error The authentication error
 */
export function onGoogleAuthFailure(error: any): void {
  console.error('Google authentication failed:', error);
  // Handle the authentication failure
}

/**
 * Handles user logout
 */
export async function logoutUser(): Promise<void> {
  try {
    // Close the database connections
    handleUserLogout();
    
    // Clear any stored user information
    clearAuthenticatedUser();
    
    // Here you would call the Google Auth logout method
    // googleAuth.signOut();
    
    console.log('User logged out successfully');
  } catch (error) {
    console.error('Error during logout:', error);
    // Handle logout errors
  }
}

/**
 * Stores authenticated user information
 * @param userId The user's ID
 * @param userInfo The user's information
 */
function storeAuthenticatedUser(userId: string, userInfo: any): void {
  // Store in memory
  sessionStorage.setItem('dory_current_user_id', userId);
  
  // Store more user information if needed
  sessionStorage.setItem('dory_user_info', JSON.stringify({
    id: userId,
    name: userInfo.getName?.() || 'Unknown',
    email: userInfo.getEmail?.() || 'unknown@example.com',
    authTime: Date.now()
  }));
}

/**
 * Clears authenticated user information
 */
function clearAuthenticatedUser(): void {
  sessionStorage.removeItem('dory_current_user_id');
  sessionStorage.removeItem('dory_user_info');
}

/**
 * Gets the currently authenticated user's ID
 * @returns The user ID or null if not authenticated
 */
export function getCurrentAuthenticatedUserId(): string | null {
  return sessionStorage.getItem('dory_current_user_id');
}

/**
 * Checks if a user is currently authenticated
 * @returns true if a user is authenticated, false otherwise
 */
export function isUserAuthenticated(): boolean {
  return getCurrentAuthenticatedUserId() !== null;
}

export default {
  onGoogleAuthSuccess,
  onGoogleAuthFailure,
  logoutUser,
  getCurrentAuthenticatedUserId,
  isUserAuthenticated
}; 