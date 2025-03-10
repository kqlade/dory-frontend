export interface UserInfo {
  id: string;
  email: string;
}

export async function getUserInfo(): Promise<UserInfo | null> {
  try {
    // This single call handles the entire auth flow
    const result = await chrome.identity.getAuthToken({ interactive: true });
    if (!result.token) {
      throw new Error('Failed to get auth token');
    }
    
    // Get user info from Google
    const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${result.token}` }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to get user info: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      id: data.id,
      email: data.email
    };
  } catch (error) {
    console.error('[DORY] Auth error:', error);
    return null;
  }
}

export async function signOut(): Promise<void> {
  try {
    const result = await chrome.identity.getAuthToken({ interactive: false });
    if (result.token) {
      await chrome.identity.removeCachedAuthToken({ token: result.token });
    }
  } catch (error) {
    console.error('[DORY] Sign out error:', error);
  }
}

// Test function to verify auth is working
export async function testAuth(): Promise<void> {
  console.log('[DORY] Testing auth...');
  
  // Try to get user info
  const user = await getUserInfo();
  if (user) {
    console.log('[DORY] Auth successful!', {
      id: user.id,
      email: user.email
    });
  } else {
    console.log('[DORY] Auth failed or user declined');
  }
} 