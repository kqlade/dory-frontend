/**
 * @file config.ts
 * 
 * Centralized configuration for API endpoints and constants
 */

// Debug flags
export const DEBUG = process.env.NODE_ENV !== 'production';

// API Configuration
export const API_BASE_URL = 'https://web-production-447f.up.railway.app';

// OAuth Configuration
export const GOOGLE_CLIENT_ID = '893405528801-789i9jpdlvpg86j8tkthdv47m3joro6b.apps.googleusercontent.com';

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
  SEARCH_CLICKS: '/api/cold-storage/search-clicks',
  SEARCH_QUERIES: '/api/cold-storage/search-queries'
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

// UI Configuration
export const UI_CONFIG = {
  // Duration to show loading animation for clusters (in milliseconds)
  CLUSTER_LOADING_DURATION_MS: 5000
};

// Storage Keys
export const STORAGE_KEYS = {
  AUTH_STATE: 'authState',
  LAST_SYNC_KEY: 'lastColdStorageSync',
  CIRCUIT_BREAKER_KEY: 'coldStorageSyncCircuitBreaker',
  TELEMETRY_KEY: 'coldStorageSyncTelemetry',
  CLUSTER_HISTORY_KEY: 'clusterHistory',
  CLUSTER_STATUS_KEY: 'clusterStatus',
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
  POLLING_INTERVAL_MS: 10000,
  
  // Maximum number of polling attempts before giving up
  MAX_POLLING_ATTEMPTS: 30
};

// Clustering configuration
export const CLUSTERING_CONFIG = {
  // Regular refresh interval for clusters (in minutes)
  REFRESH_INTERVAL_MINUTES: 15,
  
  // Initial delay before first clustering job starts (in milliseconds)
  INITIAL_DELAY_MS: 15000 // 15 seconds
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
  
  // Authentication title keywords to filter (now as Regex strings)
  // Use \b for word boundaries to avoid matching substrings within words.
  // Case-insensitivity will be handled by the RegExp constructor flag.
  AUTH_TITLE_KEYWORDS: [
    // Login/Signup
    '\b(log ?in|signin|sign ?in)\b', // log in, login, signin, sign in
    '\b(sign ?up|signup|register)\b', // sign up, signup, register
    '\b(authenticate|authentication)\b',
    '\baccount access\b', '\baccess account\b',
    '\bauth\b', // standalone auth
    // Logout
    '\b(log ?out|logout|sign ?out|signout)\b', // log out, logout, sign out, signout
    // Password Reset
    '\breset password\b', '\bforgot password\b',
    // Error Pages (allowing optional codes/text after)
    '\b(404|not found)\b',
    '\b(error|server error)\b',
    '\b(oops|problem loading page)\b'
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
  
  // Delay after navigation before attempting content extraction (in milliseconds)
  EXTRACTION_DEBOUNCE_DELAY: 3000
} as const;

// Search Configuration
export const SEARCH_CONFIG = {
  // Debounce delay for search inputs (in milliseconds)

  SEARCH_DEBOUNCE_MS: 150, // For the refactored components
  
  // Minimum length for a query to trigger search
  MIN_QUERY_LENGTH: 2,
  
  // Maximum number of history results to request
  MAX_HISTORY_RESULTS: 100,
  
  // Maximum number of local results to show
  MAX_LOCAL_RESULTS: 10,
  
  // Maximum number of semantic results to show
  MAX_SEMANTIC_RESULTS: 10,
  
  // Minimum score threshold for semantic search results (0-1)
  // Results with scores below this value will be filtered out
  MIN_SEMANTIC_SCORE: 0.5
} as const;

