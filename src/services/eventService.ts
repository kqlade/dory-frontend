// src/services/eventService.ts
import { API_BASE_URL, ENDPOINTS } from '../config';

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

// Simple user type without auth dependency
export interface User {
  id: string;
  email: string;
  name?: string;
  picture?: string;
}

/**
 * Initialize the event service
 */
export async function initEventService(): Promise<void> {
  try {
    console.log('[EventService] Event service initialized');
  } catch (err) {
    console.error('[EventService] Initialization error:', err);
  }
}

/**
 * Get the authenticated user
 */
async function getUser(): Promise<User> {
  try {
    // Direct storage access, no imports that might trigger DOM-dependent code
    const data = await chrome.storage.local.get(['user']);
    
    if (!data.user || !data.user.id) {
      throw new Error('User authentication required');
    }
    
    return {
      id: data.user.id,
      email: data.user.email || 'unknown@example.com',
      name: data.user.name,
      picture: data.user.picture
    };
  } catch (error) {
    console.error('[EventService] Authentication error:', error);
    throw new Error('User authentication required');
  }
}

/**
 * Generic API sender with up to 3 retries
 */
async function sendToAPI(endpoint: string, body: any, attempt = 0): Promise<Response> {
  const maxAttempts = 3;
  try {
    // Get the auth token from storage
    const storage = await chrome.storage.local.get(['auth_token']);
    const authToken = storage.auth_token;
    
    // Prepare headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    
    // Include auth token if available
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }
    
    const resp = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers,
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
  const user = await getUser();
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