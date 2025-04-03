import React from 'react';
import './ClusterSquare.css';
import { ClusterSuggestion } from '../types';

interface ClusterSquareProps {
  cluster?: ClusterSuggestion;
  loading?: boolean;
  onClick: (cluster?: ClusterSuggestion) => void;
}

/**
 * Displays a cluster's label or a loading indicator when loading is true.
 */
const ClusterSquare: React.FC<ClusterSquareProps> = ({ cluster, loading = false, onClick }) => {
  // Only consider explicit loading prop
  const isLoading = loading;

  const handleClick = () => {
    if (!isLoading && cluster) {
      onClick(cluster);
    }
  };

  const handleKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (e) => {
    if (!isLoading && cluster && (e.key === 'Enter' || e.key === ' ')) {
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