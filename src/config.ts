/**
 * src/config.ts
 *
 * Central configuration for the Dory extension.
 * Includes settings for the API, background service worker, and queue processing.
 */

// ============================================================================
// API Configuration
// ============================================================================

// API base URL and endpoints
export const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000/api';

// Available backend endpoints
export const ENDPOINTS = {
  HEALTH: '/health',
  UNIFIED_SEARCH: '/unified-search',
  CONTENT: '/content',
  COLD_STORAGE: {
    BASE: '/cold-storage',
    PAGES: '/cold-storage/pages',
    VISITS: '/cold-storage/visits',
    SESSIONS: '/cold-storage/sessions',
    SEARCH_CLICKS: '/cold-storage/search-clicks'
  }
} as const;

// API request settings
export const REQUEST_TIMEOUT = 60000; // 60 seconds
export const RETRY_ATTEMPTS = 3;
export const RETRY_DELAY = 5000; // 5 seconds between retries

// Processing options
export const USE_FIT_MARKDOWN = true; // Whether to use fitMarkdown (true) or regular markdown (false)

// Event streaming config
export const EVENT_BATCH_SIZE = 50; // Maximum number of events to send in a batch
export const EVENT_FLUSH_INTERVAL = 30000; // Flush events every 30 seconds

// ============================================================================
// Queue Processing Configuration
// ============================================================================

export const QUEUE_CONFIG = {
  // Maximum number of retries for processing a URL
  MAX_RETRIES: 3,
  
  // Delay between retries (in milliseconds)
  RETRY_DELAY_MS: 3000,
  
  // Maximum time to process a single URL (in milliseconds)
  PROCESSING_TIMEOUT_MS: 60000,

  // Maximum time to wait for DOM to settle (in milliseconds)
  DOM_IDLE_TIMEOUT_MS: 7000,

  // How long to wait after last mutation to declare DOM "idle" (in milliseconds)
  DOM_IDLE_CHECK_DELAY_MS: 500
} as const;

// ============================================================================
// Debug Configuration
// ============================================================================

// Debug mode flag - controls verbose logging
export const DEBUG = process.env.NODE_ENV !== 'production'; 