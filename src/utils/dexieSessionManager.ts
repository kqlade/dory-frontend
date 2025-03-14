/**
 * Dexie-based Session Manager
 * 
 * This file provides the same API as the original sessionManager.ts
 * but uses Dexie.js for local storage only.
 * Events are NOT sent directly to the backend - they are synced later via cold storage.
 */

import * as dexieDb from '../db/dexieDB';
import { BrowsingSession } from '../db/dexieDB';
import { logEvent } from './dexieEventLogger';
import { EventType } from '../api/types';
import { getCurrentUser } from '../services/authService';

// Track the current session ID
let currentSessionId: number | null = null;

/**
 * Start a new session
 * @returns Promise resolving to the new session ID
 */
export async function startNewSession(): Promise<number> {
  const db = dexieDb.getDB();
  
  const now = Date.now();
  const session: BrowsingSession = {
    startTime: now,
    lastActivityAt: now,
    totalActiveTime: 0,
    isActive: true
  };
  
  const id = await db.sessions.add(session);
  currentSessionId = id;
  
  // Get user info for the event
  const userInfo = await getCurrentUser();
  
  // Log session started event locally - will be synced to backend via cold storage
  await logEvent({
    operation: EventType.SESSION_STARTED,
    sessionId: id.toString(),
    timestamp: Math.floor(now),
    userId: userInfo?.id,
    userEmail: userInfo?.email,
    data: {
      sessionId: id.toString(),
      startTime: now
    }
  });
  
  return currentSessionId;
}

/**
 * End the current session
 */
export async function endCurrentSession(): Promise<void> {
  if (!currentSessionId) return;
  
  const db = dexieDb.getDB();
  
  const session = await db.sessions.get(currentSessionId);
  if (session) {
    const now = Date.now();
    
    // Update the session record
    await db.sessions.update(currentSessionId, {
      endTime: now,
      isActive: false
    });
    
    // Get count of pages visited
    let pagesVisited = 0;
    try {
      const visits = await db.visits
        .where('sessionId')
        .equals(currentSessionId)
        .toArray();
      
      pagesVisited = visits.length;
    } catch (e) {
      console.error('Error getting page visit count:', e);
    }
    
    // Get user info for the event
    const userInfo = await getCurrentUser();
    
    // Log session ended event locally - will be synced to backend via cold storage
    await logEvent({
      operation: EventType.SESSION_ENDED,
      sessionId: currentSessionId.toString(),
      timestamp: now,
      userId: userInfo?.id,
      userEmail: userInfo?.email,
      data: {
        totalDuration: now - session.startTime,
        pagesVisited: pagesVisited
      }
    });
  }
  
  currentSessionId = null;
}

/**
 * Get the current session ID
 * @returns The current session ID or null
 */
export function getCurrentSessionId(): number | null {
  return currentSessionId;
}

/**
 * Update the session's last activity time
 */
export async function updateSessionActivityTime(): Promise<void> {
  if (!currentSessionId) return;
  
  const db = dexieDb.getDB();
  
  const session = await db.sessions.get(currentSessionId);
  if (session) {
    await db.sessions.update(currentSessionId, {
      lastActivityAt: Date.now()
    });
  }
}

/**
 * Check if the current session is idle
 * @param thresholdMs The idle threshold in milliseconds
 * @returns Whether the session was ended due to idleness
 */
export async function checkSessionIdle(thresholdMs: number): Promise<boolean> {
  if (!currentSessionId) return false;
  
  const db = dexieDb.getDB();
  const session = await db.sessions.get(currentSessionId);
  if (!session) return false;
  
  const now = Date.now();
  if (now - session.lastActivityAt >= thresholdMs) {
    await endCurrentSession();
    return true;
  }
  
  return false;
} 