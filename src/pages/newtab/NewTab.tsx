import React, { useState, useEffect, useRef } from 'react';
import NewTabSearchBar from '../../components/NewTabSearchBar';
import ClusterContainer from '../../components/ClusterContainer';
import ThemeToggle from '../../components/ThemeToggle';
import { checkAuth, login } from '../../services/authService';
import { MessageType } from '../../utils/messageSystem';
import { ClusterSuggestion } from '../../services/clusteringService';
import './newtab.css';

// Key for cluster storage
const CLUSTER_HISTORY_KEY = 'clusterHistory';

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
  // Add state for current and previous clusters
  const [currentClusters, setCurrentClusters] = useState<ClusterSuggestion[]>([]);
  const [previousClusters, setPreviousClusters] = useState<ClusterSuggestion[]>([]);
  // Add state to track whether to show previous clusters
  const [showPreviousClusters, setShowPreviousClusters] = useState(false);

  // Ref for the search bar wrapper to help query within it
  const searchBarWrapperRef = useRef<HTMLDivElement>(null);

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

  // Load clusters directly from storage when authenticated
  useEffect(() => {
    const loadClusters = async () => {
      if (authState.isAuthenticated) {
        try {
          // Read directly from storage instead of calling fetchClusterSuggestions
          const storage = await chrome.storage.local.get(CLUSTER_HISTORY_KEY);
          const history = storage[CLUSTER_HISTORY_KEY] || {};
          
          // Set both current and previous clusters from storage
          setCurrentClusters(history.current || []);
          setPreviousClusters(history.previous || []);
          
          console.log('[NewTab] Loaded clusters from storage:', 
            `current: ${history.current?.length || 0}, previous: ${history.previous?.length || 0}`);
        } catch (error) {
          console.error('[NewTab] Error loading clusters from storage:', error);
        }
      }
    };
    
    loadClusters();
    
    // Also listen for cluster updates to refresh from storage after animation
    const handleClusterUpdate = (message: any) => {
      if (message.type === MessageType.CLUSTERS_UPDATED && authState.isAuthenticated) {
        // Wait slightly longer than the animation (3 seconds) to update
        setTimeout(async () => {
          await loadClusters();
        }, 3100); // 3.1 seconds
      }
    };
    
    chrome.runtime.onMessage.addListener(handleClusterUpdate);
    
    return () => {
      chrome.runtime.onMessage.removeListener(handleClusterUpdate);
    };
  }, [authState.isAuthenticated]);

  // Add keyboard shortcut listener for Alt+P / Option+P
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Alt+P (Windows) or Option+P (Mac)
      if ((e.altKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        // Only toggle if previous clusters exist
        if (previousClusters.length > 0) {
          setShowPreviousClusters(prev => !prev);
          console.log('[NewTab] Toggled to', !showPreviousClusters ? 'previous' : 'current', 'clusters');
        } else {
          console.log('[NewTab] No previous clusters available to toggle');
        }
      }
    };

    // Add the event listener
    document.addEventListener('keydown', handleKeyDown);

    // Clean up
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [previousClusters.length, showPreviousClusters]);

  // --- NEW useEffect for Autofocus ---
  useEffect(() => {
    // Only run if authenticated and the wrapper ref is available
    if (authState.isAuthenticated && searchBarWrapperRef.current) {
      // Use a short timeout to potentially bypass Chrome's focus restrictions
      const focusTimeoutId = setTimeout(() => {
        // Try to find the input element within the search bar component
        // Adjust the selector if the actual input has a specific ID or class
        const inputElement = searchBarWrapperRef.current?.querySelector<HTMLInputElement>(
          'input[type="search"], input[type="text"]' // Common selectors for search inputs
        );
        if (inputElement) {
          inputElement.focus();
          console.log('[NewTab] Attempted to focus search input.');
        } else {
          console.warn('[NewTab] Could not find search input element to focus.');
        }
      }, 100); // 100ms delay

      // Cleanup the timeout if the component unmounts or auth state changes
      return () => clearTimeout(focusTimeoutId);
    }
  }, [authState.isAuthenticated]); // Depend on authentication state

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

  // Get the appropriate clusters based on toggle state
  const displayClusters = showPreviousClusters ? previousClusters : currentClusters;

  // Authenticated - show regular content with search bar and clusters
  return (
    <div className="newtab-container">
      {/* DORY heading */}
      <div className="dory-container">
        <div className="dory-text">
          Dynamic Online Recall for You
        </div>
      </div>

      {/* Positioned wrapper for the search bar - ADD REF HERE */}
      <div className="search-bar-wrapper" ref={searchBarWrapperRef}>
        <NewTabSearchBar onSearchStateChange={setIsSearchActive} />
      </div>

      {/* Cluster container - only shown if search is not active AND we have clusters */}
      {!isSearchActive && displayClusters.length > 0 && (
        <div className="clusters-wrapper">
          <ClusterContainer clusters={displayClusters} />
        </div>
      )}

      {/* Theme toggle button */}
      <ThemeToggle />
    </div>
  );
};

export default NewTab;