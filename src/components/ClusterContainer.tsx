import React, { useState, useEffect, useRef, WheelEvent } from 'react';
import ReactDOM from 'react-dom';
import ClusterSquare from './ClusterSquare';
import { 
  fetchClusterSuggestions, 
  ClusterSuggestion,
  ClusterPage
} from '../services/clusteringService';
import { MessageType } from '../utils/messageSystem';
import './ClusterContainer.css';

interface ClusterContainerProps {
  clusters?: ClusterSuggestion[];
  clusterCount?: number;
}

/**
 * ClusterContainer - Displays cluster squares based on available data.
 * When a cluster is clicked, it will show an expanded view with more details.
 */
const ClusterContainer: React.FC<ClusterContainerProps> = ({ 
  clusters = [],
  clusterCount = 3
}) => {
  // State to track which cluster is expanded (null means none are expanded)
  const [expandedCluster, setExpandedCluster] = useState<ClusterSuggestion | null>(null);

  // State to track if we're showing loading animation for new clusters
  const [isLoadingNewClusters, setIsLoadingNewClusters] = useState(false);
  
  // State for the starting index of the visible window (showing 3 items at a time)
  const [startIndex, setStartIndex] = useState(0);

  // Reference to the expanded view
  const expandedViewRef = useRef<HTMLDivElement>(null);

  // State for selected page index (for keyboard navigation)
  const [selectedPageIndex, setSelectedPageIndex] = useState(-1);
  
  // Listen for cluster update messages
  useEffect(() => {
    const handleMessage = (message: any) => {
      if (message.type === MessageType.CLUSTERS_UPDATED) {
        console.log('[ClusterContainer] Received CLUSTERS_UPDATED message');
        
        // Show loading animation for 3 seconds
        setIsLoadingNewClusters(true);
        
        // After 3 seconds, refresh the display with latest data
        setTimeout(() => {
          setIsLoadingNewClusters(false);
        }, 3000);
      }
    };
    
    // Add message listener
    chrome.runtime.onMessage.addListener(handleMessage);
    
    // Remove listener on cleanup
    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, []);

  // Handle cluster click
  const handleClusterClick = (cluster?: ClusterSuggestion) => {
    if (cluster) {
      setExpandedCluster(cluster);
      setSelectedPageIndex(-1);
      // Reset start index when opening a new cluster
      setStartIndex(0);
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
  
  // Handle scroll events to shift the visible window
  const handleScroll = (event: WheelEvent<HTMLUListElement>) => {
    if (!expandedCluster) return;
    
    const pages = expandedCluster.top_pages || [];
    const maxStartIndex = Math.max(0, pages.length - 3);
    
    if (event.deltaY > 0 && startIndex < maxStartIndex) {
      // Scrolling down
      event.preventDefault();
      setStartIndex(prev => Math.min(prev + 1, maxStartIndex));
    } else if (event.deltaY < 0 && startIndex > 0) {
      // Scrolling up
      event.preventDefault();
      setStartIndex(prev => Math.max(prev - 1, 0));
    }
  };
  
  // Handle keyboard navigation for pages
  useEffect(() => {
    if (!expandedCluster) return;
    
    const pages = expandedCluster.top_pages || [];
    const maxStartIndex = Math.max(0, pages.length - 3);
    
    const handleKeyDown = (event: KeyboardEvent) => {
      // Only handle keys if the pop-up is open
      if (!expandedViewRef.current) return;
      
      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          if (pages.length > 0) {
            const newSelectedIndex = selectedPageIndex < pages.length - 1 
              ? selectedPageIndex + 1 
              : 0;
            
            setSelectedPageIndex(newSelectedIndex);
            
            // Adjust the window if necessary
            if (newSelectedIndex >= startIndex + 3) {
              setStartIndex(Math.min(newSelectedIndex - 2, maxStartIndex));
            } else if (newSelectedIndex < startIndex) {
              setStartIndex(newSelectedIndex);
            }
          }
          break;
        case 'ArrowUp':
          event.preventDefault();
          if (pages.length > 0) {
            const newSelectedIndex = selectedPageIndex > 0 
              ? selectedPageIndex - 1 
              : pages.length - 1;
            
            setSelectedPageIndex(newSelectedIndex);
            
            // Adjust the window if necessary
            if (newSelectedIndex < startIndex) {
              setStartIndex(newSelectedIndex);
            } else if (newSelectedIndex >= startIndex + 3) {
              setStartIndex(newSelectedIndex - 2);
            }
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
  }, [expandedCluster, selectedPageIndex, startIndex]);

  // Render the expanded view using a portal
  const renderExpandedView = () => {
    if (!expandedCluster) return null;
    
    const pages = expandedCluster.top_pages || [];
    const hasPages = pages.length > 0;
    
    // Create a slice of 3 items from the current startIndex
    const visiblePages = hasPages 
      ? pages.slice(startIndex, startIndex + 3) 
      : [];
    
    const view = (
      <div className="expanded-cluster-view" ref={expandedViewRef}>
        <div className="expanded-cluster-header">
          <h2>{expandedCluster.label}</h2>
        </div>
        <div className="expanded-cluster-content">
          {hasPages ? (
            <ul 
              className="results-list"
              onWheel={handleScroll}
            >
              {visiblePages.map((page, idx) => {
                // Calculate the actual index in the full list
                const actualIndex = startIndex + idx;
                return (
                  <li
                    key={page.page_id}
                    className={`result-item ${actualIndex === selectedPageIndex ? 'selected' : ''}`}
                    onClick={() => handlePageClick(page)}
                  >
                    <div className="result-title">{page.title}</div>
                    <div className="result-url">{page.url}</div>
                  </li>
                );
              })}
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
            // When loading new clusters, pass undefined to show loading animation
            const clusterData = isLoadingNewClusters ? undefined : clusters[index];
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