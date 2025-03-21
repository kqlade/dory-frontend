import React from 'react';
import ThemeToggle from '../../components/ThemeToggle';
import { login } from '../../services/authService';
import './landing.css';

/**
 * Landing page component that exactly mirrors the unauthenticated state of NewTab.
 */
const Landing: React.FC = () => {
  const handleSignIn = () => {
    // Uses the same login function as NewTab
    login();
  };

  return (
    <div className="newtab-container">
      <div className="dory-container">
        <div className="dory-text">
          Dynamic Online Recall for You
        </div>
      </div>
      <div className="search-bar-wrapper">
        <div className="google-button-container">
          <button 
            className="google-sign-in-button"
            onClick={handleSignIn}
          >
            Sign in with Google
          </button>
        </div>
      </div>
      <ThemeToggle />
    </div>
  );
};

export default Landing; 