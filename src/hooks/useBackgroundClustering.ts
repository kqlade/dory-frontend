/**
 * @file useBackgroundClustering.ts
 * 
 * Hook for accessing clustering functionality through the background API.
 * Automatically refreshes clusters at configurable intervals and keeps all tabs in sync.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { getBackgroundAPI } from '../utils/comlinkSetup';
import { STORAGE_KEYS, CLUSTERING_CONFIG } from '../config';
import { useAuth } from './useBackgroundAuth';
import type { BackgroundAPI, ClusteringServiceAPI } from '../types';
import type { 
  ClusterSuggestion, 
  ClusteringResult, 
  ClusterSuggestionOptions, 
  ClusterHistory 
} from '../types';

// Status types for job processing state
type ClusteringStatus = 'idle' | 'loading' | 'complete' | 'error';

interface UseClusteringResult {
  clusters: ClusterSuggestion[];
  previousClusters: ClusterSuggestion[];
  status: ClusteringStatus;
  progress: number;
  loading: boolean;
  error: Error | null;
  lastUpdated: Date | null;
  refreshClusters: (options?: ClusterSuggestionOptions) => Promise<ClusteringResult>;
  triggerClustering: () => Promise<void>;
}

/**
 * Hook for interacting with the clustering functionality in the background API.
 * Automatically fetches fresh clusters:
 * 1. On initial mount (once authenticated)
 * 2. Every X minutes (configurable in CLUSTERING_CONFIG.REFRESH_INTERVAL_MINUTES)
 * 3. When explicitly requested via refreshClusters()
 * 4. Synchronizes with other tabs/windows through chrome.storage.
 */
const useBackgroundClustering = (): UseClusteringResult => {
  // -- Authentication state
  const { isAuthenticated, loading: authLoading } = useAuth();
  
  // -- Data state
  const [clusters, setClusters] = useState<ClusterSuggestion[]>([]);
  const [previousClusters, setPreviousClusters] = useState<ClusterSuggestion[]>([]);

  // -- Process state
  const [status, setStatus] = useState<ClusteringStatus>('loading'); 
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<Error | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // -- Service & interval references
  const clusteringServiceRef = useRef<ClusteringServiceAPI | null>(null);
  const loadingRef = useRef<boolean>(false);
  const refreshIntervalRef = useRef<number | null>(null);

  /**
   * Fetch fresh clusters directly from the API.
   * Always starts a new job, ignoring any cached data.
   */
  const refreshClusters = useCallback(
    async (options?: ClusterSuggestionOptions) => {
      if (!isAuthenticated) {
        console.log('[useBackgroundClustering] Not authenticated, skipping fetch.');
        return { current: [], previous: [] };
      }

      const service = clusteringServiceRef.current;
      if (!service) {
        console.warn('[useBackgroundClustering] Clustering service not initialized yet.');
        return { current: [], previous: [] };
      }

      if (loadingRef.current) {
        console.warn('[useBackgroundClustering] Cluster fetch already in progress.');
        return { current: clusters, previous: previousClusters };
      }

      try {
        loadingRef.current = true;
        setStatus('loading');
        setProgress(0);
        setError(null);

        // Call the service with progress tracking
        const result = await service.getClusterSuggestions({
          ...options,
          onProgress: (p: number) => setProgress(p),
        });

        // Update state with whatever result we got (even if empty)
        setClusters(result.current);
        setPreviousClusters(result.previous);

        // Only mark as complete if we have actual clusters
        if (result.current && result.current.length > 0) {
          setStatus('complete');
        } else {
          console.log('[useBackgroundClustering] No clusters returned, keeping loading state');
          setStatus('loading');
        }

        setProgress(1.0);
        setLastUpdated(new Date());
        return result;
      } catch (err) {
        console.error('[useBackgroundClustering] Error fetching clusters:', err);
        const fetchedError = err instanceof Error ? err : new Error('Unknown clustering error');
        setError(fetchedError);
        // Keep loading state even on error
        setStatus('loading');
        return { current: clusters, previous: previousClusters };
      } finally {
        loadingRef.current = false;
      }
    },
    [isAuthenticated, clusters, previousClusters]
  );

  /**
   * Trigger the clustering process in the background without waiting for completion.
   */
  const triggerClustering = useCallback(async () => {
    const service = clusteringServiceRef.current;
    if (!service) throw new Error('Clustering service not initialized');

    try {
      await service.triggerClustering();
    } catch (err) {
      console.error('[useBackgroundClustering] Error triggering clustering:', err);
      throw err;
    }
  }, []);

  /**
   * Initialize the proxy and set up auto-refresh on mount (when authenticated).
   */
  useEffect(() => {
    let isMounted = true;

    if (authLoading || !isAuthenticated) {
      console.log('[useBackgroundClustering] Waiting for authentication...');
      return;
    }

    const setup = async () => {
      try {
        // Get the background API via Comlink
        const api = await getBackgroundAPI<BackgroundAPI>();
        if (!isMounted) return;

        // Assign the clustering service
        clusteringServiceRef.current = api.clusters;
        console.log('[useBackgroundClustering] Background API initialized, fetching clusters...');

        // Fetch immediately once authenticated
        await refreshClusters();

        // Set up regular refresh interval
        const intervalMs = CLUSTERING_CONFIG.REFRESH_INTERVAL_MINUTES * 60 * 1000;
        refreshIntervalRef.current = window.setInterval(() => {
          if (isMounted) {
            console.log('[useBackgroundClustering] Auto-refreshing clusters...');
            refreshClusters();
          }
        }, intervalMs);
      } catch (err) {
        console.error('[useBackgroundClustering] Initialization error:', err);
        setError(err instanceof Error ? err : new Error('Initialization error'));
        setStatus('loading'); // Keep UI in loading state
      }
    };

    setup();

    // Cleanup on unmount
    return () => {
      isMounted = false;
      if (refreshIntervalRef.current) {
        window.clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = null;
      }
    };
  }, [isAuthenticated, authLoading, refreshClusters]);

  /**
   * Listen for storage changes to synchronize cluster data across tabs.
   */
  useEffect(() => {
    const handleStorageChange = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string
    ) => {
      if (areaName !== 'local') return;

      // Check if cluster history was updated
      if (changes[STORAGE_KEYS.CLUSTER_HISTORY_KEY]) {
        const newValue = changes[STORAGE_KEYS.CLUSTER_HISTORY_KEY].newValue as ClusterHistory;
        if (newValue && !loadingRef.current) { // Don't update if we're already loading
          console.log('[useBackgroundClustering] Detected cluster update in another tab');

          // Always update with whatever clusters we received
          setClusters(newValue.current || []);
          setPreviousClusters(newValue.previous || []);
          setProgress(1.0);
          setLastUpdated(new Date(newValue.timestamp));

          // Only set complete status if we have actual clusters
          setStatus(newValue.current?.length > 0 ? 'complete' : 'loading');
        }
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => chrome.storage.onChanged.removeListener(handleStorageChange);
  }, []);

  return {
    clusters,
    previousClusters,
    status,
    progress,
    loading: status === 'loading',
    error,
    lastUpdated,
    refreshClusters,
    triggerClustering,
  };
};

export default useBackgroundClustering;