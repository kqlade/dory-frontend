/**
 * src/api/config.ts
 *
 * Central configuration for your backend URLs and settings.
 */

// API Configuration
export const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000/api';

// Whether to use fitMarkdown (true) or regular markdown (false) for document processing
export const USE_FIT_MARKDOWN = true;

// Available backend endpoints
export const ENDPOINTS = {
  HEALTH: '/health',
  ADVANCED_SEARCH: '/search',
  EVENTS: '/events'
};

// Typical request timeout (ms)
export const REQUEST_TIMEOUT = 60000; // e.g., 10 seconds

// Retry config
export const RETRY_ATTEMPTS = 3;
export const RETRY_DELAY = 5000; // 1 second between retries

// Event streaming config
export const EVENT_BATCH_SIZE = 50; // Maximum number of events to send in a batch
export const EVENT_FLUSH_INTERVAL = 30000; // Flush events every 30 seconds