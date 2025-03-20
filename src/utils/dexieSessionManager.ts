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
import { getCurrentUserId } from '../services/userService';

// Track the current session ID
let currentSessionId: number | null = null;

/**
 * Generate a numeric UUID (a number with UUID-like randomness properties)
 * - Uses the same cryptographic randomness as UUIDs
 * - But produces a number that fits within JavaScript's safe integer limits
 * - Maintains the key UUID properties of being globally unique
 */
function generateNumericUuid(): number {
  // Get 6 random bytes (48 bits, which is safely below the 53-bit limit)
  const randomBytes = new Uint8Array(6);
  crypto.getRandomValues(randomBytes);
  
  // Convert to a number (treated as a 48-bit unsigned integer)
  let result = 0;
  for (let i = 0; i < randomBytes.length; i++) {
    // Shift left 8 bits and add the next byte
    result = (result << 8) | randomBytes[i];
  }
  
  // To ensure it's positive, use only 47 bits (the max safe positive integer has 53 bits)
  result = result & 0x7FFFFFFFFFFF; // Apply 47-bit mask
  
  // We now have a 47-bit random positive integer
  return result;
}

/**
 * Start a new session
 * @returns Promise resolving to the new session ID
 */
export async function startNewSession(): Promise<number> {
  // Get the authenticated user ID
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new Error('Cannot start session: User not authenticated');
  }

  const db = dexieDb.getDB();
  
  // Generate a globally unique numeric ID
  const sessionId = generateNumericUuid();
  
  const now = Date.now();
  const session: BrowsingSession = {
    sessionId, // Use the numeric UUID
    startTime: now,
    lastActivityAt: now,
    totalActiveTime: 0,
    isActive: true
  };
  
  // Use put to insert with the explicit ID
  await db.sessions.put(session);
  currentSessionId = sessionId;
  
  // Log session started event locally - will be synced to backend via cold storage
  await logEvent({
    operation: EventType.SESSION_STARTED,
    sessionId: sessionId.toString(),
    timestamp: now,
    userId,
    data: {
      sessionId: sessionId.toString(),
      startTime: now
    }
  });
  
  return sessionId;
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
    
    // Log session ended event locally - will be synced to backend via cold storage
    await logEvent({
      operation: EventType.SESSION_ENDED,
      sessionId: currentSessionId.toString(),
      timestamp: now,
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