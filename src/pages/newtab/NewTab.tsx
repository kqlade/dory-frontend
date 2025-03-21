import React, { useState, useEffect } from 'react';
import NewTabSearchBar from '../../components/NewTabSearchBar';
import ClusterContainer from '../../components/ClusterContainer';
import ThemeToggle from '../../components/ThemeToggle';
import { checkAuth, login } from '../../services/authService';
import { MessageType } from '../../utils/messageSystem';
import { fetchClusterSuggestions } from '../../services/clusteringService';
import './newtab.css';

/**
 * This page renders the "DORY" text, the search bar, cluster squares, and the ThemeToggle.
 * When user is not authenticated, it shows a sign-in button instead of search and clusters.
 */
const NewTab: React.FC = () => {
  // Add state to track if search is active
  const [isSearchActive, setIsSearchActive] = useState(false);
  // Add auth state
  const [authState, setAuthState] = useState<{
    isAuthenticated: boolean;
    isLoading: boolean;
  }>({
    isAuthenticated: false,
    isLoading: true
  });
  // Add state to track if we have clusters
  const [hasClusters, setHasClusters] = useState(false);

  // Check authentication status
  useEffect(() => {
    const checkUserAuth = async () => {
      try {
        // Check if the user is authenticated
        const isAuthenticated = await checkAuth();
        setAuthState({ isAuthenticated, isLoading: false });
      } catch (err) {
        console.error('[NewTab] checkAuth error:', err);
        setAuthState({ isAuthenticated: false, isLoading: false });
      }
    };

    checkUserAuth();

    // Listen for auth messages (e.g., when auth state changes)
    const handleMessage = (message: any) => {
      if (message.type === MessageType.AUTH_RESULT) {
        const isAuth = message.data.isAuthenticated;
        setAuthState({ isAuthenticated: isAuth, isLoading: false });
      }
    };

    // Set up the message listener
    chrome.runtime.onMessage.addListener(handleMessage);

    // Clean up when the component unmounts
    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, []);

  // Check for clusters when authenticated
  useEffect(() => {
    const checkForClusters = async () => {
      if (authState.isAuthenticated) {
        try {
          const clusters = await fetchClusterSuggestions(3);
          setHasClusters(clusters.length > 0);
        } catch (error) {
          console.error('[NewTab] Error checking for clusters:', error);
          setHasClusters(false);
        }
      }
    };
    
    checkForClusters();
  }, [authState.isAuthenticated]);

  const handleSignIn = () => {
    // This is the key function that's being reused from the popup
    login(); 
  };

  // Show loading state for the entire component while checking auth
  if (authState.isLoading) {
    return (
      <div className="newtab-container">
        <div className="dory-container">
          <div className="dory-text">
            Dynamic Online Recall for You
          </div>
        </div>
        <div className="loading-indicator">
          <p>Loading...</p>
        </div>
        <ThemeToggle />
      </div>
    );
  }

  // Not authenticated - show login button
  if (!authState.isAuthenticated) {
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
  }

  // Authenticated - show regular content with search bar and clusters
  return (
    <div className="newtab-container">
      {/* DORY heading */}
      <div className="dory-container">
        <div className="dory-text">
          Dynamic Online Recall for You
        </div>
      </div>

      {/* Positioned wrapper for the search bar */}
      <div className="search-bar-wrapper">
        <NewTabSearchBar onSearchStateChange={setIsSearchActive} />
      </div>

      {/* Cluster container - only shown if search is not active AND we have clusters */}
      {!isSearchActive && hasClusters && (
        <div className="clusters-wrapper">
          <ClusterContainer />
        </div>
      )}

      {/* Theme toggle button */}
      <ThemeToggle />
    </div>
  );
};

export default NewTab;