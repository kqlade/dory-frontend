// src/services/sessionManager.ts

import { IDBPDatabase } from 'idb';
import { getDB } from './browsingStore';
import { sendDoryEvent, EventTypes } from './eventStreamer';

interface BrowsingSession {
  sessionId?: number;
  startTime: number;
  endTime?: number;
  lastActivityAt: number;
  totalActiveTime: number; // cumulative across all pages in the session
  isActive: boolean;       // indicates whether the session is still ongoing
}

let currentSessionId: number | null = null;

/** Start a new session */
export async function startNewSession(): Promise<number> {
  const db = await getDB();
  const tx = db.transaction('sessions', 'readwrite');
  const store = tx.objectStore('sessions');

  const now = Date.now();
  const session: BrowsingSession = {
    startTime: now,
    lastActivityAt: now,
    totalActiveTime: 0,
    isActive: true
  };
  const id = await store.add(session);
  currentSessionId = id as number;

  await tx.done;
  
  // Send session started event
  sendDoryEvent({
    operation: EventTypes.SESSION_STARTED,
    sessionId: currentSessionId.toString(),
    timestamp: now,
    data: {
      browser: {
        name: navigator.userAgent.includes('Chrome') ? 'Chrome' : 
              navigator.userAgent.includes('Firefox') ? 'Firefox' : 'Other',
        platform: navigator.platform
      }
    }
  });
  
  return currentSessionId!;
}

/** End the current session */
export async function endCurrentSession(): Promise<void> {
  if (!currentSessionId) return;
  const db = await getDB();
  const tx = db.transaction('sessions', 'readwrite');
  const store = tx.objectStore('sessions');

  const session = await store.get(currentSessionId);
  if (session) {
    const now = Date.now();
    session.endTime = now;
    session.isActive = false;
    await store.put(session);
    
    // Send session ended event
    sendDoryEvent({
      operation: EventTypes.SESSION_ENDED,
      sessionId: currentSessionId.toString(),
      timestamp: now,
      data: {
        totalActiveTime: session.totalActiveTime,
        duration: now - session.startTime
      }
    });
  }
  await tx.done;
  currentSessionId = null;
}

/** Gets current session ID */
export function getCurrentSessionId(): number | null {
  return currentSessionId;
}

/**
 * Called whenever we record new activity. If no currentSessionId, we do nothing
 * here (the background script might start one). If we do have a session, update its lastActivityAt.
 */
export async function updateSessionActivityTime(): Promise<void> {
  if (!currentSessionId) return;
  const db = await getDB();
  const tx = db.transaction('sessions', 'readwrite');
  const store = tx.objectStore('sessions');

  const session = await store.get(currentSessionId);
  if (session) {
    session.lastActivityAt = Date.now();
    await store.put(session);
  }

  await tx.done;
}

/** 
 * Check if the current session is idle for longer than threshold => end it if so. 
 * Returns true if the session was ended, else false. 
 */
export async function checkSessionIdle(thresholdMs: number): Promise<boolean> {
  if (!currentSessionId) return false;
  const db = await getDB();
  const session = await db.transaction('sessions').objectStore('sessions').get(currentSessionId);
  if (!session) return false;

  const now = Date.now();
  if (now - session.lastActivityAt >= thresholdMs) {
    await endCurrentSession();
    return true;
  }
  return false;
}