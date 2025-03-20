import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import ClusterSquare, { ClusterData } from './ClusterSquare';
import './ClusterContainer.css';

interface ClusterContainerProps {
  clusters: (ClusterData | undefined)[];
  isLoading?: boolean;
}

/**
 * Page result interface to match search results structure
 */
interface PageResult {
  id: string;
  title: string;
  url: string;
  pageId?: string;
  explanation?: string;
}

/**
 * ClusterContainer - Displays three equally spaced cluster squares.
 * When a cluster is clicked, it will show an expanded view with more details.
 */
const ClusterContainer: React.FC<ClusterContainerProps> = ({ 
  clusters = [], 
  isLoading = false 
}) => {
  // State to track which cluster is expanded (null means none are expanded)
  const [expandedCluster, setExpandedCluster] = useState<ClusterData | null>(null);
  // Reference to the expanded view
  const expandedViewRef = useRef<HTMLDivElement>(null);
  // State for selected page (for keyboard navigation if implemented later)
  const [selectedPageIndex, setSelectedPageIndex] = useState(-1);
  
  // Mock pages - in a real implementation this would come from an API
  const getClusterPages = (clusterId: string): PageResult[] => {
    // This would be replaced with actual data fetching
    // For now, return mock data based on the cluster ID
    return [
      {
        id: `page-${clusterId}-1`,
        title: "Example Page 1",
        url: "https://example.com/page1",
        explanation: "This is the first example page in this cluster"
      },
      {
        id: `page-${clusterId}-2`,
        title: "Example Page 2",
        url: "https://example.com/page2"
      },
      {
        id: `page-${clusterId}-3`,
        title: "Example Page 3",
        url: "https://example.com/page3",
        explanation: "This is the third example page with an explanation"
      }
    ];
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
    // In a real implementation, you might want to track this click
    // Similar to trackSearchClick in the NewTabSearchBar
    
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
    
    const pages = getClusterPages(expandedCluster.id);
    
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

  // Ensure we always have exactly 3 squares (fill with undefined if needed)
  const displayClusters = [...clusters];
  while (displayClusters.length < 3) {
    displayClusters.push(undefined);
  }

  // Render the expanded view using a portal to render it at the root level
  const renderExpandedView = () => {
    if (!expandedCluster) return null;
    
    // Get pages for this cluster
    const pages = getClusterPages(expandedCluster.id);
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
              {pages.map((page, idx) => (
                <li
                  key={page.id}
                  className={`result-item ${idx === selectedPageIndex ? 'selected' : ''}`}
                  onClick={() => handlePageClick(page)}
                >
                  <div className="result-title">{page.title}</div>
                  <div className="result-url">{page.url}</div>
                  {page.explanation && (
                    <div className="result-explanation">
                      <span className="explanation-label">Context: </span>
                      {page.explanation}
                    </div>
                  )}
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
      {/* Grid for the three squares */}
      <div className="cluster-grid">
        {displayClusters.slice(0, 3).map((cluster, index) => (
          <ClusterSquare
            key={cluster?.id || `empty-${index}`}
            cluster={cluster}
            isLoading={isLoading}
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