// src/services/eventService.ts
import { API_BASE_URL, ENDPOINTS } from '../config';
import { getUserInfo, UserInfo } from '../auth/googleAuth';

// Types
export interface ContentEvent {
  pageId: string;
  visitId: string;
  url: string;
  title: string;
  markdown: string;
  metadata?: Record<string, any>;
  sessionId?: string | null;
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

// Local caching
let currentUser: UserInfo | null = null;

/**
 * Initialize the event service; typically called once after user logs in.
 */
export async function initEventService(): Promise<void> {
  try {
    currentUser = await getUserInfo(false);
    console.log('[EventService] init => user:', currentUser?.email);
  } catch (err) {
    console.error('[EventService] Could not get user info:', err);
  }
}

async function getCurrentUser(): Promise<UserInfo | null> {
  if (!currentUser) {
    try {
      currentUser = await getUserInfo(false);
    } catch (err) {
      console.error('[EventService] getUserInfo error:', err);
    }
  }
  return currentUser;
}

/**
 * Generic API sender with up to 3 retries
 */
async function sendToAPI(endpoint: string, body: any, attempt = 0): Promise<Response> {
  const maxAttempts = 3;
  try {
    const resp = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
    }
    return resp;
  } catch (error) {
    console.error(`[EventService] sendToAPI error (attempt ${attempt + 1}):`, error);
    if (attempt < maxAttempts - 1) {
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      return sendToAPI(endpoint, body, attempt + 1);
    }
    throw error;
  }
}

/**
 * Real-time content extraction event.
 */
export async function sendContentEvent(event: ContentEvent): Promise<void> {
  const user = await getCurrentUser();
  try {
    let sessionId = event.sessionId;
    if (!sessionId) {
      // Optionally load session ID from Dexie
      const { getCurrentSessionId } = await import('../utils/dexieSessionManager');
      const numSessionId = await getCurrentSessionId();
      sessionId = numSessionId ? String(numSessionId) : null;
    }

    if (!sessionId) {
      console.warn('[EventService] No active session, skipping content event');
      return;
    }

    const payload = {
      contentId: `content_${event.pageId}_${event.visitId}_${Date.now()}`,
      sessionId: String(sessionId),
      userId: user?.id,
      timestamp: Date.now(),
      data: {
        pageId: event.pageId,
        visitId: event.visitId,
        userId: user?.id,
        url: event.url,
        content: {
          title: event.title,
          markdown: event.markdown,
          metadata: event.metadata || { language: 'en' }
        }
      }
    };

    await sendToAPI(ENDPOINTS.CONTENT, payload);
    console.log('[EventService] Content event sent successfully');
  } catch (err) {
    console.error('[EventService] Failed to send content event:', err);
  }
}

/**
 * For cold storage sync only — do not call during normal browsing
 */
export async function sendSessionEvent(event: SessionEvent): Promise<void> {
  const user = await getCurrentUser();
  const payload = {
    userId: user?.id,
    sessionId: event.sessionId,
    operation: event.operation,
    timestamp: Date.now(),
    startTime: event.startTime,
    endTime: event.endTime,
    data: event.data
  };
  try {
    await sendToAPI(ENDPOINTS.COLD_STORAGE.SESSIONS, payload);
    console.log('[EventService] Session event sent:', event.operation);
  } catch (err) {
    console.error('[EventService] sendSessionEvent error:', err);
  }
}

/**
 * For cold storage sync only — do not call during normal browsing
 */
export async function sendVisitEvent(event: VisitEvent): Promise<void> {
  const user = await getCurrentUser();
  const payload = {
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
  };
  try {
    await sendToAPI(ENDPOINTS.COLD_STORAGE.VISITS, payload);
    console.log('[EventService] Visit event sent:', event.operation);
  } catch (err) {
    console.error('[EventService] sendVisitEvent error:', err);
  }
}

/**
 * Example function to log search click locally for later sync
 */
export async function trackSearchClick(
  searchSessionId: string,
  pageId: string,
  position: number,
  url: string,
  query: string
): Promise<void> {
  try {
    const { logEvent } = await import('../utils/dexieEventLogger');
    const { EventType } = await import('../api/types');
    const { getCurrentSessionId } = await import('../utils/dexieSessionManager');

    const sessionId = await getCurrentSessionId();
    if (!sessionId) {
      console.error('[EventService] No active session for trackSearchClick');
      return;
    }

    const timestamp = Date.now();
    await logEvent({
      operation: EventType.SEARCH_CLICK,
      sessionId: String(sessionId),
      timestamp,
      data: { searchSessionId, pageId, position, url, query }
    });
    console.log('[EventService] Search click logged locally');
  } catch (err) {
    console.error('[EventService] trackSearchClick error:', err);
  }
}