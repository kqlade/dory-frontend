import React, { useState, useEffect } from 'react';
import NewTabSearchBar from '../../components/NewTabSearchBar';
import ClusterContainer from '../../components/ClusterContainer';
import ThemeToggle from '../../components/ThemeToggle';
import { ClusterData } from '../../components/ClusterSquare';
import { checkAuth, login } from '../../services/authService';
import { MessageType } from '../../utils/messageSystem';
import './newtab.css';

/**
 * This page renders the "DORY" text, the search bar, cluster squares, and the ThemeToggle.
 * When user is not authenticated, it shows a sign-in button instead of search and clusters.
 */
const NewTab: React.FC = () => {
  // Mock clusters data (this would typically come from an API)
  const [clusters, setClusters] = useState<(ClusterData | undefined)[]>([]);
  const [isLoading, setIsLoading] = useState(true);
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

  // Simulate loading clusters data
  useEffect(() => {
    // Only fetch clusters if authenticated
    if (!authState.isAuthenticated) return;

    // In a real implementation, this would be an API call
    const fetchClusters = async () => {
      setIsLoading(true);
      
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Check if there's real content (this would be a real API call to check for user data)
      const hasRealContent = false; // Change this to true to simulate having real content

      if (hasRealContent) {
        // Mock data - in a real implementation, this would come from the API
        const mockClusters: ClusterData[] = [
          {
            id: 'cluster-1',
            label: 'Programming & Development',
            page_count: 12
          },
          {
            id: 'cluster-2',
            label: 'News Media',
            page_count: 8
          }
        ];
        setClusters(mockClusters);
      } else {
        // If there's no real content, set an empty array
        setClusters([]);
      }
      
      setIsLoading(false);
    };

    fetchClusters();
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

      {/* Cluster container - only shown if there are clusters and search is not active */}
      {!isSearchActive && clusters.length > 0 && (
        <div className="clusters-wrapper">
          <ClusterContainer 
            clusters={clusters}
            isLoading={isLoading}
          />
        </div>
      )}

      {/* Theme toggle button */}
      <ThemeToggle />
    </div>
  );
};

export default NewTab;