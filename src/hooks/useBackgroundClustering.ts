/**
 * @file useBackgroundClustering.ts
 * 
 * Hook for accessing clustering functionality through the background API.
 * Provides methods to get cluster suggestions and trigger clustering.
 */

import { useState, useCallback } from 'react';
import { getBackgroundAPI } from '../utils/comlinkSetup';
import type { BackgroundAPI } from '../background/api';
import { ClusterSuggestion } from '../types';

interface ClusteringState {
  current: ClusterSuggestion[];
  previous: ClusterSuggestion[];
  loading: boolean;
  error: Error | null;
}

/**
 * Hook to access clustering functionality from the background service.
 * Manages state and provides clustering operations.
 */
const useBackgroundClustering = () => {
  // Keep track of loading and error states
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [clusters, setClusters] = useState<ClusterSuggestion[]>([]);
  const [previousClusters, setPreviousClusters] = useState<ClusterSuggestion[]>([]);

  /**
   * Get cluster suggestions from the background service
   */
  const getClusters = useCallback(async (options?: { forceRefresh?: boolean; count?: number }) => {
    try {
      setLoading(true);
      setError(null);
      
      // Get the API and unwrap the clusters property
      const api = getBackgroundAPI<BackgroundAPI>();
      const clusteringService = await api.clusters;
      
      // Get clusters from the service
      const result = await clusteringService.getClusterSuggestions(options);
      
      // Update state with the results
      setClusters(result.current);
      setPreviousClusters(result.previous);
      
      return result;
    } catch (error) {
      console.error('[useBackgroundClustering] Error fetching clusters:', error);
      setError(error instanceof Error ? error : new Error('Failed to fetch clusters'));
      return { current: [], previous: [] };
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Trigger cluster generation in the background
   */
  const triggerClustering = useCallback(async () => {
    try {
      const api = getBackgroundAPI<BackgroundAPI>();
      const clusteringService = await api.clusters;
      return await clusteringService.triggerClustering();
    } catch (error) {
      console.error('[useBackgroundClustering] Error triggering clustering:', error);
      throw error;
    }
  }, []);

  return {
    clusters,
    previousClusters,
    loading,
    error,
    getClusters,
    triggerClustering
  };
};

export default useBackgroundClustering;
