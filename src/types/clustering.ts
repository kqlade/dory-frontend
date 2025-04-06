/**
 * @file clustering.ts
 * 
 * Type definitions for clustering functionality including cluster data structures
 * and job management interfaces for the asynchronous job pattern.
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

/**
 * Interface for the clustering job response when starting a new job
 */
export interface ClusteringJobResponse {
  job_id: string;
}

/**
 * Interface for the job status response
 */
export interface ClusteringJobStatus {
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  progress?: number;
  created_at?: string;
  updated_at?: string;
  result?: ClusterResponse;
  error?: string;
}

/**
 * Interface for storing cluster history with timestamps
 * No longer includes job tracking - only data
 */
export interface ClusterHistory {
  current: ClusterSuggestion[];
  previous: ClusterSuggestion[];
  timestamp: number;
}

/**
 * Separate interface for cluster UI status
 * This is separate from the actual cluster data
 */
export interface ClusterStatus {
  state: 'idle' | 'loading' | 'complete';
  timestamp: number;
}

/**
 * Options for cluster suggestion fetching
 */
export interface ClusterSuggestionOptions {
  forceRefresh?: boolean;
  count?: number;
  onProgress?: (progress: number) => void;
}

/**
 * Result returned from clustering operations
 */
export interface ClusteringResult {
  current: ClusterSuggestion[];
  previous: ClusterSuggestion[];
}
