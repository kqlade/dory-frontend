/**
 * @file SidePanel.tsx
 * React UI for the Chrome side panel DORY authentication.
 */

import { useEffect, useState } from 'react';
import { checkAuth, login, logout } from '../../services/authService';
import { MessageType, createMessage } from '../../utils/messageSystem';
import GoogleButton from 'react-google-button';

interface UserInfo {
  id: string;
  name?: string;
  email: string;
  picture?: string;
}

export default function SidePanel() {
  const [authState, setAuthState] = useState<{
    isAuthenticated: boolean;
    user: UserInfo | null;
    isLoading: boolean;
  }>({
    isAuthenticated: false,
    user: null,
    isLoading: true
  });

  // Get the current theme
  const [isDarkMode, setIsDarkMode] = useState(false);
  
  useEffect(() => {
    // Check for dark mode
    try {
      const storedTheme = localStorage.getItem('preferredTheme');
      const systemDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
      setIsDarkMode(storedTheme === 'dark' || (!storedTheme && systemDarkMode));
    } catch (err) {
      console.error('[SidePanel] Error checking theme:', err);
    }

    (async () => {
      try {
        // Check if the user is authenticated
        const isAuthenticated = await checkAuth();
        
        // If authenticated, get their info from storage
        const userInfo = isAuthenticated ? await getUserFromStorage() : null;
        
        // Update our state
        setAuthState({ isAuthenticated, user: userInfo, isLoading: false });
      } catch (err) {
        console.error('[SidePanel] checkAuth error:', err);
        setAuthState((prev) => ({ ...prev, isLoading: false }));
      }
    })();

    // Listen for auth messages (e.g., when auth state changes)
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

    // Set up the message listener
    chrome.runtime.onMessage.addListener(handleMessage);

    // Notify that the side panel is ready
    chrome.runtime.sendMessage(createMessage(MessageType.SIDEPANEL_READY, {}, 'content'));

    // Clean up when the component unmounts
    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, []);

  const handleSignIn = () => {
    // This is the key function that's being reused from the popup
    login(); 
  };

  const handleLogout = async () => {
    await logout();
    setAuthState({ isAuthenticated: false, user: null, isLoading: false });
  };

  // Show loading state
  if (authState.isLoading) {
    return (
      <div className="sidepanel-container">
        <div className="loading-indicator">
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  // Not authenticated - show login
  if (!authState.isAuthenticated) {
    return (
      <div className="sidepanel-container">
        <div className="user-section">
          <h3>Welcome to DORY</h3>
          <div className="google-button-container">
            <GoogleButton 
              onClick={handleSignIn}
              type={isDarkMode ? 'dark' : 'light'}
              label="Sign in with Google"
            />
          </div>
        </div>
      </div>
    );
  }

  // Get first name for greeting
  const firstName = getFirstName(authState.user);

  // Authenticated - show user info and logout button
  return (
    <div className="sidepanel-container">
      <div className="user-section">
        <h3>Hello, {firstName}</h3>
        {authState.user?.picture && (
          <img src={authState.user.picture} alt="Profile" className="user-avatar" />
        )}
        <p>You're signed in to DORY.</p>
        <button className="logout-button" onClick={handleLogout}>
          Sign Out
        </button>
      </div>
      <div className="content-area">
        {/* Additional functionality can be added here in the future */}
      </div>
    </div>
  );
}

/** Extract the first name from the user info */
function getFirstName(user: UserInfo | null): string {
  if (!user) return '';
  
  // If we have a name, use the first part as the first name
  if (user.name) {
    return user.name.split(' ')[0];
  }
  
  // If we only have an email, use the part before @
  if (user.email) {
    return user.email.split('@')[0];
  }
  
  return '';
}

/** Helper to read user from local storage */
async function getUserFromStorage(): Promise<UserInfo | null> {
  try {
    const data = await chrome.storage.local.get(['user']);
    return data.user || null;
  } catch (err) {
    console.error('[SidePanel] getUserFromStorage error:', err);
    return null;
  }
} 