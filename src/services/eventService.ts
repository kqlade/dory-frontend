/**
 * src/services/eventService.ts
 * 
 * Specialized event sender functions for different event types.
 * 
 * IMPORTANT ARCHITECTURE NOTE:
 * - Most browsing data is stored LOCALLY in IndexedDB and synced to the backend
 *   once per day via the cold storage sync process.
 * - The only exception is content extraction, which is sent directly to the backend
 *   in real-time via sendContentEvent().
 * - The other functions in this file (sendSessionEvent, sendVisitEvent) should ONLY
 *   be used by the cold storage sync process, not during normal browsing.
 */

import { API_BASE_URL, ENDPOINTS } from '../config';
import { getUserInfo, UserInfo } from '../auth/googleAuth';

// Types for different event payloads
export interface ContentEvent {
  pageId: string;
  visitId: string;
  url: string;
  title: string;
  markdown: string;
  metadata?: {
    language: string;
    [key: string]: any;
  };
}

export interface SessionEvent {
  sessionId: string;
  startTime?: number;
  endTime?: number;
  operation: 'SESSION_STARTED' | 'SESSION_ENDED';
  data?: any;
}

export interface VisitEvent {
  pageId: string;
  visitId: string;
  sessionId: string;
  url: string;
  startTime?: number;
  endTime?: number;
  operation: 'PAGE_VISIT_STARTED' | 'PAGE_VISIT_ENDED' | 'ACTIVE_TIME_UPDATED';
  data?: any;
}

// Keep track of current user
let currentUser: UserInfo | null = null;

/**
 * Initialize event service
 * Authentication is already verified at the extension level
 */
export async function initEventService(): Promise<void> {
  // Get user info once at startup - we know user is authenticated
  try {
    currentUser = await getUserInfo();
    console.log('[EventService] Initialized for user:', currentUser?.email);
  } catch (error) {
    console.error('[EventService] Error getting user info:', error);
  }
}

/**
 * Base function to get current user info
 * @returns Current user info or null
 */
async function getCurrentUser(): Promise<UserInfo | null> {
  if (!currentUser) {
    try {
      currentUser = await getUserInfo();
    } catch (error) {
      console.error('[EventService] Failed to get user info:', error);
    }
  }
  return currentUser;
}

/**
 * Base function to send data to an API endpoint with retry logic
 */
async function sendToAPI(endpoint: string, data: any, retryCount = 0): Promise<Response> {
  const maxRetries = 3;
  const retryDelay = 1000; // 1 second
  
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
      credentials: 'include',
    });
    
    if (!response.ok) {
      throw new Error(`Server returned ${response.status}: ${response.statusText}`);
    }
    
    return response;
  } catch (error) {
    console.error(`[EventService] Error sending to ${endpoint}:`, error);
    
    // Retry logic
    if (retryCount < maxRetries) {
      console.log(`[EventService] Retrying (${retryCount + 1}/${maxRetries})...`);
      await new Promise(resolve => setTimeout(resolve, retryDelay * (retryCount + 1)));
      return sendToAPI(endpoint, data, retryCount + 1);
    }
    
    throw error;
  }
}

/**
 * Send content extraction event to the dedicated content API endpoint
 * 
 * NOTE: This is the ONLY function that should be called directly during normal browsing.
 * Content extraction is special-cased to be sent in real-time.
 */
export async function sendContentEvent(content: ContentEvent): Promise<void> {
  const user = await getCurrentUser();
  
  try {
    await sendToAPI(ENDPOINTS.CONTENT, {
      userId: user?.id,
      pageId: content.pageId,
      visitId: content.visitId,
      url: content.url,
      title: content.title,
      markdown: content.markdown,
      metadata: content.metadata || { language: 'en' }
    });
    console.log('[EventService] Content event sent successfully');
  } catch (error) {
    console.error('[EventService] Failed to send content event:', error);
  }
}

/**
 * Send session event to the cold storage sessions endpoint
 * 
 * NOTE: This function should ONLY be used by the cold storage sync process,
 * not during normal browsing. Normal browsing events should be stored locally
 * in IndexedDB and synced later.
 */
export async function sendSessionEvent(event: SessionEvent): Promise<void> {
  const user = await getCurrentUser();
  
  try {
    await sendToAPI(ENDPOINTS.COLD_STORAGE.SESSIONS, {
      userId: user?.id,
      sessionId: event.sessionId,
      operation: event.operation,
      timestamp: Date.now(),
      startTime: event.startTime,
      endTime: event.endTime,
      data: event.data
    });
    console.log(`[EventService] Session event (${event.operation}) sent successfully`);
  } catch (error) {
    console.error('[EventService] Failed to send session event:', error);
  }
}

/**
 * Send visit event to the cold storage visits endpoint
 * 
 * NOTE: This function should ONLY be used by the cold storage sync process,
 * not during normal browsing. Normal browsing events should be stored locally
 * in IndexedDB and synced later.
 */
export async function sendVisitEvent(event: VisitEvent): Promise<void> {
  const user = await getCurrentUser();
  
  try {
    await sendToAPI(ENDPOINTS.COLD_STORAGE.VISITS, {
      userId: user?.id,
      pageId: event.pageId,
      visitId: event.visitId,
      sessionId: event.sessionId,
      url: event.url,
      operation: event.operation,
      timestamp: Date.now(),
      startTime: event.startTime,
      endTime: event.endTime,
      data: event.data
    });
    console.log(`[EventService] Visit event (${event.operation}) sent successfully`);
  } catch (error) {
    console.error('[EventService] Failed to send visit event:', error);
  }
}

/**
 * Track search click for analytics
 * 
 * This function logs search click events locally to be synced later via cold storage,
 * consistent with how other events are handled.
 * 
 * @param searchSessionId The search session ID
 * @param pageId The page ID that was clicked
 * @param position The position of the result in the list
 * @param url The URL of the clicked result
 * @param query The search query that produced this result
 */
export async function trackSearchClick(
  searchSessionId: string, 
  pageId: string, 
  position: number,
  url: string,
  query: string
): Promise<void> {
  try {
    // Import here to avoid circular dependency
    const { logEvent } = await import('./dexieEventLogger');
    const { EventType } = await import('../api/types');
    const { getCurrentSessionId } = await import('./dexieSessionManager');
    
    // Get the current session ID
    const sessionId = await getCurrentSessionId();
    
    if (!sessionId) {
      console.error('[EventService] Cannot track search click: No active session');
      return;
    }
    
    // Generate a timestamp for this click
    const timestamp = Date.now();
    
    // Log the search click event locally
    await logEvent({
      operation: EventType.SEARCH_CLICK,
      sessionId: sessionId.toString(),
      timestamp: timestamp,
      data: {
        // These fields match the backend's expected structure
        searchSessionId,
        pageId,
        position,
        url,
        query
      }
    });
    
    console.log('[EventService] Search click logged successfully for local sync');
  } catch (error) {
    console.error('[EventService] Failed to log search click:', error);
  }
} 