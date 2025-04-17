import React from 'react';
import ThemeToggle from './ThemeToggle'; 
import { useAuth } from '../services/AuthContext'; 
import '../components/LoginPage.css'; 

const LoginPage: React.FC = () => {
  // Get the login function from the auth hook
  const { login } = useAuth();

  return (
    <div className="app-container">
      <header className="app-header">
        {/* Empty header to match home page structure */}
      </header>
      
      <main className="main-content">
        <div className="content-container login-content">
          <div className="dory-container">
            <div className="dory-text">
              Dynamic Online Recall for You
            </div>
          </div>
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
      </main>
      
      <footer className="app-footer">
        <ThemeToggle />
      </footer>
    </div>
  );
};

export default LoginPage;
