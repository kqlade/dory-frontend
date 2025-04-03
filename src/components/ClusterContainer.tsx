import React, { useState, useEffect, useRef, WheelEvent } from 'react';
import ReactDOM from 'react-dom';
import ClusterSquare from './ClusterSquare';
import { ClusterSuggestion, ClusterPage } from '../types';
import useBackgroundClustering from '../hooks/useBackgroundClustering';
import './ClusterContainer.css';

interface ClusterContainerProps {
  clusters?: ClusterSuggestion[];
  clusterCount?: number;
}

/**
 * Displays a grid of cluster squares. Clicking a cluster shows an expanded view with pages.
 */
const ClusterContainer: React.FC<ClusterContainerProps> = ({
  clusters = [],
  clusterCount = 3,
}) => {
  const [expandedCluster, setExpandedCluster] = useState<ClusterSuggestion | null>(null);
  const [startIndex, setStartIndex] = useState(0);
  const [selectedPageIndex, setSelectedPageIndex] = useState(-1);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const expandedViewRef = useRef<HTMLDivElement>(null);

  const { clusters: hookClusters, loading: loadingClusters, refreshClusters } =
    useBackgroundClustering();

  // Decide which cluster data to use (explicit prop vs. hook)
  const effectiveClusters = clusters.length ? clusters : hookClusters;

  // Fetch clusters on mount (or when clusterCount changes)
  useEffect(() => {
    if (clusterCount) refreshClusters({ count: clusterCount });
  }, [clusterCount, refreshClusters]);

  // Manually refresh clusters
  const manuallyRefreshClusters = async () => {
    setIsRefreshing(true);
    await refreshClusters({ count: clusterCount });
    setTimeout(() => setIsRefreshing(false), 3000);
  };

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
    // Optionally close expanded view, depending on UX preference
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

  return (
    <div className="cluster-container">
      <div className="cluster-grid">
        {Array.from({ length: clusterCount }).map((_, i) => {
          // Only show actual cluster data if we have it and aren't refreshing
          const clusterData = !isRefreshing && effectiveClusters.length > i ? effectiveClusters[i] : undefined;
          return (
            <ClusterSquare
              key={`cluster-${i}`}
              cluster={clusterData}
              onClick={handleClusterClick}
            />
          );
        })}
      </div>
      {renderExpandedView()}
    </div>
  );
};

export default ClusterContainer;