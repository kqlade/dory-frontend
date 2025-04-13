/**
 * @file SidePanel.tsx
 * React UI for the Chrome side panel DORY authentication.
 */

import React from 'react';
import { useAuth } from '../../hooks/useBackgroundAuth';
import useBackgroundPreferences from '../../hooks/useBackgroundPreferences';

export default function SidePanel() {
  // Use our auth hook to manage authentication
  const { isAuthenticated, loading, login, logout } = useAuth();
  
  // Initialize theme preferences - automatically applies dark/light mode
  useBackgroundPreferences();

  const handleSignIn = () => {
    const clickId = Math.random();
    console.log(`[SidePanel] handleSignIn triggered. ID: ${clickId}`);
    console.log('[SidePanel] Sign in button clicked');
    // Trigger login flow
    login(); 
  };

  const handleLogout = () => {
    // Trigger logout flow
    logout();
  };

  // Show loading state
  if (loading) {
    return (
      <div className="sidepanel-container">
        <div className="loading-indicator">
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  // Not authenticated - show login
  if (!isAuthenticated) {
    return (
      <div className="sidepanel-container">
        <div className="user-section">
          <div className="dory-text">
            Dynamic Online Recall for You
          </div>
          <div className="google-button-container">
            <button 
              className="google-sign-in-button"
              onClick={handleSignIn}
            >
              Sign in with Google
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Authenticated - show user info and logout button
  return (
    <div className="sidepanel-container">
      <div className="user-section">
        <div className="dory-text">
          Dynamic Online Recall for You
        </div>
        <div className="google-button-container">
          <button className="logout-button" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </div>
      <div className="content-area">
        {/* Additional functionality can be added here in the future */}
      </div>
    </div>
  );
}
