import React from 'react';
import ThemeToggle from './ThemeToggle'; 
import { useAuth } from '../hooks/useBackgroundAuth'; 
import '../components/LoginPage.css'; 

const LoginPage: React.FC = () => {
  // Get the login function from the auth hook
  const { login } = useAuth();

  return (
    <div className="newtab-container"> {/* Use existing container class */} 
      <div className="dory-container">
        <div className="dory-text">
          Dynamic Online Recall for You
        </div>
      </div>
      {/* Consider a more semantic class name if this only holds the button */}
      <div className="search-bar-wrapper">
        <div className="google-button-container">
          <button
            className="google-sign-in-button"
            onClick={() => {
              const clickId = Math.random();
              console.log(`[LoginPage] onClick triggered. ID: ${clickId}`);
              console.log('[LoginPage] Sign in button clicked');
              login();
            }}
          >
            Sign in with Google
          </button>
        </div>
      </div>
      <ThemeToggle /> {/* Include the ThemeToggle */} 
    </div>
  );
};

export default LoginPage;
