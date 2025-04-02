/**
 * @file user.ts
 * 
 * User-related type definitions for the Dory frontend
 */

/**
 * Core user interface with essential properties
 */
export interface User {
  id: string;             // Unique identifier for the user
  email: string;          // User's email address
  name?: string;          // Optional display name
  picture?: string;       // Optional profile picture URL
}

/**
 * Extended user information including OAuth-specific data
 */
export interface UserInfo extends User {
  // Additional fields that might come from OAuth providers
  given_name?: string;
  family_name?: string;
  locale?: string;
  verified_email?: boolean;
}

/**
 * User preferences for the application
 */
export interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  // Add other preferences as needed
}
