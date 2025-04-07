import React, { useState, useEffect, useRef, WheelEvent } from 'react';
import ReactDOM from 'react-dom';
import ClusterSquare from './ClusterSquare';
import { ClusterSuggestion, ClusterPage } from '../types';
import { UI_CONFIG } from '../config';
import './ClusterContainer.css';

interface ClusterContainerProps {
  clusters?: ClusterSuggestion[];
}

/**
 * Displays a grid of cluster squares. Clicking a cluster shows an expanded view with pages.
 * Shows only the exact number of clusters available, up to a maximum of 6.
 * Shows no boxes when there are no clusters.
 */
const ClusterContainer: React.FC<ClusterContainerProps> = ({
  clusters = [],
}) => {
  const [expandedCluster, setExpandedCluster] = useState<ClusterSuggestion | null>(null);
  const [startIndex, setStartIndex] = useState(0);
  const [selectedPageIndex, setSelectedPageIndex] = useState(-1);
  const [isLoading, setIsLoading] = useState(true);
  const expandedViewRef = useRef<HTMLDivElement>(null);

  // Use clusters from props, limited to max 6
  const displayClusters = clusters.slice(0, 6);

  // Show loading animation for a short period when component mounts
  useEffect(() => {
    // Only show loading animation if we have clusters to display
    if (displayClusters.length > 0) {
      const timer = setTimeout(() => {
        setIsLoading(false);
      }, UI_CONFIG.CLUSTER_LOADING_DURATION_MS);
      
      return () => clearTimeout(timer);
    } else {
      // If no clusters, don't show loading
      setIsLoading(false);
    }
  }, []);

  // Opens expanded view for a cluster
  const handleClusterClick = (cluster?: ClusterSuggestion) => {
    if (cluster) {
      setExpandedCluster(cluster);
      setSelectedPageIndex(-1);
      setStartIndex(0);
    }
  };

  // Closes the expanded view
  const handleCloseExpanded = () => setExpandedCluster(null);

  // Opens pages in a new tab
  const handlePageClick = (page: ClusterPage) => {
    chrome.tabs.create({ url: page.url });
  };

  // Close the expanded view if user clicks outside it
  useEffect(() => {
    if (!expandedCluster) return;
    
    const handleClickOutside = (e: MouseEvent) => {
      if (
        expandedViewRef.current &&
        !expandedViewRef.current.contains(e.target as Node)
      ) {
        handleCloseExpanded();
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [expandedCluster]);

  // Scroll the expanded cluster pages (3 at a time)
  const handleScroll = (e: WheelEvent<HTMLUListElement>) => {
    if (!expandedCluster) return;
    
    // Always prevent default to avoid native scrolling interference
    e.preventDefault();
    
    const pages = expandedCluster.top_pages || [];
    const maxStartIndex = Math.max(0, pages.length - 3);
    
    if (e.deltaY > 0 && startIndex < maxStartIndex) {
      // Scroll down - increment with boundary check
      setStartIndex(s => Math.min(s + 1, maxStartIndex));
    } else if (e.deltaY < 0 && startIndex > 0) {
      // Scroll up - decrement with boundary check
      setStartIndex(s => Math.max(s - 1, 0));
    }
  };

  // Keyboard navigation for the expanded cluster
  useEffect(() => {
    if (!expandedCluster) return;
    const pages = expandedCluster.top_pages || [];
    const maxStartIndex = Math.max(0, pages.length - 3);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!expandedViewRef.current) return;
      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault();
          if (pages.length) {
            const newIndex =
              selectedPageIndex < pages.length - 1 ? selectedPageIndex + 1 : 0;
            setSelectedPageIndex(newIndex);
            // Keep selection visible by adjusting startIndex if needed
            if (newIndex >= startIndex + 3) {
              setStartIndex(Math.min(newIndex - 2, maxStartIndex));
            } else if (newIndex < startIndex) {
              setStartIndex(newIndex);
            }
          }
          break;
        }
        case 'ArrowUp': {
          e.preventDefault();
          if (pages.length) {
            const newIndex =
              selectedPageIndex > 0 ? selectedPageIndex - 1 : pages.length - 1;
            setSelectedPageIndex(newIndex);
            // Keep selection visible by adjusting startIndex if needed
            if (newIndex < startIndex) {
              setStartIndex(newIndex);
            } else if (newIndex >= startIndex + 3) {
              setStartIndex(Math.min(newIndex - 2, maxStartIndex));
            }
          }
          break;
        }
        case 'Enter':
          if (selectedPageIndex >= 0 && selectedPageIndex < pages.length) {
            handlePageClick(pages[selectedPageIndex]);
          }
          break;
        case 'Escape':
          handleCloseExpanded();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [expandedCluster, selectedPageIndex, startIndex]);

  // Render expanded cluster view via portal
  const renderExpandedView = () => {
    if (!expandedCluster) return null;
    const pages = expandedCluster.top_pages || [];
    
    // Calculate max index once per render, exactly as in search
    const maxStartIndex = Math.max(0, pages.length - 3);
    
    // Ensure startIndex never exceeds maxStartIndex
    const safeStartIndex = Math.min(startIndex, maxStartIndex);
    
    // Get exactly 3 visible items
    const visibleItems = pages.slice(safeStartIndex, safeStartIndex + 3);

    const content = (
      <div className="expanded-cluster-view" ref={expandedViewRef}>
        <div className="expanded-cluster-header">
          <h2>{expandedCluster.label}</h2>
        </div>
        <div className="expanded-cluster-content">
          {pages.length ? (
            <ul className="results-list" onWheel={handleScroll}>
              {visibleItems.map((p, idx) => {
                const actualIndex = safeStartIndex + idx;
                return (
                  <li
                    key={p.page_id}
                    className={`result-item ${
                      actualIndex === selectedPageIndex ? 'selected' : ''
                    }`}
                    onClick={() => handlePageClick(p)}
                  >
                    <div className="result-title">{p.title}</div>
                    <div className="result-url">{p.url}</div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="status-message">No pages found.</div>
          )}
        </div>
      </div>
    );
    return ReactDOM.createPortal(content, document.body);
  };

  // Don't render anything if there are no clusters
  if (displayClusters.length === 0) {
    return null;
  }

  return (
    <div className="cluster-container">
      <div className="cluster-grid">
        {displayClusters.map((cluster, i) => (
          <ClusterSquare
            key={`cluster-${cluster.cluster_id || i}`}
            cluster={cluster}
            loading={isLoading}
            onClick={handleClusterClick}
          />
        ))}
      </div>
      {renderExpandedView()}
    </div>
  );
};

export default ClusterContainer;