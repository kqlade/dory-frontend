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
  DoryEvent,
  EventType,
} from './types';

import {
  sendContentEvent,
  sendSessionEvent,
  sendVisitEvent,
  trackSearchClick, // if you had it in eventService
} from '../services/eventService';

/**
 * Helper to pause execution for ms
 */
const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Main API request function with retry & timeout logic
 */
export async function apiRequest<T>(
  endpoint: string,
  init: RequestInit = {},
  attempt = 1
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;

  // Default JSON headers
  const headers = new Headers(init.headers || {});
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }

  // AbortController for timeout
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
      throw new ApiError(
        `API error (${response.status}): ${errorText}`,
        response.status
      );
    }

    // If 204 => no content
    if (response.status === 204) {
      return {} as T;
    }

    // Otherwise parse JSON
    return (await response.json()) as T;
  } catch (err) {
    clearTimeout(timeoutId);
    console.error(
      `[API Client] Request failed (attempt ${attempt}/${RETRY_ATTEMPTS}):`,
      err
    );

    if (attempt >= RETRY_ATTEMPTS) {
      throw err;
    }

    // Simple delay before next retry (could do exponential backoff if preferred)
    await delay(RETRY_DELAY);
    return apiRequest<T>(endpoint, init, attempt + 1);
  }
}

/**
 * Shortcuts for GET / POST
 */
export async function apiGet<T>(endpoint: string): Promise<T> {
  return apiRequest<T>(endpoint, { method: 'GET' });
}

export async function apiPost<T>(endpoint: string, body: unknown): Promise<T> {
  return apiRequest<T>(endpoint, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/**
 * Basic search call for browser history or other data
 */
export async function searchHistory(
  query: string,
  userId: string
): Promise<SearchResponse> {
  const payload = {
    query,
    userId,
    timestamp: Math.floor(Date.now()),
  };
  return apiPost<SearchResponse>(ENDPOINTS.UNIFIED_SEARCH, payload);
}

/**
 * SSE approach with manual stream reading
 */
let currentSearchController: AbortController | null = null;

/**
 * Kick off a streaming search (SSE) to the backend,
 * manually parsing chunked text/event-stream data.
 */
export function searchWithSSE(
  query: string,
  userId: string,
  triggerSemantic = false,
  onResults: (data: any, type: string) => void
): () => void {
  // Cancel any previous SSE
  if (currentSearchController) {
    currentSearchController.abort();
  }
  currentSearchController = new AbortController();

  fetch(`${API_BASE_URL}${ENDPOINTS.UNIFIED_SEARCH}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({
      query,
      userId,
      timestamp: Date.now(),
      triggerSemantic,
    }),
    signal: currentSearchController.signal,
  })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No readable stream available');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      const processStream = async (): Promise<void> => {
        try {
          const { done, value } = await reader.read();
          if (done) return;

          // Decode chunk
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split('\n\n');
          buffer = events.pop() || ''; // leftover partial data

          for (const event of events) {
            const trimmed = event.trim();
            if (!trimmed) continue;

            const dataMatch = trimmed.match(/^data:\s*(.+)$/m);
            if (!dataMatch) continue;

            try {
              const parsed = JSON.parse(dataMatch[1]);
              onResults(parsed, parsed.type);
              if (parsed.type === 'complete') {
                // SSE completed
                await reader.cancel();
                return;
              }
            } catch (parseErr) {
              console.error('[SSE] Parse error:', parseErr);
            }
          }

          // Recurse to read next chunk
          await processStream();
        } catch (err) {
          if ((err as any).name !== 'AbortError') {
            console.error('[SSE] Stream error:', err);
            onResults({ type: 'error', message: (err as Error).message }, 'error');
          }
        }
      };

      await processStream();
    })
    .catch((error) => {
      if (error.name !== 'AbortError') {
        console.error('[SSE] error:', error);
        onResults({ type: 'error', message: error.message }, 'error');
      }
    });

  // Return a cancel function
  return () => {
    if (currentSearchController) {
      currentSearchController.abort();
      currentSearchController = null;
    }
  };
}

/**
 * If you prefer using native EventSource:
 */
export function createSearchStream(
  query: string,
  triggerSemantic = true
): EventSource {
  const url = new URL(`${API_BASE_URL}${ENDPOINTS.UNIFIED_SEARCH}`);
  url.searchParams.append('query', query);
  url.searchParams.append('triggerSemantic', String(triggerSemantic));

  // Make sure your server & manifest handle cross-origin SSE properly
  return new EventSource(url.toString(), { withCredentials: true });
}

/**
 * @deprecated
 * Legacy event function. Use specialized ones from eventService instead.
 */
export async function sendEvent(event: DoryEvent): Promise<Response> {
  console.warn(
    '[API Client] sendEvent is deprecated. Use specialized event functions.'
  );
  try {
    if (event.operation === EventType.CONTENT_EXTRACTED) {
      await sendContentEvent({
        pageId: event.data.pageId,
        visitId: event.data.visitId,
        url: event.data.url,
        title: event.data.content.title,
        markdown: event.data.content.markdown,
        metadata: event.data.content.metadata,
      });
    } else if (
      event.operation === EventType.SESSION_STARTED ||
      event.operation === EventType.SESSION_ENDED
    ) {
      await sendSessionEvent({
        sessionId: event.sessionId,
        operation: event.operation,
        data: event.data,
      });
    } else if (
      event.operation === EventType.PAGE_VISIT_STARTED ||
      event.operation === EventType.PAGE_VISIT_ENDED ||
      event.operation === EventType.ACTIVE_TIME_UPDATED
    ) {
      await sendVisitEvent({
        pageId: event.data.pageId,
        visitId: event.data.visitId,
        sessionId: event.sessionId,
        url: event.data.url || '',
        operation: event.operation,
        data: event.data,
      });
    }

    // Return a mock success response
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[API Client] sendEvent error:', error);
    throw error;
  }
}

/**
 * Check backend health
 */
export async function checkHealth(): Promise<{ status: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}${ENDPOINTS.HEALTH}`, {
      method: 'GET',
      credentials: 'include',
    });
    if (!response.ok) {
      throw new Error(`Health check failed: HTTP ${response.status}`);
    }
    return (await response.json()) as { status: string };
  } catch (error) {
    console.error('[API Client] Health check error:', error);
    throw error;
  }
}

// Re-export if you want direct access to eventService functions here
export { sendContentEvent, sendSessionEvent, sendVisitEvent, trackSearchClick };