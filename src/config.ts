/**
 * @file config.ts
 * 
 * Centralized configuration for API endpoints and constants
 */

// Debug flags
export const DEBUG = process.env.NODE_ENV !== 'production';

// API Configuration
export const API_BASE_URL = process.env.API_BASE_URL || 'https://dory-backend-e18a6624326d.herokuapp.com';

// OAuth Configuration
export const GOOGLE_CLIENT_ID = process.env.VITE_GOOGLE_OAUTH_CLIENT_ID || '';

// Endpoint Groups
export const AUTH_ENDPOINTS = {
  ME: '/api/auth/me',
  TOKEN: '/api/auth/token',
  REFRESH: '/api/auth/refresh',
  LOGOUT: '/api/auth/logout',
};

export const COLD_STORAGE_ENDPOINTS = {
  BASE: '/api/cold-storage',
  PAGES: '/api/cold-storage/pages',
  VISITS: '/api/cold-storage/visits',
  SESSIONS: '/api/cold-storage/sessions',
  SEARCH_CLICKS: '/api/cold-storage/search-clicks'
};

export const CONTENT_ENDPOINTS = {
  CONTENT: '/api/content'
};

export const CLUSTERING_ENDPOINTS = {
  SUGGESTIONS: '/api/clustering/suggestions',
  SUGGESTIONS_SYNC: '/api/clustering/suggestions_sync',
  JOB_STATUS: '/api/clustering/job_status',
  REFRESH: '/api/clustering/refresh'
};

export const SEARCH_ENDPOINTS = {
  SEARCH: '/api/search'
};

// Search Configuration Constants are defined lower in the file

// Storage Keys
export const STORAGE_KEYS = {
  AUTH_STATE: 'authState',
  LAST_SYNC_KEY: 'lastColdStorageSync',
  CIRCUIT_BREAKER_KEY: 'coldStorageSyncCircuitBreaker',
  TELEMETRY_KEY: 'coldStorageSyncTelemetry',
  CLUSTER_HISTORY_KEY: 'clusterHistory',
  ACTIVE_JOBS_KEY: 'activeJobs',
  PREFERRED_THEME_KEY: 'preferredTheme'
};



// Cold Storage Sync Configuration
export const COLD_STORAGE_CONFIG = {
  SYNC_INTERVAL_MINUTES: 5,
  BATCH_SIZE: 500,
  MAX_CONSECUTIVE_FAILURES: 3,
  CIRCUIT_RESET_TIME_MS: 30 * 60 * 1000, // 30 minutes
};

// Job Configuration
export const JOB_CONFIG = {
  // Polling interval for job status (in milliseconds)
  POLLING_INTERVAL_MS: 3000,
  
  // Maximum number of polling attempts before giving up
  MAX_POLLING_ATTEMPTS: 20,
  
  // Storage key for tracking jobs
  STORAGE_KEY: 'activeJobs'
};

// Clustering configuration
export const CLUSTERING_CONFIG = {
  // Regular refresh interval for clusters (in minutes)
  REFRESH_INTERVAL_MINUTES: 5
};

// URL Filtering Configuration
export const URL_FILTER_CONFIG = {
  // URL schemes to ignore
  IGNORED_URL_SCHEMES: [
    'about:', 'data:', 'blob:', 'javascript:', 'mailto:', 'tel:'
  ],
  
  // Generic titles to filter out
  GENERIC_TITLES: [
    '', 'untitled'
  ],
  
  // Google search domains to filter
  GOOGLE_SEARCH_DOMAINS: [
    'www.google.com',
    'www.google.co.uk',
    'www.google.ca',
    'www.google.com.au',
    'www.google.de',
    'www.google.fr',
    'www.google.es',
    'www.google.it',
    'www.google.co.jp',
    'www.google.com.br',
  ],
  
  // Authentication path endings to filter
  AUTH_PATH_ENDINGS: [
    // Login/Signup
    '/login', '/signin', '/signup', '/auth', '/authenticate',
    '/sso', '/oauth', '/account/login', '/account/signin', '/login.php', '/login.aspx',
    // Logout
    '/logout', '/signout', '/account/logout', '/account/signout',
    // Password Reset
    '/password/reset', '/forgot-password', '/reset-password', '/account/reset'
  ],
  
  // Authentication title keywords to filter
  AUTH_TITLE_KEYWORDS: [
    // Login/Signup
    'log in', 'login', 'sign in', 'signin', 'sign up', 'signup',
    'authenticate', 'authentication', 'account access', 'access account',
    // Logout
    'log out', 'logout', 'sign out', 'signout',
    // Password Reset
    'reset password', 'forgot password',
    // Error Pages
    '404', 'not found', 'error', 'server error', 'oops', 'problem loading page'
  ]
};

// Dory Ranking Configuration
export const RANKING_CONFIG = {
  // BM25 parameters
  BM25: {
    K1: 1.2,
    B_TITLE: 0.75,
    B_URL: 0.75,
    WEIGHT_TITLE: 1.0,
    WEIGHT_URL: 2.0,
  },
  
  // Time decay half-lives in seconds
  TIME_DECAY: {
    SHORT_TERM: 7200,  // 2-hour half-life
    MEDIUM_TERM: 86400, // 1-day half-life
    LONG_TERM: 604800,  // 7-day half-life
  },
  
  // Recency weighting factors
  RECENCY_WEIGHTS: {
    SHORT_TERM: 1.0,
    MEDIUM_TERM: 0.5,
    LONG_TERM: 0.2,
  },
  
  // Substring matching bonus weights
  SUBSTRING_BONUS: {
    URL_PREFIX: 2.0,
    URL_CONTAINS: 1.0,
    TITLE_PREFIX: 1.0,
    TITLE_CONTAINS: 0.5,
  }
};

// Content Extraction Configuration
export const USE_FIT_MARKDOWN = true;
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
  DOM_IDLE_CHECK_DELAY_MS: 500,
  
  // Content script ping configuration
  PING: {
    // Maximum number of ping attempts before giving up
    MAX_ATTEMPTS: 5,
    
    // Initial delay between ping attempts (ms)
    INITIAL_DELAY: 1000,
    
    // Timeout for each individual ping attempt (ms)
    TIMEOUT_PER_ATTEMPT: 500
  }
} as const;

// Search Configuration
export const SEARCH_CONFIG = {
  // Debounce delay for search inputs (in milliseconds)
  DEBOUNCE_MS: 150,
  SEARCH_DEBOUNCE_MS: 300, // For the refactored components
  
  // Minimum length for a query to trigger search
  MIN_QUERY_LENGTH: 2,
  
  // Maximum number of history results to request
  MAX_HISTORY_RESULTS: 100,
  
  // Maximum number of local results to show
  MAX_LOCAL_RESULTS: 10,
  
  // Maximum number of semantic results to show
  MAX_SEMANTIC_RESULTS: 20,
  
  // Minimum score threshold for semantic search results (0-1)
  // Results with scores below this value will be filtered out
  MIN_SEMANTIC_SCORE: 0.5
} as const;

