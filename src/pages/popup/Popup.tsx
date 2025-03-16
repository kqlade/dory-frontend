import { useEffect, useState } from 'react';
import { checkAuth, login, logout, type UserInfo } from '../../services/authService';
import { GoogleLoginButton } from 'react-social-login-buttons';
import './popup.css';

declare global {
  interface Window {
    chrome: typeof chrome;
  }
}

/**
 * Get user information directly from storage
 */
async function getUserFromStorage(): Promise<UserInfo | null> {
  try {
    const data = await chrome.storage.local.get(['user']);
    return data.user || null;
  } catch (error) {
    console.error('[Popup] Error getting user from storage:', error);
    return null;
  }
}

export default function Popup() {
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
    // Check authentication status when popup opens
    const checkAuthStatus = async () => {
      try {
        const isAuthenticated = await checkAuth();
        const user = isAuthenticated ? await getUserFromStorage() : null;
        setAuthState({
          isAuthenticated,
          user,
          isLoading: false
        });
      } catch (error) {
        console.error('Auth check failed:', error);
        setAuthState(prev => ({ ...prev, isLoading: false }));
      }
    };

    checkAuthStatus();
  }, []);

  const handleLogin = () => {
    login();
    window.close(); // Close popup for Chrome identity flow
  };

  const handleLogout = async () => {
    try {
      await logout();
      setAuthState({
        isAuthenticated: false,
        user: null,
        isLoading: false
      });
    } catch (error) {
      console.error('Logout failed:', error);
    }
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
        <h3>Welcome to Dory</h3>
        <p>Please sign in to continue</p>
        <GoogleLoginButton
          onClick={handleLogin}
          align="center"
          style={{
            width: '100%',
            maxWidth: '220px',
            fontSize: '14px',
            margin: '10px 0'
          }}
        />
      </div>
    );
  }

  return (
    <div className="popup-container">
      <h3>
        Welcome, {authState.user?.name || authState.user?.email || 'User'}
      </h3>
      {authState.user?.picture && (
        <img
          src={authState.user.picture}
          alt="Profile"
          className="user-avatar"
        />
      )}
      <div className="button-container">
        <button 
          onClick={handleLogout}
          className="logout-button"
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}