import React, { useState, useEffect } from 'react';
import NewTabSearchBar from '../../components/NewTabSearchBar';
import ClusterContainer from '../../components/ClusterContainer';
import ThemeToggle from '../../components/ThemeToggle';
import { ClusterData } from '../../components/ClusterSquare';
import './newtab.css';

/**
 * This page renders the "DORY" text, the search bar, cluster squares, and the ThemeToggle.
 */
const NewTab: React.FC = () => {
  // Mock clusters data (this would typically come from an API)
  const [clusters, setClusters] = useState<(ClusterData | undefined)[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // Add state to track if search is active
  const [isSearchActive, setIsSearchActive] = useState(false);

  // Simulate loading clusters data
  useEffect(() => {
    // In a real implementation, this would be an API call
    const fetchClusters = async () => {
      setIsLoading(true);
      
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 1500));
      
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
        // Third square will show "Still learning..." since we only provide 2 clusters
      ];
      
      setClusters(mockClusters);
      setIsLoading(false);
    };

    fetchClusters();
  }, []);

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

      {/* Cluster container for displaying cluster squares */}
      {!isSearchActive && (
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