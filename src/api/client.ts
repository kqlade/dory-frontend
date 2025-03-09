/**
 * src/api/client.ts
 */

import {
    API_BASE_URL,
    ENDPOINTS,
    REQUEST_TIMEOUT,
    RETRY_ATTEMPTS,
    RETRY_DELAY
  } from './config';
  
  import {
    ApiError,
    SearchResponse,
    SearchRequest,
    DoryEvent,
    EventType
  } from './types';
  
  /**
   * Helper: Delay for a given ms
   */
  function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Main API request function with timeout and retry logic
   */
  export async function apiRequest<T>(
    endpoint: string,
    init: RequestInit = {},
    attempt = 1
  ): Promise<T> {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  
    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          ...(init.headers || {})
        },
        signal: controller.signal
      });
      clearTimeout(id);
  
      if (!response.ok) {
        const errorText = await response.text();
        const error = new ApiError(
          `API Error (${response.status}): ${errorText}`,
          response.status
        );
        throw error;
      }
  
      return await response.json();
  
    } catch (error) {
      clearTimeout(id);
  
      // If we've hit our retry limit, or this isn't a network error, rethrow
      if (
        attempt >= RETRY_ATTEMPTS ||
        (error instanceof Error && 'status' in error && 
         (error as ApiError).status !== 503 && (error as ApiError).status !== 429)
      ) {
        throw error;
      }
  
      // Otherwise, wait and retry
      console.warn(`API request failed, retrying (${attempt}/${RETRY_ATTEMPTS})...`);
      await delay(RETRY_DELAY);
      return apiRequest<T>(endpoint, init, attempt + 1);
    }
  }
  
  /**
   * Convenience helpers for common HTTP verbs
   */
  export async function apiGet<T>(endpoint: string): Promise<T> {
    return apiRequest<T>(endpoint, { method: 'GET' });
  }
  
  export async function apiPost<T>(endpoint: string, body: unknown): Promise<T> {
    return apiRequest<T>(endpoint, {
      method: 'POST',
      body: JSON.stringify(body)
    });
  }
  
  /**
   * Perform a semantic search
   */
  export async function semanticSearch(
    query: string, 
    limit: number = 3,
    options?: { 
      useHybridSearch?: boolean;
      useLLMExpansion?: boolean;
      useReranking?: boolean;
    }
  ): Promise<SearchResponse> {
    const searchRequest: SearchRequest = {
      query,
      limit
    };

    // Add search options as query parameters
    let queryParams = '';
    if (options) {
      const params = new URLSearchParams();
      
      if (options.useHybridSearch !== undefined) {
        params.append('hybrid', options.useHybridSearch.toString());
      }
      
      if (options.useLLMExpansion !== undefined) {
        params.append('expand', options.useLLMExpansion.toString());
      }
      
      if (options.useReranking !== undefined) {
        params.append('rerank', options.useReranking.toString());
      }
      
      const paramsString = params.toString();
      if (paramsString) {
        queryParams = `?${paramsString}`;
      }
    }

    return apiPost<SearchResponse>(`${ENDPOINTS.ADVANCED_SEARCH}${queryParams}`, searchRequest);
  }
  
  /**
   * Check if the backend is healthy
   */
  export async function checkHealth(): Promise<boolean> {
    try {
      await apiGet(ENDPOINTS.HEALTH);
      return true;
    } catch (error) {
      console.error('Health check failed:', error);
      return false;
    }
  }

  /**
   * Send a DORY event to the backend
   */
  export async function sendEvent(event: DoryEvent): Promise<void> {
    // Add timestamp if not provided
    if (!event.timestamp) {
      event.timestamp = Date.now();
    }
    
    try {
      await apiRequest(ENDPOINTS.EVENTS, {
        method: 'POST',
        body: JSON.stringify(event)
      });
    } catch (err) {
      console.error('[DORY] Failed sending event:', err);
    }
  }

  // Export event type constants for convenience
  export const Events = EventType;