import React, { useState, useEffect, useRef, WheelEvent } from 'react';
import ReactDOM from 'react-dom';
import ClusterSquare from './ClusterSquare';
import { ClusterSuggestion, ClusterPage } from '../types';
import useBackgroundClustering from '../hooks/useBackgroundClustering';
import './ClusterContainer.css';

interface ClusterContainerProps {
  clusters?: ClusterSuggestion[];
}

/**
 * Displays a grid of cluster squares for available clusters.
 * Clicking a cluster shows an expanded view with pages.
 */
const ClusterContainer: React.FC<ClusterContainerProps> = ({
  clusters = [],
}) => {
  const [expandedCluster, setExpandedCluster] = useState<ClusterSuggestion | null>(null);
  const [startIndex, setStartIndex] = useState(0);
  const [selectedPageIndex, setSelectedPageIndex] = useState(-1);
  
  const expandedViewRef = useRef<HTMLDivElement>(null);

  // If no explicit clusters provided, use the hook data
  const { clusters: hookClusters, loading: isLoading } = useBackgroundClustering();
  
  // Use either provided clusters or hook data
  const effectiveClusters = clusters.length ? clusters : hookClusters;
  
  // Don't render anything if no clusters and not loading
  if (!effectiveClusters.length && !isLoading) {
    return null;
  }

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
    const pages = expandedCluster.top_pages || [];
    const maxIndex = Math.max(0, pages.length - 3);

    if (e.deltaY > 0 && startIndex < maxIndex) {
      e.preventDefault();
      setStartIndex(prev => Math.min(prev + 1, maxIndex));
    } else if (e.deltaY < 0 && startIndex > 0) {
      e.preventDefault();
      setStartIndex(prev => Math.max(prev - 1, 0));
    }
  };

  // Keyboard navigation for the expanded cluster
  useEffect(() => {
    if (!expandedCluster) return;
    const pages = expandedCluster.top_pages || [];
    const maxIndex = Math.max(0, pages.length - 3);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!expandedViewRef.current) return;
      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault();
          if (pages.length) {
            const newIndex =
              selectedPageIndex < pages.length - 1 ? selectedPageIndex + 1 : 0;
            setSelectedPageIndex(newIndex);
            if (newIndex >= startIndex + 3) {
              setStartIndex(Math.min(newIndex - 2, maxIndex));
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
            if (newIndex < startIndex) setStartIndex(newIndex);
            else if (newIndex >= startIndex + 3) setStartIndex(newIndex - 2);
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
    const visible = pages.slice(startIndex, startIndex + 3);

    const content = (
      <div className="expanded-cluster-view" ref={expandedViewRef}>
        <div className="expanded-cluster-header">
          <h2>{expandedCluster.label}</h2>
        </div>
        <div className="expanded-cluster-content">
          {pages.length ? (
            <ul className="results-list" onWheel={handleScroll}>
              {visible.map((p, idx) => {
                const actualIndex = startIndex + idx;
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

  // When loading, render loading placeholders
  if (isLoading) {
    // Show loading squares for the number of actual clusters,
    // or at least one if we don't know yet
    const placeholderCount = effectiveClusters.length || 1;
    
    return (
      <div className="cluster-container">
        <div className="cluster-grid">
          {Array.from({ length: placeholderCount }).map((_, index) => (
            <ClusterSquare
              key={`loading-${index}`}
              loading={true}
              onClick={() => {}}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="cluster-container">
      <div className="cluster-grid">
        {effectiveClusters.map((cluster, i) => (
          <ClusterSquare
            key={`cluster-${cluster.cluster_id || i}`}
            cluster={cluster}
            onClick={handleClusterClick}
          />
        ))}
      </div>
      {renderExpandedView()}
    </div>
  );
};

export default ClusterContainer;