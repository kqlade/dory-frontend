import React, { useState, useEffect, useRef } from 'react';
import NewTabSearchBar from '../../components/NewTabSearchBar';
import ClusterContainer from '../../components/ClusterContainer';
import ThemeToggle from '../../components/ThemeToggle';
import { useAuth } from '../../hooks/useBackgroundAuth';
import useBackgroundClustering from '../../hooks/useBackgroundClustering';
import { detectOS } from '../../utils/osUtils';
import './newtab.css';

/**
 * NewTab page component for the Dory extension.
 * Serves as a composition layer for the primary Dory components.
 */

const NewTab: React.FC = () => {
  // Track if search is active to conditionally show/hide clusters
  const [isSearchActive, setIsSearchActive] = useState(false);
  
  // Use our auth hook to manage authentication
  const { isAuthenticated, loading: authLoading, login } = useAuth();
  
  // Use our clustering hook to manage clusters
  const { 
    clusters: currentClusters, 
    previousClusters,
    loading: clustersLoading
  } = useBackgroundClustering();
  
  // State to toggle between current and previous clusters
  const [showPreviousClusters, setShowPreviousClusters] = useState(false);
  
  // Ref for the search bar wrapper to help with autofocus
  const searchBarWrapperRef = useRef<HTMLDivElement>(null);

  // Toggle between current and previous clusters
  const toggleClusterView = () => {
    if (previousClusters.length > 0) {
      setShowPreviousClusters(prev => !prev);
      console.log('[NewTab] Toggled to', !showPreviousClusters ? 'previous' : 'current', 'clusters');
    } else {
      console.log('[NewTab] No previous clusters available to toggle');
    }
  };

  // Handle keyboard shortcut commands
  useEffect(() => {
    const handleCommand = (command: string) => {
      if (command === 'toggle-cluster-view') {
        toggleClusterView();
      }
    };
    
    // Add command listener for keyboard shortcuts defined in manifest.json
    chrome.commands?.onCommand?.addListener(handleCommand);
    
    return () => {
      chrome.commands?.onCommand?.removeListener(handleCommand);
    };
  }, [previousClusters.length]);

  // Autofocus search input when authenticated
  useEffect(() => {
    if (isAuthenticated && searchBarWrapperRef.current) {
      const focusTimeoutId = setTimeout(() => {
        const inputElement = searchBarWrapperRef.current?.querySelector<HTMLInputElement>(
          'input[type="text"]'
        );
        if (inputElement) {
          inputElement.focus();
          console.log('[NewTab] Focused search input');
        }
      }, 100);

      return () => clearTimeout(focusTimeoutId);
    }
  }, [isAuthenticated]);

  // Show loading state while checking auth
  if (authLoading) {
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
  if (!isAuthenticated) {
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
              onClick={login}
            >
              Sign in with Google
            </button>
          </div>
        </div>
        <ThemeToggle />
      </div>
    );
  }

  // Determine which clusters to display based on toggle state
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

      {/* Search section with search bar and helper text */}
      <div className="search-section">
        {/* Search bar wrapper */}
        <div className="search-bar-wrapper" ref={searchBarWrapperRef}>
          <NewTabSearchBar onSearchStateChange={setIsSearchActive} />
        </div>

        {/* Helper text for keyboard shortcut - OS specific */}
        <div className="shortcut-helper-text">
          Press {detectOS() === 'Mac OS' ? '⌘' : 'Ctrl'}+Shift+K to search from any page
        </div>
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