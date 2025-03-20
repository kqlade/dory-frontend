/**
 * @file clusteringService.ts
 *
 * Service for interacting with the clustering API.
 * Provides functions to fetch cluster data and trigger clustering.
 */

import { API_BASE_URL, ENDPOINTS } from '../config';
import { getCurrentUser } from './userService';

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
  triggerClustering
};