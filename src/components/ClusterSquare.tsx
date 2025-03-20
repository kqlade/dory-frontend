import React from 'react';
import './ClusterSquare.css';

export interface ClusterData {
  id: string;
  label: string;
  page_count: number;
}

interface ClusterSquareProps {
  cluster?: ClusterData; // Optional, as we may display "Still learning..." message
  isLoading?: boolean;
  onClick: (cluster?: ClusterData) => void; // Callback when clicked, passing the cluster data
}

/**
 * ClusterSquare - A reusable component that displays either a cluster or a placeholder
 * when no cluster data is available yet.
 */
const ClusterSquare: React.FC<ClusterSquareProps> = ({ 
  cluster, 
  isLoading = false,
  onClick 
}) => {
  const handleClick = () => {
    // Only trigger the click handler if we have a cluster and are not loading
    if (!isLoading) {
      onClick(cluster);
    }
  };

  return (
    <div 
      className={`cluster-square ${isLoading ? 'loading' : ''}`}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      aria-label={cluster ? `View pages in ${cluster.label}` : 'No cluster available yet'}
      onKeyDown={(e) => {
        // For accessibility - also trigger on Enter or Space key
        if (e.key === 'Enter' || e.key === ' ') {
          handleClick();
          e.preventDefault();
        }
      }}
    >
      {isLoading ? (
        <div className="loading-indicator" aria-hidden="true">
          <span className="dot"></span>
          <span className="dot"></span>
          <span className="dot"></span>
        </div>
      ) : cluster ? (
        <div className="cluster-content">
          <h3 className="cluster-title">{cluster.label}</h3>
        </div>
      ) : (
        <div className="empty-state">
          <p>Still learning...</p>
        </div>
      )}
    </div>
  );
};

export default ClusterSquare; 