import React from 'react';
import './ClusterSquare.css';
import { ClusterSuggestion } from '../services/clusteringService';

interface ClusterSquareProps {
  cluster?: ClusterSuggestion;
  onClick: (cluster?: ClusterSuggestion) => void;
}

/**
 * Displays a cluster's label or a loading indicator if cluster data is undefined.
 */
const ClusterSquare: React.FC<ClusterSquareProps> = ({ cluster, onClick }) => {
  const isLoading = !cluster;

  const handleClick = () => {
    if (!isLoading) {
      onClick(cluster);
    }
  };

  const handleKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (e) => {
    if (!isLoading && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      handleClick();
    }
  };

  return (
    <div
      className={`cluster-square ${isLoading ? 'loading' : ''}`}
      onClick={isLoading ? undefined : handleClick}
      role="button"
      tabIndex={isLoading ? -1 : 0}
      aria-label={isLoading ? 'Loading cluster content' : `View pages in ${cluster?.label}`}
      onKeyDown={handleKeyDown}
    >
      {isLoading ? (
        <div className="dots-container" aria-hidden="true">
          <span className="dot"></span>
          <span className="dot"></span>
          <span className="dot"></span>
        </div>
      ) : (
        <div className="cluster-content">
          <h3 className="cluster-title">{cluster?.label}</h3>
          {/* If desired, show additional info like page_count or top_pages here */}
        </div>
      )}
    </div>
  );
};

export default ClusterSquare;