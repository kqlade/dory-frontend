// src/api/client.ts

import {
  API_BASE_URL,
  ENDPOINTS,
  REQUEST_TIMEOUT,
  RETRY_ATTEMPTS,
  RETRY_DELAY,
} from '../config';

import {
  ApiError,
  SearchResponse,
} from './types';

import {
  sendContentEvent,
  sendSessionEvent,
  sendVisitEvent,
  trackSearchClick,
} from '../services/eventService';

/**
 * Delays execution for the specified number of milliseconds.
 */
const delay = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms));

/**
 * Main API request function with retry and timeout logic.
 * 
 * @param endpoint - API endpoint (relative to API_BASE_URL).
 * @param init - Custom Fetch configuration.
 * @param attempt - Current retry attempt number.
 */
export async function apiRequest<T>(
  endpoint: string,
  init: RequestInit = {},
  attempt = 1
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;

  // Prepare default JSON headers
  const headers = new Headers(init.headers || {});
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');

  // Setup a timeout controller
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  const config: RequestInit = {
    ...init,
    headers,
    credentials: 'include', // Always include credentials for cookies
    signal: controller.signal,
  };

  try {
    const response = await fetch(url, config);
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new ApiError(
        `API error (${response.status}): ${errorText}`,
        response.status
      );
    }

    // Handle 204 (No Content)
    if (response.status === 204) {
      return {} as T;
    }

    // Otherwise, parse JSON response
    return (await response.json()) as T;

  } catch (error) {
    clearTimeout(timeoutId);
    console.error(
      `[API Client] Request failed (attempt ${attempt}/${RETRY_ATTEMPTS}):`,
      error
    );

    // If we have exhausted all retry attempts, rethrow the error
    if (attempt >= RETRY_ATTEMPTS) {
      throw error;
    }

    // Wait briefly before retrying (could use exponential backoff instead)
    await delay(RETRY_DELAY);
    return apiRequest<T>(endpoint, init, attempt + 1);
  }
}

/**
 * Shortcut for making GET requests.
 */
export async function apiGet<T>(endpoint: string): Promise<T> {
  return apiRequest<T>(endpoint, { method: 'GET' });
}

/**
 * Shortcut for making POST requests.
 */
export async function apiPost<T>(endpoint: string, body: unknown): Promise<T> {
  return apiRequest<T>(endpoint, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/**
 * Basic search call for browser history or other data.
 */
export async function searchHistory(
  query: string,
  userId: string
): Promise<SearchResponse> {
  const payload = {
    query,
    userId,
    timestamp: Date.now(),
  };
  return apiPost<SearchResponse>(ENDPOINTS.UNIFIED_SEARCH, payload);
}

/**
 * Checks the backend health.
 */
export async function checkHealth(): Promise<{ status: string }> {
  return apiGet<{ status: string }>(ENDPOINTS.HEALTH);
}

/**
 * Standard REST API search used for semantic search.
 * 
 * @param query - The search query.
 * @param userId - The user identifier.
 * @param options - Optional parameters to control the search.
 */
export async function semanticSearch(
  query: string,
  userId: string = 'default',
  options: {
    limit?: number;
    useHybridSearch?: boolean;
    useLLMExpansion?: boolean;
    useReranking?: boolean;
  } = {}
) {
  console.log(`[API] Semantic search: "${query}"`);

  try {
    // Use apiRequest instead of direct fetch
    return await apiPost(ENDPOINTS.SEARCH, {
      query,
      userId,
      limit: options.limit || 20,
      useHybridSearch: options.useHybridSearch !== false,
      useLLMExpansion: options.useLLMExpansion !== false,
      useReranking: options.useReranking !== false,
    });
  } catch (error) {
    console.error('[Semantic Search] Error:', error);
    throw error;
  }
}

// Re-export direct access to eventService functions if needed
export { sendContentEvent, sendSessionEvent, sendVisitEvent, trackSearchClick };