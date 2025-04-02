/**
 * @file clustering.ts
 * 
 * Type definitions for clustering functionality
 */

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
  top_pages: ClusterPage[];
}

/**
 * Interface for the cluster response from the API
 */
export interface ClusterResponse {
  suggestions: ClusterSuggestion[];
}
