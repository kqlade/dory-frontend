export const API_BASE_URL = process.env.API_BASE_URL || 'https://dory-backend-e18a6624326d.herokuapp.com';

export const ENDPOINTS = {
  HEALTH: '/api/health',
  UNIFIED_SEARCH: '/api/search',
  SEARCH: '/api/search',
  CONTENT: '/api/content',
  COLD_STORAGE: {
    BASE: '/api/cold-storage',
    PAGES: '/api/cold-storage/pages',
    VISITS: '/api/cold-storage/visits',
    SESSIONS: '/api/cold-storage/sessions',
    SEARCH_CLICKS: '/api/cold-storage/search-clicks'
  },
  AUTH: {
    ME: '/api/auth/me',
    TOKEN: '/api/auth/token',     // Exchange Google token for session
    LOGOUT: '/api/auth/logout'    // Logout endpoint
  },
  CLUSTERING: {
    SUGGESTIONS: '/api/clustering/suggestions'
  }
} as const;

export const REQUEST_TIMEOUT = 60000;
export const RETRY_ATTEMPTS = 3;
export const RETRY_DELAY = 5000;
export const USE_FIT_MARKDOWN = true;
export const EVENT_BATCH_SIZE = 50;
export const EVENT_FLUSH_INTERVAL = 30000;

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
export const DEBUG = true; // Force debug logs on 

// ============================================================================
// Feature Flags
// ============================================================================

// Controls whether the global search shortcut (Command+Shift+Space) is enabled
export const ENABLE_GLOBAL_SEARCH = true; 