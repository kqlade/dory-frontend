/**
 * @file jobManager.ts
 * 
 * Type definitions for the JobManager utility.
 * Defines interfaces for job states, options, and status responses.
 */

/**
 * Possible states for an asynchronous job
 */
export type JobStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';

/**
 * Interface for storing job state information
 */
export interface JobState<T> {
  jobId: string;
  status: JobStatus;
  result?: T;
  error?: string;
  startTime: number;
  lastPolled: number;
  attempts: number;
}

/**
 * Configuration options for job polling and progress tracking
 */
export interface JobOptions {
  pollingIntervalMs?: number;
  maxAttempts?: number;
  onProgress?: (progress: number) => void;
}

/**
 * Response from a job status check
 */
export interface JobStatusResponse<T> {
  status: JobStatus;
  result?: T;
  error?: string;
} 