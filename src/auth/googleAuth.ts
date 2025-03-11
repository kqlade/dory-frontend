// src/auth/googleAuth.ts

export interface UserInfo {
  id: string;
  email: string;
}

/**
 * Fetch user info from Google's userinfo endpoint
 * @param interactive If true, will open a sign-in flow if not signed in
 */
export async function getUserInfo(interactive = true): Promise<UserInfo | null> {
  try {
    const result = await chrome.identity.getAuthToken({ interactive });
    if (!result || !result.token) {
      throw new Error('No auth token retrieved');
    }

    const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${result.token}` },
    });

    if (!response.ok) {
      throw new Error(`Failed to get user info: ${response.status}`);
    }

    const data = await response.json();
    return {
      id: data.id,
      email: data.email,
    };
  } catch (error) {
    console.error('[DORY] Auth error:', error);
    return null;
  }
}

/**
 * Sign out by removing the cached token
 */
export async function signOut(): Promise<void> {
  try {
    const result = await chrome.identity.getAuthToken({ interactive: false });
    if (result && result.token) {
      await chrome.identity.removeCachedAuthToken({ token: result.token });
    }
    console.log('[DORY] INFO: signOut complete');
  } catch (err) {
    console.error('[DORY] ERROR: signOut failed:', err);
  }
}

/**
 * Quick test function
 */
export async function testAuth(): Promise<void> {
  console.log('[DORY] INFO: testAuth => checking user info...');
  const user = await getUserInfo(false);
  if (user) {
    console.log('[DORY] Auth OK:', { id: user.id, email: user.email });
  } else {
    console.log('[DORY] No user or user declined permission');
  }
}