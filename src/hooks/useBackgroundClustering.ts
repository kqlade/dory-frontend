/**
 * @file useBackgroundClustering.ts
 * 
 * Hook for accessing clustering functionality through the background API.
 * Automatically refreshes clusters at configurable intervals and keeps all tabs in sync.
 */

import { useState, useRef, useEffect } from 'react';
import { STORAGE_KEYS } from '../config';
import { useAuth } from './useBackgroundAuth';
import type { 
  ClusterSuggestion,
  ClusterHistory,
  ClusterStatus
} from '../types/clustering';

type UseClusteringResult = {
  clusters: ClusterSuggestion[];
  previousClusters: ClusterSuggestion[];
  loading: boolean;
  error: Error | null;
  status: 'idle' | 'loading' | 'complete';
  lastUpdated: Date | null;
};

/**
 * Hook for interacting with the clustering functionality managed by the service worker.
 * This hook's responsibilities:
 * 1. Provide UI components with cluster data from storage
 * 2. Listen for storage changes (when service worker updates clustering data)
 * 3. Expose a simple API for UI components to see clustering status
 */
const useBackgroundClustering = (): UseClusteringResult => {
  // -- Authentication state
  const { isAuthenticated } = useAuth();

  // -- Cluster data
  const [clusters, setClusters] = useState<ClusterSuggestion[]>([]);
  const [previousClusters, setPreviousClusters] = useState<ClusterSuggestion[]>([]);

  // -- Status information
  const [status, setStatus] = useState<'idle' | 'loading' | 'complete'>('loading');
  const [error, setError] = useState<Error | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // -- Service reference (in case we need it for future functionality)
  const apiInitializedRef = useRef<boolean>(false);

  /**
   * Initialize and read initial state from storage - once when authenticated
   */
  useEffect(() => {
    if (!isAuthenticated || apiInitializedRef.current) return;
    
    const initialize = async () => {
      try {
        // Mark as initialized to prevent duplicate calls
        apiInitializedRef.current = true;
        
        // Read initial cluster data from storage
        const storageData = await chrome.storage.local.get([
          STORAGE_KEYS.CLUSTER_HISTORY_KEY,
          STORAGE_KEYS.CLUSTER_STATUS_KEY
        ]);
        
        const history = storageData[STORAGE_KEYS.CLUSTER_HISTORY_KEY] as ClusterHistory;
        const statusData = storageData[STORAGE_KEYS.CLUSTER_STATUS_KEY] as ClusterStatus;

        // Set clusters if we have them
        if (history) {
          setClusters(history.current || []);
          setPreviousClusters(history.previous || []);
          setLastUpdated(history.timestamp ? new Date(history.timestamp) : null);
        }
        
        // Set status if we have it
        if (statusData) {
          setStatus(statusData.state || 'idle');
        } else {
          // Default to 'complete' if no status (better for UI)
          setStatus('complete');
        }
      } catch (err) {
        console.error('[useBackgroundClustering] Initialization error:', err);
        setError(err instanceof Error ? err : new Error('Initialization error'));
        setStatus('complete'); // Default to complete on error
      }
    };

    initialize();
  }, [isAuthenticated]);

  /**
   * Listen for storage changes from the service worker
   */
  useEffect(() => {
    const handleStorageChange = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string
    ) => {
      if (areaName !== 'local') return;

      // Handle cluster data updates
      const clusterChange = changes[STORAGE_KEYS.CLUSTER_HISTORY_KEY];
      if (clusterChange?.newValue) {
        const history = clusterChange.newValue as ClusterHistory;
        setClusters(history.current || []);
        setPreviousClusters(history.previous || []);
        setLastUpdated(history.timestamp ? new Date(history.timestamp) : null);
      }
      
      // Handle status updates (separate from data)
      const statusChange = changes[STORAGE_KEYS.CLUSTER_STATUS_KEY];
      if (statusChange?.newValue) {
        const statusData = statusChange.newValue as ClusterStatus;
        setStatus(statusData.state || 'idle');
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => chrome.storage.onChanged.removeListener(handleStorageChange);
  }, []);

  return {
    clusters,
    previousClusters,
    loading: status === 'loading',
    error, 
    status,
    lastUpdated
  };
};

export default useBackgroundClustering;