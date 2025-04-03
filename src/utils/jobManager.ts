/**
 * @file jobManager.ts
 * 
 * Generic utility for managing asynchronous jobs with polling.
 * Provides a consistent pattern for starting jobs, polling for status,
 * and retrieving results when complete.
 */

import { JOB_CONFIG } from '../config';

export type JobStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';

export interface JobState<T> {
  jobId: string;
  status: JobStatus;
  result?: T;
  error?: string;
  startTime: number;
  lastPolled: number;
  attempts: number;
}

export interface JobOptions {
  pollingIntervalMs?: number;
  maxAttempts?: number;
  onProgress?: (progress: number) => void;
}

export interface JobStatusResponse<T> {
  status: JobStatus;
  result?: T;
  error?: string;
}

/**
 * Generic job manager for handling asynchronous job processing with polling.
 */
export class JobManager<T> {
  private readonly pollingIntervalMs: number;
  private readonly maxAttempts: number;
  private activeJobs: Map<string, JobState<T>> = new Map();

  constructor(options: JobOptions = {}) {
    this.pollingIntervalMs = options.pollingIntervalMs || JOB_CONFIG.POLLING_INTERVAL_MS;
    this.maxAttempts = options.maxAttempts || JOB_CONFIG.MAX_POLLING_ATTEMPTS;
    this.loadActiveJobs();
  }

  /**
   * Start a job and return its job ID.
   * 
   * @param startJob Function that starts a job and returns a job ID
   * @returns Promise resolving to the job ID
   */
  async startJob(startJob: () => Promise<string>): Promise<string> {
    try {
      const jobId = await startJob();
      
      this.activeJobs.set(jobId, {
        jobId,
        status: 'PENDING',
        startTime: Date.now(),
        lastPolled: Date.now(),
        attempts: 0
      });
      
      this.saveActiveJobs();
      return jobId;
    } catch (error) {
      console.error('[JobManager] Error starting job:', error);
      throw error;
    }
  }

  /**
   * Check the status of a job once.
   * 
   * @param jobId Job ID to check
   * @param checkFn Function that checks a job's status
   * @returns Promise resolving to the job status response
   */
  async pollJobStatus(
    jobId: string, 
    checkFn: (id: string) => Promise<JobStatusResponse<T>>
  ): Promise<JobStatusResponse<T>> {
    try {
      const jobState = this.activeJobs.get(jobId);
      
      if (!jobState) {
        throw new Error(`Job ${jobId} not found`);
      }
      
      const response = await checkFn(jobId);
      
      // Update job state
      jobState.status = response.status;
      jobState.lastPolled = Date.now();
      jobState.attempts += 1;
      
      if (response.status === 'COMPLETED') {
        jobState.result = response.result;
      } else if (response.status === 'FAILED') {
        jobState.error = response.error;
      }
      
      this.saveActiveJobs();
      return response;
    } catch (error) {
      console.error(`[JobManager] Error polling job ${jobId}:`, error);
      throw error;
    }
  }

  /**
   * Poll for a job's status until it completes, fails, or exceeds max attempts.
   * 
   * @param jobId Job ID to wait for
   * @param checkFn Function that checks a job's status
   * @param options Job options including callbacks for progress updates
   * @returns Promise resolving to the job result
   */
  async waitForCompletion(
    jobId: string, 
    checkFn: (id: string) => Promise<JobStatusResponse<T>>,
    options: JobOptions = {}
  ): Promise<T> {
    const onProgress = options.onProgress;
    const jobState = this.activeJobs.get(jobId);
    
    if (!jobState) {
      throw new Error(`Job ${jobId} not found`);
    }

    return new Promise<T>((resolve, reject) => {
      const poll = async () => {
        try {
          // Poll for job status
          const status = await this.pollJobStatus(jobId, checkFn);
          
          // Notify of progress
          if (onProgress) {
            const progress = Math.min(0.9, jobState.attempts / this.maxAttempts);
            onProgress(progress);
          }
          
          // Handle job completion
          if (status.status === 'COMPLETED' && status.result) {
            if (onProgress) onProgress(1.0);
            this.removeActiveJob(jobId);
            resolve(status.result);
            return;
          }
          
          // Handle job failure
          if (status.status === 'FAILED') {
            this.removeActiveJob(jobId);
            reject(new Error(status.error || 'Job failed'));
            return;
          }
          
          // Check if we've exceeded max attempts
          if (jobState.attempts >= this.maxAttempts) {
            this.removeActiveJob(jobId);
            reject(new Error(`Job timed out after ${this.maxAttempts} polling attempts`));
            return;
          }
          
          // Schedule next poll
          setTimeout(poll, this.pollingIntervalMs);
        } catch (error) {
          reject(error);
        }
      };
      
      // Start polling
      poll();
    });
  }

  /**
   * Resume tracking and polling for any previously active jobs.
   * 
   * @param checkFn Function that checks a job's status
   * @param onJobComplete Callback when a job completes
   */
  resumeActiveJobs(
    checkFn: (id: string) => Promise<JobStatusResponse<T>>,
    onJobComplete?: (jobId: string, result: T) => void
  ): void {
    this.activeJobs.forEach((job, jobId) => {
      // Skip already completed/failed jobs
      if (job.status === 'COMPLETED' || job.status === 'FAILED') {
        return;
      }
      
      // Resume polling for this job
      this.waitForCompletion(jobId, checkFn)
        .then(result => {
          if (onJobComplete) {
            onJobComplete(jobId, result);
          }
        })
        .catch(error => {
          console.error(`[JobManager] Error completing resumed job ${jobId}:`, error);
        });
    });
  }

  /**
   * Get a list of all active job IDs.
   * 
   * @returns Array of active job IDs
   */
  getActiveJobIds(): string[] {
    return Array.from(this.activeJobs.keys());
  }

  /**
   * Check if a job is currently active.
   * 
   * @param jobId Job ID to check
   * @returns True if the job is active
   */
  isJobActive(jobId: string): boolean {
    return this.activeJobs.has(jobId);
  }

  /**
   * Remove a job from the active jobs list.
   * 
   * @param jobId Job ID to remove
   */
  private removeActiveJob(jobId: string): void {
    this.activeJobs.delete(jobId);
    this.saveActiveJobs();
  }

  /**
   * Save active jobs to local storage.
   */
  private saveActiveJobs(): void {
    const serializedJobs = JSON.stringify(Array.from(this.activeJobs.entries()));
    chrome.storage.local.set({ [JOB_CONFIG.STORAGE_KEY]: serializedJobs });
  }

  /**
   * Load active jobs from local storage.
   */
  private async loadActiveJobs(): Promise<void> {
    try {
      const storage = await chrome.storage.local.get(JOB_CONFIG.STORAGE_KEY);
      const serializedJobs = storage[JOB_CONFIG.STORAGE_KEY];
      
      if (serializedJobs) {
        const jobEntries = JSON.parse(serializedJobs) as [string, JobState<T>][];
        this.activeJobs = new Map(jobEntries);
      }
    } catch (error) {
      console.error('[JobManager] Error loading active jobs:', error);
      // Start with empty job list on error
      this.activeJobs = new Map();
    }
  }
}
