import React from 'react';
import './ClusterSquare.css';

export interface ClusterData {
  cluster_id: string;
  label: string;
  page_count: number;
}

interface ClusterSquareProps {
  cluster?: ClusterData; // Optional, as we may not have data for this position
  isLoading: boolean;
  onClick: (cluster?: ClusterData) => void; // Callback when clicked, passing the cluster data
}

/**
 * ClusterSquare - A reusable component that displays either a cluster or a loading indicator
 * when no cluster data is available yet.
 */
const ClusterSquare: React.FC<ClusterSquareProps> = ({ 
  cluster, 
  isLoading,
  onClick 
}) => {
  const handleClick = () => {
    // Only trigger the click handler if we have a cluster and are not loading
    if (!isLoading && cluster) {
      onClick(cluster);
    }
  };

  return (
    <div 
      className={`cluster-square ${isLoading ? 'loading' : ''}`}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      aria-label={cluster ? `View pages in ${cluster.label}` : 'Loading cluster content'}
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
      ) : (
        <div className="cluster-content">
          <h3 className="cluster-title">{cluster?.label}</h3>
        </div>
      )}
    </div>
  );
};

export default ClusterSquare; 