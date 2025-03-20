import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import ClusterSquare, { ClusterData } from './ClusterSquare';
import { fetchClusterSuggestions, ClusterPage } from '../services/clusteringService';
import './ClusterContainer.css';

interface ClusterContainerProps {
  // Optional prop to control how many clusters to display
  clusterCount?: number;
}

/**
 * Page result interface to match search results structure
 */
type PageResult = ClusterPage;

/**
 * ClusterContainer - Displays cluster squares based on available data.
 * When a cluster is clicked, it will show an expanded view with more details.
 */
const ClusterContainer: React.FC<ClusterContainerProps> = ({ 
  clusterCount = 3
}) => {
  // State for clusters and loading
  const [clusters, setClusters] = useState<ClusterData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // State to track which cluster is expanded (null means none are expanded)
  const [expandedCluster, setExpandedCluster] = useState<ClusterData | null>(null);
  // Reference to the expanded view
  const expandedViewRef = useRef<HTMLDivElement>(null);
  // State for selected page (for keyboard navigation if implemented later)
  const [selectedPageIndex, setSelectedPageIndex] = useState(-1);
  
  // Fetch clusters when the component mounts or clusterCount changes
  useEffect(() => {
    fetchClusters();
  }, [clusterCount]);
  
  // Function to fetch clusters
  const fetchClusters = async () => {
    setIsLoading(true);
    
    try {
      const data = await fetchClusterSuggestions(clusterCount);
      setClusters(data);
      
      // Only set loading to false if we have data to show
      if (data.length > 0) {
        setIsLoading(false);
      }
    } catch (err) {
      console.error('[ClusterContainer] Error fetching clusters:', err);
      setClusters([]); // Set to empty array on error
      // Keep isLoading true on error
    }
    // Removed the finally block that would set isLoading to false unconditionally
  };

  // Handle cluster click
  const handleClusterClick = (cluster?: ClusterData) => {
    if (cluster) {
      setExpandedCluster(cluster);
      // Reset selected page when opening a new cluster
      setSelectedPageIndex(-1);
    }
  };

  // Close expanded view
  const handleCloseExpanded = () => {
    setExpandedCluster(null);
  };
  
  // Handle page click - navigate to the page URL
  const handlePageClick = (page: PageResult) => {
    // Navigate to the page URL
    window.location.href = page.url;
  };

  // Handle clicks outside the expanded view
  useEffect(() => {
    if (!expandedCluster) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        expandedViewRef.current && 
        !expandedViewRef.current.contains(event.target as Node)
      ) {
        handleCloseExpanded();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [expandedCluster]);
  
  // Handle keyboard navigation for pages
  useEffect(() => {
    if (!expandedCluster) return;
    
    // For keyboard navigation, we need to access the top_pages
    // from expanded cluster which comes from the API response
    const pages = (expandedCluster as any).top_pages || [];
    
    const handleKeyDown = (event: KeyboardEvent) => {
      // Only handle keyboard events when the expanded view is visible
      if (!expandedViewRef.current) return;
      
      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          if (pages.length > 0) {
            setSelectedPageIndex(prev => 
              prev < pages.length - 1 ? prev + 1 : 0
            );
          }
          break;
        case 'ArrowUp':
          event.preventDefault();
          if (pages.length > 0) {
            setSelectedPageIndex(prev => 
              prev > 0 ? prev - 1 : pages.length - 1
            );
          }
          break;
        case 'Enter':
          if (selectedPageIndex >= 0 && selectedPageIndex < pages.length) {
            handlePageClick(pages[selectedPageIndex]);
          }
          break;
        case 'Escape':
          handleCloseExpanded();
          break;
        default:
          break;
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [expandedCluster, selectedPageIndex]);

  // Render the expanded view using a portal to render it at the root level
  const renderExpandedView = () => {
    if (!expandedCluster) return null;
    
    // Get pages for this cluster
    const pages = (expandedCluster as any).top_pages || [];
    const hasPages = pages.length > 0;
    
    const view = (
      <div 
        className="expanded-cluster-view"
        ref={expandedViewRef}
      >
        <div className="expanded-cluster-header">
          <h2>{expandedCluster.label}</h2>
        </div>
        <div className="expanded-cluster-content">
          {hasPages ? (
            <ul className="results-list">
              {pages.map((page: PageResult, idx: number) => (
                <li
                  key={page.page_id}
                  className={`result-item ${idx === selectedPageIndex ? 'selected' : ''}`}
                  onClick={() => handlePageClick(page)}
                >
                  <div className="result-title">{page.title}</div>
                  <div className="result-url">{page.url}</div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="status-message">
              No pages to display yet.
            </div>
          )}
        </div>
      </div>
    );
    
    // Render the expanded view at the root level to avoid width constraints
    return ReactDOM.createPortal(
      view,
      document.body
    );
  };

  return (
    <div className="cluster-container">
      {/* Grid for the available squares */}
      <div className="cluster-grid">
        {/* Always create clusterCount squares */}
        {Array.from({ length: clusterCount }).map((_, index) => (
          <ClusterSquare
            key={`cluster-${index}`}
            cluster={clusters[index]} // Will be undefined if no cluster for this index
            isLoading={isLoading} // Simplified - just use the global loading state
            onClick={handleClusterClick}
          />
        ))}
      </div>

      {/* Render the expanded view using a portal */}
      {renderExpandedView()}
    </div>
  );
};

export default ClusterContainer; 