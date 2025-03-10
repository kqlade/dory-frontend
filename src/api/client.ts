/**
 * src/api/client.ts
 */

import {
  API_BASE_URL,
  ENDPOINTS,
  REQUEST_TIMEOUT,
  RETRY_ATTEMPTS,
  RETRY_DELAY
} from '../config';

import {
  ApiError,
  SearchResponse,
  DoryEvent,
  EventType
} from './types';

import { 
  sendContentEvent, 
  sendSessionEvent, 
  sendVisitEvent, 
  trackSearchClick 
} from '../services/eventService';

/**
 * Helper: Delay for a given ms
 */
const delay = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Main API request function with timeout and retry logic
 */
export async function apiRequest<T>(
  endpoint: string,
  init: RequestInit = {},
  attempt = 1
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;

  // Set default headers for JSON API
  const headers = new Headers(init.headers || {});
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }

  // Create an AbortController for timeout handling
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  const config: RequestInit = {
    ...init,
    headers,
    signal: controller.signal,
  };

  try {
    const response = await fetch(url, config);
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error (${response.status}): ${errorText}`);
    }

    // If no content, return empty object
    if (response.status === 204) {
      return {} as T;
    }

    return await response.json();
  } catch (err) {
    clearTimeout(timeoutId);
    console.error(`API request failed (attempt ${attempt}/${RETRY_ATTEMPTS}):`, err);

    if (attempt >= RETRY_ATTEMPTS) {
      throw err;
    }

    // Optionally, you can use exponential backoff: RETRY_DELAY * attempt
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
 * Search history with the required payload structure
 */
export async function searchHistory(
  query: string,
  userId: string
): Promise<SearchResponse> {
  const payload = {
    query,
    userId,
    timestamp: Math.floor(Date.now())
  };

  return apiPost<SearchResponse>(ENDPOINTS.UNIFIED_SEARCH, payload);
}

// Single source of search state with abort controller
let currentSearchController: AbortController | null = null;

/**
 * Search with Server-Sent Events (SSE)
 */
export function searchWithSSE(
  query: string,
  userId: string,
  triggerSemantic = false,
  onResults: (results: any, type: string) => void
) {
  // Cancel previous search if exists
  if (currentSearchController) {
    currentSearchController.abort();
  }

  // Create new controller
  currentSearchController = new AbortController();

  fetch(`${API_BASE_URL}${ENDPOINTS.UNIFIED_SEARCH}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream'
    },
    body: JSON.stringify({
      query,
      userId,
      timestamp: Math.floor(Date.now()),
      triggerSemantic
    }),
    signal: currentSearchController.signal
  })
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      // Process the stream using async/await for clarity
      const processStream = async (): Promise<void> => {
        try {
          const { done, value } = await reader.read();
          if (done) return;

          // Decode and append the chunk to the buffer
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split('\n\n');
          buffer = events.pop() || '';

          // Process each complete event in the buffer
          for (const event of events) {
            if (!event.trim()) continue;

            const dataMatch = event.match(/^data: (.+)$/m);
            if (!dataMatch) continue;

            try {
              const data = JSON.parse(dataMatch[1]);
              onResults(data, data.type);

              // If the search is complete, stop processing
              if (data.type === 'complete') {
                reader.cancel();
                return;
              }
            } catch (e) {
              console.error('Error parsing SSE data:', e);
            }
          }

          // Recursively process the next chunk
          await processStream();
        } catch (err) {
          if ((err as any).name !== 'AbortError') {
            console.error('SSE processing error:', err);
            onResults({ type: 'error', message: (err as Error).message }, 'error');
          }
        }
      };

      return processStream();
    })
    .catch(error => {
      if (error.name !== 'AbortError') {
        console.error('SSE error:', error);
        onResults({ type: 'error', message: error.message }, 'error');
      }
    });

  // Return a cancel function to abort the SSE request
  return () => {
    if (currentSearchController) {
      currentSearchController.abort();
      currentSearchController = null;
    }
  };
}

/**
 * @deprecated Use specialized event functions from eventService instead
 * Legacy function for backward compatibility during migration
 */
export async function sendEvent(event: any): Promise<Response> {
  console.warn('[API Client] sendEvent is deprecated. Use specialized event functions from eventService instead.');
  
  try {
    // Forward to the appropriate specialized function based on event type
    if (event.operation === 'CONTENT_EXTRACTED') {
      await sendContentEvent({
        pageId: event.data.pageId,
        visitId: event.data.visitId,
        url: event.data.url,
        title: event.data.content.title,
        markdown: event.data.content.markdown,
        metadata: event.data.content.metadata
      });
    } else if (event.operation === 'SESSION_STARTED' || event.operation === 'SESSION_ENDED') {
      await sendSessionEvent({
        sessionId: event.sessionId,
        operation: event.operation,
        data: event.data
      });
    } else if (
      event.operation === 'PAGE_VISIT_STARTED' || 
      event.operation === 'PAGE_VISIT_ENDED' || 
      event.operation === 'ACTIVE_TIME_UPDATED'
    ) {
      await sendVisitEvent({
        pageId: event.data.pageId,
        visitId: event.data.visitId,
        sessionId: event.sessionId,
        url: event.data.url || '',
        operation: event.operation,
        data: event.data
      });
    }
    
    // Return a mock response for backward compatibility
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('[API Client] Error sending event:', error);
    throw error;
  }
}

/**
 * Fetch health status from the API
 */
export async function checkHealth(): Promise<{ status: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}${ENDPOINTS.HEALTH}`, {
      method: 'GET',
      credentials: 'include',
    });
    
    if (!response.ok) {
      throw new Error(`Health check failed: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('[API Client] Health check failed:', error);
    throw error;
  }
}

/**
 * Create a streaming search connection to the backend
 * @param query The search query
 * @param triggerSemantic Whether to trigger semantic search
 * @returns EventSource for the streaming connection
 */
export function createSearchStream(query: string, triggerSemantic: boolean = true): EventSource {
  const url = new URL(`${API_BASE_URL}${ENDPOINTS.UNIFIED_SEARCH}`);
  url.searchParams.append('query', query);
  url.searchParams.append('triggerSemantic', triggerSemantic.toString());
  
  return new EventSource(url.toString(), { withCredentials: true });
}

// Export the specialized event functions for direct use
export { 
  sendContentEvent, 
  sendSessionEvent, 
  sendVisitEvent
};

// Export event type constants for convenience
export { EventType as Events };