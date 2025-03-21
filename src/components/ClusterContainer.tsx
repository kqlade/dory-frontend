import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import ClusterSquare from './ClusterSquare';
import { 
  fetchClusterSuggestions, 
  ClusterSuggestion,
  ClusterPage
} from '../services/clusteringService';
import './ClusterContainer.css';

interface ClusterContainerProps {
  clusterCount?: number;
}

/**
 * ClusterContainer - Displays cluster squares based on available data.
 * When a cluster is clicked, it will show an expanded view with more details.
 */
const ClusterContainer: React.FC<ClusterContainerProps> = ({ 
  clusterCount = 3
}) => {
  // State for clusters data
  const [clusters, setClusters] = useState<ClusterSuggestion[]>([]);
  
  // State to track which cluster is expanded (null means none are expanded)
  const [expandedCluster, setExpandedCluster] = useState<ClusterSuggestion | null>(null);

  // Reference to the expanded view
  const expandedViewRef = useRef<HTMLDivElement>(null);

  // State for selected page index (for keyboard navigation)
  const [selectedPageIndex, setSelectedPageIndex] = useState(-1);

  // Fetch clusters when the component mounts or clusterCount changes
  useEffect(() => {
    fetchClusters();
  }, [clusterCount]);

  // Function to fetch clusters
  const fetchClusters = async () => {
    try {
      const data = await fetchClusterSuggestions(clusterCount);
      console.log('[ClusterContainer] Received clusters:', data);
      setClusters(data);
    } catch (err) {
      console.error('[ClusterContainer] Error fetching clusters:', err);
    }
  };

  // Handle cluster click
  const handleClusterClick = (cluster?: ClusterSuggestion) => {
    if (cluster) {
      setExpandedCluster(cluster);
      setSelectedPageIndex(-1);
    }
  };

  // Close expanded view
  const handleCloseExpanded = () => {
    setExpandedCluster(null);
  };
  
  // Handle page click - navigate to the page URL
  const handlePageClick = (page: ClusterPage) => {
    window.location.href = page.url;
    // or window.open(page.url, '_blank');
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
    
    const pages = expandedCluster.top_pages || [];
    
    const handleKeyDown = (event: KeyboardEvent) => {
      // Only handle keys if the pop-up is open
      if (!expandedViewRef.current) return;
      
      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          if (pages.length > 0) {
            setSelectedPageIndex(prev => (prev < pages.length - 1 ? prev + 1 : 0));
          }
          break;
        case 'ArrowUp':
          event.preventDefault();
          if (pages.length > 0) {
            setSelectedPageIndex(prev => (prev > 0 ? prev - 1 : pages.length - 1));
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

  // Render the expanded view using a portal
  const renderExpandedView = () => {
    if (!expandedCluster) return null;
    
    const pages = expandedCluster.top_pages || [];
    const hasPages = pages.length > 0;
    
    const view = (
      <div className="expanded-cluster-view" ref={expandedViewRef}>
        <div className="expanded-cluster-header">
          <h2>{expandedCluster.label}</h2>
        </div>
        <div className="expanded-cluster-content">
          {hasPages ? (
            <ul className="results-list">
              {pages.map((page, idx) => (
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
    
    // Portal to <body> to avoid container overflow
    return ReactDOM.createPortal(view, document.body);
  };

  return (
    <div className="cluster-container">
      <div className="cluster-grid">
        {clusters.length > 0 ? (
          // Only show clusters if we have data
          Array.from({ length: Math.min(clusterCount, clusters.length) }).map((_, index) => {
            const clusterData = clusters[index];
            return (
              <ClusterSquare
                key={`cluster-${index}`}
                cluster={clusterData}
                onClick={handleClusterClick}
              />
            );
          })
        ) : null}
      </div>
      {renderExpandedView()}
    </div>
  );
};

export default ClusterContainer;