/**
 * @file auth.ts
 * 
 * Type definitions for the authentication system
 */

import { User } from './user';

/**
 * Authentication state interface
 * Represents the current state of user authentication
 */
export interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isLoading?: boolean;
  error?: Error | null;
}

/**
 * Response from token exchange with the backend
 */
export interface TokenResponse {
  access_token?: string;
  token?: string;  // Alternative name for access_token
  refresh_token?: string;
  user?: User;
}
