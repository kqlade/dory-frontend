/**
 * @file clusteringService.ts
 *
 * Service for interacting with the clustering API.
 * Provides methods to fetch cluster data and trigger clustering.
 */

import { API_BASE_URL, CLUSTERING_ENDPOINTS, STORAGE_KEYS } from '../config';
import { authService } from './authService';
import { ClusterSuggestion, ClusterResponse } from '../types';

/**
 * Service for retrieving and managing cluster suggestions.
 * Handles communication with the clustering API and local caching.
 */
class ClusteringService {
  /**
   * Get cluster suggestions with history tracking.
   * This method combines fetching and caching in one simple API.
   * 
   * @param options.forceRefresh Force a refresh from the server (default: false)
   * @param options.count Number of clusters to fetch (default: 3)
   * @returns Promise resolving to current and previous clusters
   */
  async getClusterSuggestions(options: {
    forceRefresh?: boolean;
    count?: number;
  } = {}): Promise<{
    current: ClusterSuggestion[];
    previous: ClusterSuggestion[];
  }> {
    try {
      const { forceRefresh = false, count = 3 } = options;
      
      // Check if we need to fetch fresh data
      let needsFresh = forceRefresh;
      let current: ClusterSuggestion[] = [];
      let previous: ClusterSuggestion[] = [];
      
      if (!needsFresh) {
        // Get from storage
        const storage = await chrome.storage.local.get(STORAGE_KEYS.CLUSTER_HISTORY_KEY);
        const history = storage[STORAGE_KEYS.CLUSTER_HISTORY_KEY];
        
        if (history && history.timestamp) {
          // Use cached data if it's less than 5 minutes old
          const isFresh = (Date.now() - history.timestamp) < 5 * 60 * 1000; // 5 minutes
          
          if (isFresh) {
            console.log('[ClusteringService] Using cached clusters');
            return {
              current: history.current || [],
              previous: history.previous || []
            };
          } else {
            // Data is stale but we'll preserve current as previous
            previous = history.current || [];
            needsFresh = true;
          }
        } else {
          // No cache exists
          needsFresh = true;
        }
      }
      
      if (needsFresh) {
        // Fetch fresh data from server
        console.log('[ClusteringService] Fetching fresh clusters');
        current = await this.fetchClusterSuggestions(count);
        
        // Store in storage
        await chrome.storage.local.set({
          [STORAGE_KEYS.CLUSTER_HISTORY_KEY]: {
            current,
            previous,
            timestamp: Date.now()
          }
        });
        
        console.log('[ClusteringService] Updated cluster history');
      }
      
      return { current, previous };
    } catch (error) {
      console.error('[ClusteringService] Error getting clusters:', error);
      return { current: [], previous: [] };
    }
  }

  /**
   * Fetch cluster suggestions for the current user.
   * 
   * @param count Number of clusters to fetch (default: 3)
   * @returns Promise resolving to an array of full ClusterSuggestion objects
   */
  async fetchClusterSuggestions(count: number = 3): Promise<ClusterSuggestion[]> {
    try {
      const authState = await authService.getAuthState();
      const userId = authState.user?.id;
      
      if (!userId) {
        console.warn('[ClusteringService] No authenticated user, cannot fetch clusters');
        return [];
      }

      const endpoint = `${CLUSTERING_ENDPOINTS.SUGGESTIONS}?user_id=${userId}&count=${count}`;
      console.log('[ClusteringService] Fetching clusters from:', endpoint);

      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        headers: {
          'Authorization': `Bearer ${authState.accessToken}`
        }
      });
      
      if (!response.ok) {
        throw new Error(`Error fetching clusters: ${response.statusText}`);
      }
      
      const data: ClusterResponse = await response.json();
      return data.suggestions;
    } catch (error) {
      console.error('[ClusteringService] Error fetching clusters:', error);
      return [];
    }
  }

  /**
   * Trigger the clustering process for the current user.
   * This is typically used to force a refresh of the clusters.
   */
  async triggerClustering(): Promise<boolean> {
    try {
      const authState = await authService.getAuthState();
      const userId = authState.user?.id;
      
      if (!userId) {
        console.warn('[ClusteringService] No authenticated user, cannot trigger clustering');
        return false;
      }

      const endpoint = `${CLUSTERING_ENDPOINTS.SUGGESTIONS}?user_id=${userId}&trigger=true`;
      console.log('[ClusteringService] Triggering clustering for user:', userId);

      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authState.accessToken}`
        }
      });
      
      if (!response.ok) {
        throw new Error(`Error triggering clustering: ${response.statusText}`);
      }
      
      console.log('[ClusteringService] Clustering triggered successfully');
      return true;
    } catch (error) {
      console.error('[ClusteringService] Error triggering clustering:', error);
      return false;
    }
  }
}

// Create and export a singleton instance
export const clusteringService = new ClusteringService();

// Default export for convenience
export default ClusteringService;