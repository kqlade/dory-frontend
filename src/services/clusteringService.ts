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
  ClusteringResult,
  ClusterStatus,
  JobStatusResponse
} from '../types';
import { JobManager } from '../utils/jobManager';

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
   * - Sets up polling in the service worker.
   * - Returns immediately with previous clusters.
   * - UI will update when job completes via storage listeners.
   *
   * @param options Configuration options (e.g., count).
   * @returns A promise resolving to { current, previous } clusters.
   */
  async getClusterSuggestions(options: ClusterSuggestionOptions = {}): Promise<ClusteringResult> {
    const { count = 3 } = options;
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

      // Ensure the user is authenticated
      const authState = await authService.getAuthState();
      if (!authState.user?.id) {
        console.error('[ClusteringService] No authenticated user, cannot start clustering job');
        throw new Error('No authenticated user, cannot start clustering job');
      }

      // Update UI status to loading
      await this.updateClusterStatus('loading');

      // Start a clustering job with polling in the service worker context
      console.log('[ClusteringService] Starting clustering job with service worker polling');
      await this.jobManager.startJobWithPolling(
        // Function to start the job
        () => this.createClusteringJob(count),
        // Function to check job status
        (jobId) => this.checkClusteringJobStatus(jobId),
        // Callback when job completes
        (jobId, result) => this.handleJobCompletion(jobId, result, previous)
      );

      // Return immediately with current state
      // UI will update when the job completes via storage listeners
      return { current: [], previous };
    } catch (error) {
      console.error('[ClusteringService] Error starting clustering job:', error);
      
      // Update status to complete (even though it failed) to avoid stuck UI
      await this.updateClusterStatus('complete');
      
      // Return empty arrays - UI will show empty state
      return { current: [], previous };
    }
  }

  /**
   * Force a refresh by explicitly triggering a new clustering job.
   * This is effectively an alias of getClusterSuggestions with forceRefresh set.
   *
   * @param options Options including count
   * @returns A promise resolving to the refreshed clustering results.
   */
  async refreshClusters(options: ClusterSuggestionOptions = {}): Promise<ClusteringResult> {
    return this.getClusterSuggestions({ ...options, forceRefresh: true });
  }

  /**
   * Trigger the clustering process for the current user, starting a new job.
   * This is designed to be called by the service worker for scheduled refreshes.
   *
   * @returns A promise resolving to the job ID if successful
   * @throws Error if clustering could not be started
   */
  async triggerClustering(): Promise<string> {
    try {
      const authState = await authService.getAuthState();
      const userId = authState.user?.id;

      if (!userId) {
        console.warn('[ClusteringService] No authenticated user, cannot trigger clustering');
        throw new Error('No authenticated user, cannot start clustering job');
      }

      // Update UI status to loading
      await this.updateClusterStatus('loading');

      // Start a clustering job with polling in the service worker context
      console.log('[ClusteringService] Starting service worker triggered clustering job');
      const jobId = await this.jobManager.startJobWithPolling(
        // Function to start the job
        () => this.createClusteringJob(),
        // Function to check job status
        (id) => this.checkClusteringJobStatus(id),
        // Callback when job completes
        (jobId, result) => this.handleJobCompletion(jobId, result)
      );
      
      console.log('[ClusteringService] Started job with ID:', jobId);
      return jobId;
    } catch (error) {
      console.error('[ClusteringService] Error triggering clustering:', error);
      // Reset status on error
      await this.updateClusterStatus('complete');
      throw error;
    }
  }

  /**
   * Handle job completion by updating storage with results.
   */
  private async handleJobCompletion(
    jobId: string, 
    result: ClusterResponse,
    previousClusters: ClusterSuggestion[] = []
  ): Promise<void> {
    try {
      console.log(`[ClusteringService] Handling completion for job ${jobId}`);

      // Get the current cluster history if previousClusters is empty
      if (!previousClusters.length) {
        const storage = await chrome.storage.local.get(STORAGE_KEYS.CLUSTER_HISTORY_KEY);
        const history = storage[STORAGE_KEYS.CLUSTER_HISTORY_KEY] || { current: [], previous: [] };
        previousClusters = history.current || [];
      }

      // Extract new suggestions
      const current = result.suggestions || [];

      // Store the new data
      await this.updateClusterHistory(current, previousClusters);
      
      // Update UI status to complete
      await this.updateClusterStatus('complete');
      
      console.log(`[ClusteringService] Job ${jobId} results stored successfully`);
    } catch (error) {
      console.error(`[ClusteringService] Error handling job completion:`, error);
      await this.updateClusterStatus('complete'); // Ensure UI isn't stuck
    }
  }

  /**
   * Update the cluster history in storage
   * Only stores cluster data, not job state
   */
  private async updateClusterHistory(
    current: ClusterSuggestion[], 
    previous: ClusterSuggestion[]
  ): Promise<void> {
    const clusterData = { 
      current, 
      previous, 
      timestamp: Date.now()
    };
    await chrome.storage.local.set({ [STORAGE_KEYS.CLUSTER_HISTORY_KEY]: clusterData });
  }

  /**
   * Update the cluster UI status in storage
   * This is separate from the actual cluster data
   */
  private async updateClusterStatus(state: 'idle' | 'loading' | 'complete'): Promise<void> {
    const status: ClusterStatus = {
      state,
      timestamp: Date.now()
    };
    await chrome.storage.local.set({ [STORAGE_KEYS.CLUSTER_STATUS_KEY]: status });
  }

  /**
   * Creates a clustering job by calling the API.
   *
   * @param count Number of clusters to request from the API (default: 3).
   * @returns A promise resolving to the newly created job ID.
   */
  private async createClusteringJob(count = 3): Promise<string> {
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
      credentials: 'include',
    });
    if (!response.ok) {
      throw new Error(`Error starting clustering job: ${response.statusText}`);
    }

    const data: ClusteringJobResponse = await response.json();
    console.log('[ClusteringService] Started job with ID:', data.job_id);
    return data.job_id;
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

      const endpoint = `${CLUSTERING_ENDPOINTS.JOB_STATUS}?job_id=${jobId}`;
      console.log(`[ClusteringService] Checking status for job: ${jobId}`);

      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        headers: {
          Authorization: `Bearer ${authState.accessToken}`,
        },
        credentials: 'include',
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
   * Resume and manage any jobs that were active before the current session.
   */
  private async resumeActiveJobs(): Promise<void> {
    try {
      // First set the status to loading while we check for active jobs
      // If there are active jobs, this will remain loading until they complete
      await this.updateClusterStatus('loading');
      
      // Resume all active jobs through the job manager
      this.jobManager.resumeActiveJobs(
        // Function to check job status
        (jobId) => this.checkClusteringJobStatus(jobId),

        // Callback when a job completes
        async (jobId, result) => {
          // Use the common job completion handler
          await this.handleJobCompletion(jobId, result);
        }
      );
      
      // If no jobs were resumed, set status to complete
      if (this.jobManager.getActiveJobIds().length === 0) {
        await this.updateClusterStatus('complete');
      }
    } catch (err) {
      console.warn('[ClusteringService] Error resuming active jobs:', err);
      // Ensure we're not stuck in loading state
      await this.updateClusterStatus('complete');
    }
  }
}

// Create and export a singleton instance
export const clusteringService = new ClusteringService();
export default ClusteringService;