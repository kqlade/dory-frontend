/**
 * @file InPagePopup.tsx
 * React UI for the in-page DORY popup.
 */

import { useEffect, useState } from 'react';
import { checkAuth, login, logout } from '../../services/authService';
import { MessageType, createMessage } from '../../utils/messageSystem';

interface UserInfo {
  id: string;
  name?: string;
  email: string;
  picture?: string;
}

export default function InPagePopup() {
  const [authState, setAuthState] = useState<{
    isAuthenticated: boolean;
    user: UserInfo | null;
    isLoading: boolean;
  }>({
    isAuthenticated: false,
    user: null,
    isLoading: true
  });

  useEffect(() => {
    (async () => {
      try {
        const isAuthenticated = await checkAuth();
        const userInfo = isAuthenticated ? await getUserFromStorage() : null;
        setAuthState({ isAuthenticated, user: userInfo, isLoading: false });
      } catch (err) {
        console.error('[InPagePopup] checkAuth error:', err);
        setAuthState((prev) => ({ ...prev, isLoading: false }));
      }
    })();

    const handleMessage = (message: any) => {
      if (message.type === MessageType.AUTH_RESULT) {
        const isAuth = message.data.isAuthenticated;
        if (isAuth) {
          getUserFromStorage().then((u) => {
            setAuthState({ isAuthenticated: true, user: u, isLoading: false });
          });
        } else {
          setAuthState({ isAuthenticated: false, user: null, isLoading: false });
        }
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);

    chrome.runtime.sendMessage(createMessage(MessageType.POPUP_READY, {}, 'content'));

    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, []);

  const handleSignIn = () => {
    login(); // content script -> background
  };

  const handleLogout = async () => {
    await logout();
    setAuthState({ isAuthenticated: false, user: null, isLoading: false });
  };

  if (authState.isLoading) {
    return (
      <div className="popup-container">
        <p>Loading...</p>
      </div>
    );
  }

  if (!authState.isAuthenticated) {
    return (
      <div className="popup-container">
        <h3>Welcome to DORY</h3>
        <button onClick={handleSignIn} className="login-button">
          Sign In with Google
        </button>
      </div>
    );
  }

  // Authenticated
  return (
    <div className="popup-container">
      <h3>Hello, {authState.user?.name || authState.user?.email}</h3>
      {authState.user?.picture && (
        <img src={authState.user.picture} alt="Profile" className="user-avatar" />
      )}
      <button className="logout-button" onClick={handleLogout}>
        Sign Out
      </button>
    </div>
  );
}

/** Helper to read user from local storage */
async function getUserFromStorage(): Promise<UserInfo | null> {
  try {
    const data = await chrome.storage.local.get(['user']);
    return data.user || null;
  } catch (err) {
    console.error('[InPagePopup] getUserFromStorage error:', err);
    return null;
  }
}