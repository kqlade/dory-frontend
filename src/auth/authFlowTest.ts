/**
 * Authentication Flow Test
 * 
 * This file provides a simple way to test our authentication flow end-to-end.
 * It can be imported and run from the browser console for manual testing.
 */

import { 
  loginWithGoogle, 
  isAuthenticated, 
  logout, 
  getCurrentUser 
} from '../services/authService';

/**
 * Test the complete authentication flow
 */
export async function testAuthFlow(): Promise<void> {
  console.group('🔐 Testing Authentication Flow');
  
  console.log('Step 1: Checking current authentication status...');
  const initialStatus = await isAuthenticated();
  
  if (initialStatus.authenticated) {
    console.log('✅ Already authenticated as:', initialStatus.user);
    
    console.log('Step 2: Testing logout...');
    await logout();
    
    const afterLogoutStatus = await isAuthenticated();
    console.log('Authentication status after logout:', 
      afterLogoutStatus.authenticated ? '❌ Still authenticated (error)' : '✅ Successfully logged out');
  } else {
    console.log('✅ Not authenticated (as expected)');
  }
  
  console.log('Step 3: Testing login with Google...');
  try {
    const loginResult = await loginWithGoogle();
    
    if (loginResult.success) {
      console.log('✅ Login successful:', loginResult.user);
      
      console.log('Step 4: Verifying authentication status...');
      const afterLoginStatus = await isAuthenticated();
      
      if (afterLoginStatus.authenticated) {
        console.log('✅ Successfully authenticated as:', afterLoginStatus.user);
      } else {
        console.error('❌ Login reported success but isAuthenticated() returned false');
      }
      
      console.log('Step 5: Testing getCurrentUser()...');
      const currentUser = await getCurrentUser();
      
      if (currentUser) {
        console.log('✅ getCurrentUser returned user:', currentUser);
      } else {
        console.error('❌ getCurrentUser returned null/undefined after successful login');
      }
    } else {
      console.warn('❓ Login failed or was cancelled by user');
    }
  } catch (error) {
    console.error('❌ Login error:', error);
  }
  
  console.groupEnd();
}

// Export a convenient function to run in the console
export async function runTest(): Promise<void> {
  console.clear();
  console.log('🚀 Starting authentication flow test...');
  
  try {
    await testAuthFlow();
    console.log('✅ Test complete');
  } catch (error) {
    console.error('❌ Test failed with error:', error);
  }
} 