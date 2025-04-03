/**
 * @file clusteringService.ts
 *
 * Service for interacting with the clustering API.
 * Provides methods to fetch cluster data and trigger clustering using the asynchronous job pattern.
 */

import { API_BASE_URL, CLUSTERING_ENDPOINTS, STORAGE_KEYS } from '../config';
import { authService } from './authService';
import {
  ClusterSuggestion,
  ClusterResponse,
  ClusteringJobResponse,
  ClusteringJobStatus,
  ClusterSuggestionOptions,
  ClusteringResult
} from '../types';
import { JobManager, JobStatusResponse } from '../utils/jobManager';

/**
 * Service for retrieving and managing cluster suggestions.
 * Handles communication with the clustering API, job management, and local caching.
 */
class ClusteringService {
  private jobManager: JobManager<ClusterResponse>;

  constructor() {
    this.jobManager = new JobManager<ClusterResponse>();
    // Resume any active jobs from a previous session
    this.resumeActiveJobs();
  }

  /**
   * Fetch cluster suggestions using the asynchronous job pattern.
   * - Starts a clustering job.
   * - Polls for completion.
   * - Returns new clusters along with previously stored clusters.
   *
   * @param options Configuration options (e.g., count, onProgress).
   * @returns A promise resolving to { current, previous } clusters.
   */
  async getClusterSuggestions(options: ClusterSuggestionOptions = {}): Promise<ClusteringResult> {
    const { count = 3, onProgress } = options;
    let previous: ClusterSuggestion[] = [];

    try {
      // Try to retrieve previously stored clusters
      try {
        const storage = await chrome.storage.local.get(STORAGE_KEYS.CLUSTER_HISTORY_KEY);
        const history = storage[STORAGE_KEYS.CLUSTER_HISTORY_KEY];
        if (history?.current?.length) {
          previous = history.current;
        }
      } catch (err) {
        console.warn('[ClusteringService] Could not retrieve previous clusters:', err);
      }

      // Initial progress
      onProgress?.(0.1);

      // Ensure the user is authenticated
      const authState = await authService.getAuthState();
      if (!authState.user?.id) {
        console.error('[ClusteringService] No authenticated user, cannot start clustering job');
        throw new Error('No authenticated user, cannot start clustering job');
      }

      // Start a clustering job
      console.log('[ClusteringService] Starting fresh clustering job');
      const jobId = await this.startClusteringJob(count);

      // Update progress to reflect that the job has started
      onProgress?.(0.2);

      // Wait for job completion with incremental progress reporting
      const result = await this.jobManager.waitForCompletion(
        jobId,
        (id) => this.checkClusteringJobStatus(id),
        {
          onProgress: (p: number) => {
            // Scale progress from 0.2 -> 0.9
            onProgress?.(0.2 + p * 0.7);
          },
        }
      );

      // Final progress update
      onProgress?.(1.0);

      // Extract new suggestions
      const current = result.suggestions || [];

      // Store the new data along with the old
      const clusterData = { current, previous, timestamp: Date.now() };
      await chrome.storage.local.set({ [STORAGE_KEYS.CLUSTER_HISTORY_KEY]: clusterData });
      console.log('[ClusteringService] Stored new clustering results');
      return { current, previous };
    } catch (error) {
      console.error('[ClusteringService] Error getting clusters:', error);
      // Return empty arrays - UI will show loading state
      return { current: [], previous: [] };
    }
  }

  /**
   * Starts a new clustering job.
   *
   * @param count Number of clusters to request from the API (default: 3).
   * @returns A promise resolving to the newly created job ID.
   */
  private async startClusteringJob(count = 3): Promise<string> {
    return this.jobManager.startJob(async () => {
      const authState = await authService.getAuthState();
      const userId = authState.user?.id;

      if (!userId) {
        console.error('[ClusteringService] No authenticated user ID found');
        throw new Error('No authenticated user, cannot start clustering job');
      }

      const endpoint = `${CLUSTERING_ENDPOINTS.SUGGESTIONS}?user_id=${userId}&count=${count}`;
      console.log('[ClusteringService] Starting clustering job for user:', userId);

      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${authState.accessToken}`,
        },
      });
      if (!response.ok) {
        throw new Error(`Error starting clustering job: ${response.statusText}`);
      }

      const data: ClusteringJobResponse = await response.json();
      console.log('[ClusteringService] Started job with ID:', data.job_id);
      return data.job_id;
    });
  }

  /**
   * Checks the status of a given clustering job.
   *
   * @param jobId The ID of the job to check.
   * @returns A promise resolving to the job's status and (optionally) its result.
   */
  private async checkClusteringJobStatus(jobId: string): Promise<JobStatusResponse<ClusterResponse>> {
    try {
      const authState = await authService.getAuthState();
      if (!authState.accessToken) {
        console.error('[ClusteringService] No access token for job status check');
        throw new Error('Authentication required');
      }

      const endpoint = `${CLUSTERING_ENDPOINTS.JOB_STATUS}/${jobId}`;
      console.log(`[ClusteringService] Checking status for job: ${jobId}`);

      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        headers: {
          Authorization: `Bearer ${authState.accessToken}`,
        },
      });
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[ClusteringService] Server responded with ${response.status}: ${errorText}`);
        throw new Error(`Failed to check job status: ${response.statusText}`);
      }

      const jobStatus: ClusteringJobStatus = await response.json();
      if (jobStatus.status === 'COMPLETED') {
        console.log(`[ClusteringService] Job ${jobId} completed successfully`);
        return {
          status: jobStatus.status,
          result: jobStatus.result || { suggestions: [] },
        };
      } else if (jobStatus.status === 'FAILED') {
        console.error(`[ClusteringService] Job ${jobId} failed: ${jobStatus.error || 'Unknown error'}`);
        return {
          status: jobStatus.status,
          error: jobStatus.error || 'Unknown error',
        };
      } else {
        // Job is still pending or running
        console.log(`[ClusteringService] Job ${jobId} status: ${jobStatus.status}`);
        return { status: jobStatus.status };
      }
    } catch (error) {
      console.error(`[ClusteringService] Error checking job status for ${jobId}:`, error);
      throw error;
    }
  }

  /**
   * Force a refresh by explicitly triggering a new clustering job.
   * This is effectively an alias of getClusterSuggestions with forceRefresh set.
   *
   * @param options Options including count and progress callback
   * @returns A promise resolving to the refreshed clustering results.
   */
  async refreshClusters(options: ClusterSuggestionOptions = {}): Promise<ClusteringResult> {
    return this.getClusterSuggestions({ ...options, forceRefresh: true });
  }

  /**
   * Resume and manage any jobs that were active before the current session.
   */
  private resumeActiveJobs(): void {
    this.jobManager.resumeActiveJobs(
      // Function to check job status
      (jobId) => this.checkClusteringJobStatus(jobId),

      // Callback when a job completes
      async (jobId, result) => {
        let previous: ClusterSuggestion[] = [];
        
        // Try to get previous clusters from storage
        try {
          const storage = await chrome.storage.local.get(STORAGE_KEYS.CLUSTER_HISTORY_KEY);
          const history = storage[STORAGE_KEYS.CLUSTER_HISTORY_KEY];
          if (history?.current?.length) {
            previous = history.current;
          }
        } catch (err) {
          console.warn('[ClusteringService] Could not retrieve previous clusters:', err);
        }

        // Store the new results for cross-tab synchronization (even if empty)
        const clusterData = {
          current: result.suggestions || [],
          previous,
          timestamp: Date.now(),
        };
        await chrome.storage.local.set({ [STORAGE_KEYS.CLUSTER_HISTORY_KEY]: clusterData });
        console.log(`[ClusteringService] Resumed job ${jobId} completed; results stored.`);
      }
    );
  }

  /**
   * (DEPRECATED) Fetch clusters via a synchronous endpoint.
   * Only recommended for small datasets or testing. Use getClusterSuggestions (job-based API) in production.
   *
   * @param count Number of clusters to fetch (default: 3).
   * @returns A promise resolving to an array of cluster suggestions.
   */
  async fetchClusterSuggestions(count = 3): Promise<ClusterSuggestion[]> {
    try {
      const authState = await authService.getAuthState();
      const userId = authState.user?.id;

      if (!userId) {
        console.warn('[ClusteringService] No authenticated user, cannot fetch clusters');
        return [];
      }

      const endpoint = `${CLUSTERING_ENDPOINTS.SUGGESTIONS_SYNC}?user_id=${userId}&count=${count}`;
      console.warn('[ClusteringService] Using synchronous endpoint (not recommended for production):', endpoint);

      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        headers: { Authorization: `Bearer ${authState.accessToken}` },
      });
      if (!response.ok) {
        throw new Error(`Error fetching clusters: ${response.statusText}`);
      }

      const data: ClusterResponse = await response.json();
      return data.suggestions;
    } catch (error) {
      console.error('[ClusteringService] Error fetching clusters synchronously:', error);
      return [];
    }
  }

  /**
   * Trigger the clustering process for the current user (using refresh endpoint).
   *
   * @returns A promise resolving to true if successful, false otherwise.
   */
  async triggerClustering(): Promise<boolean> {
    try {
      const authState = await authService.getAuthState();
      const userId = authState.user?.id;

      if (!userId) {
        console.warn('[ClusteringService] No authenticated user, cannot trigger clustering');
        return false;
      }

      const endpoint = `${CLUSTERING_ENDPOINTS.REFRESH}?user_id=${userId}`;
      console.log('[ClusteringService] Triggering clustering refresh for user:', userId);

      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authState.accessToken}`,
        },
      });
      if (!response.ok) {
        throw new Error(`Error triggering clustering: ${response.statusText}`);
      }

      console.log('[ClusteringService] Clustering refresh triggered successfully');
      return true;
    } catch (error) {
      console.error('[ClusteringService] Error triggering clustering refresh:', error);
      return false;
    }
  }
}

// Create and export a singleton instance
export const clusteringService = new ClusteringService();
export default ClusteringService;