/**
 * @file useBackgroundClustering.ts
 * 
 * Hook for accessing clustering functionality through the background API.
 * Provides methods to get cluster suggestions and trigger clustering.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { getBackgroundAPI } from '../utils/comlinkSetup';
import type { BackgroundAPI, ClusteringServiceAPI } from '../types';
import type { ClusterSuggestion } from '../types';

interface ClusteringResult {
  current: ClusterSuggestion[];
  previous: ClusterSuggestion[];
}

interface UseClusteringResult {
  clusters: ClusterSuggestion[];
  previousClusters: ClusterSuggestion[];
  loading: boolean;
  error: Error | null;
  getClusters: (options?: { forceRefresh?: boolean; count?: number }) => Promise<ClusteringResult>;
  triggerClustering: () => Promise<void>;
}

const useBackgroundClustering = (): UseClusteringResult => {
  const [clusters, setClusters] = useState<ClusterSuggestion[]>([]);
  const [previousClusters, setPreviousClusters] = useState<ClusterSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const clusteringServiceRef = useRef<ClusteringServiceAPI | null>(null);
  const loadingRef = useRef(false);

  // Initialize the Comlink proxy once
  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const api = await getBackgroundAPI<BackgroundAPI>();
        // Store the Comlink proxy directly - don't await it
        if (mounted) {
          clusteringServiceRef.current = api.clusters;
        }
      } catch (err) {
        console.error('[useBackgroundClustering] Failed to initialize:', err);
        setError(err instanceof Error ? err : new Error('Initialization error'));
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const getClusters = useCallback(async (options?: { forceRefresh?: boolean; count?: number }) => {
    const service = clusteringServiceRef.current;
    if (!service) throw new Error('Clustering service not initialized');

    if (loadingRef.current) {
      console.warn('[useBackgroundClustering] Cluster fetch already in progress.');
      return { current: [], previous: [] };
    }

    try {
      loadingRef.current = true;
      setLoading(true);
      setError(null);

      const result = await service.getClusterSuggestions(options);
      setClusters(result.current);
      setPreviousClusters(result.previous);

      return result;
    } catch (err) {
      console.error('[useBackgroundClustering] Error fetching clusters:', err);
      const error = err instanceof Error ? err : new Error('Unknown error during clustering');
      setError(error);
      return { current: [], previous: [] };
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, []);

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

  return {
    clusters,
    previousClusters,
    loading,
    error,
    getClusters,
    triggerClustering,
  };
};

export default useBackgroundClustering;