/**
 * @file clusteringService.ts
 *
 * Service for interacting with the clustering API.
 * Provides functions to fetch cluster data and trigger clustering.
 */

import { API_BASE_URL, ENDPOINTS } from '../config';
import { getCurrentUser } from './userService';
import { MessageType, createMessage } from '../utils/messageSystem';

// Storage key for the cluster history
const CLUSTER_HISTORY_KEY = 'clusterHistory';

/**
 * Interface for a page within a cluster
 */
export interface ClusterPage {
  page_id: string;
  title: string;
  url: string;
}

/**
 * Interface for a single cluster suggestion from the API
 */
export interface ClusterSuggestion {
  cluster_id: string;
  label: string;
  page_count: number;
  top_pages: ClusterPage[];  // we keep this
}

/**
 * Interface for the cluster response from the API
 */
interface ClusterResponse {
  suggestions: ClusterSuggestion[];
}

/**
 * Get cluster suggestions with history tracking.
 * This function combines fetching and caching in one simple API.
 * 
 * @param options.forceRefresh Force a refresh from the server (default: false)
 * @param options.count Number of clusters to fetch (default: 3)
 * @returns Promise resolving to current and previous clusters
 */
export async function getClusterSuggestions(options: {
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
      const storage = await chrome.storage.local.get(CLUSTER_HISTORY_KEY);
      const history = storage[CLUSTER_HISTORY_KEY];
      
      if (history && history.timestamp) {
        // Use cached data if it's less than 10 minutes old
        const isFresh = (Date.now() - history.timestamp) < 10 * 60 * 1000; // 10 minutes
        
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
      current = await fetchClusterSuggestions(count);
      
      // Store in storage
      await chrome.storage.local.set({
        [CLUSTER_HISTORY_KEY]: {
          current,
          previous,
          timestamp: Date.now()
        }
      });
      
      // Broadcast that clusters have been updated
      chrome.runtime.sendMessage(
        createMessage(MessageType.CLUSTERS_UPDATED, {}, 'background')
      );
      
      console.log('[ClusteringService] Updated cluster history and notified listeners');
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
export async function fetchClusterSuggestions(count: number = 3): Promise<ClusterSuggestion[]> {
  try {
    const user = await getCurrentUser();
    if (!user?.id) {
      console.warn('[ClusteringService] No authenticated user, cannot fetch clusters');
      return [];
    }

    const endpoint = `${ENDPOINTS.CLUSTERING.CLUSTERS}?user_id=${user.id}&count=${count}`;
    console.log('[ClusteringService] Fetching clusters from:', endpoint);

    const response = await fetch(`${API_BASE_URL}${endpoint}`);
    if (!response.ok) {
      throw new Error(`Error fetching clusters: ${response.statusText}`);
    }
    
    const data: ClusterResponse = await response.json();
    // We now return the suggestions array in full, 
    // each item already has top_pages, cluster_id, label, page_count, etc.
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
export async function triggerClustering(): Promise<boolean> {
  try {
    const user = await getCurrentUser();
    if (!user?.id) {
      console.warn('[ClusteringService] No authenticated user, cannot trigger clustering');
      return false;
    }

    const endpoint = `${ENDPOINTS.CLUSTERING.TRIGGER}?user_id=${user.id}`;
    console.log('[ClusteringService] Triggering clustering for user:', user.id);

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
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

export default {
  fetchClusterSuggestions,
  triggerClustering,
  getClusterSuggestions
};