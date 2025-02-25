/**
 * src/background/config.ts
 * 
 * Configuration constants for the background service worker.
 */

// History-related configuration
export const HISTORY_CONFIG = {
  // Number of days of history to fetch
  DAYS_OF_HISTORY: 0,
  
  // How often to poll for new history items (in minutes)
  POLLING_INTERVAL_MIN: 60,
  
  // Maximum number of history results to fetch at once
  MAX_HISTORY_RESULTS: 50
} as const;

// Window-related configuration
export const WINDOW_CONFIG = {
  // Delay before reopening a window (in milliseconds)
  REOPEN_DELAY_MS: 5000,
  
  // Configuration for the processing window
  PROCESSING_WINDOW_CONFIG: {
    type: 'normal' as const,
    state: 'normal' as const,
    focused: false,
    width: 1024,
    height: 768,
    setSelfAsOpener: false,
  }
} as const;

// Queue processing configuration
export const QUEUE_CONFIG = {
  // Maximum number of retries for processing a URL
  MAX_RETRIES: 3,
  
  // Delay between retries (in milliseconds)
  RETRY_DELAY_MS: 3000,
  
  // Maximum time to process a single URL (in milliseconds)
  PROCESSING_TIMEOUT_MS: 30000,

  // Maximum time to wait for DOM to settle (in milliseconds)
  DOM_IDLE_TIMEOUT_MS: 7000,

  // How long to wait after last mutation to declare DOM "idle" (in milliseconds)
  DOM_IDLE_CHECK_DELAY_MS: 500
} as const;

// Logging configuration
export const LOGGING_CONFIG = {
  // Whether to enable verbose logging
  VERBOSE: true,
  
  // Log prefix for the service worker
  PREFIX: '[ServiceWorker]'
} as const; 