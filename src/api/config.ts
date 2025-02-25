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
  EMBEDDINGS: '/embeddings',
  EMBEDDINGS_SEARCH: '/embeddings/search',
  DOCUMENTS: '/documents',
  DOCUMENTS_BATCH: '/documents/batch',
  HEALTH: '/health',
  ADVANCED_SEARCH: '/search'
};

// Typical request timeout (ms)
export const REQUEST_TIMEOUT = 15000; // e.g., 10 seconds

// Retry config
export const RETRY_ATTEMPTS = 3;
export const RETRY_DELAY = 1000; // 1 second between retries