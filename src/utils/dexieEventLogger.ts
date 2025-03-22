/**
 * @file dexieEventLogger.ts
 * 
 * Dexie-based Event Logger
 * Logs events to Dexie (later synced to the backend via cold storage).
 */

import * as dexieDb from '../db/dexieDB';
import { DoryEvent } from '../api/types';
import { EventType } from '../api/types';
// Import the cold storage sync creator function
import { createColdStorageSyncer } from '../services/coldStorageSync';
import { getCurrentUserId } from '../services/userService';

// Minimum time between cold storage syncs (10 minutes)
const MIN_SYNC_INTERVAL_MS = 10 * 60 * 1000;
const LAST_SYNC_KEY = 'lastColdStorageSync';

// Extend the API event type with database-specific fields
interface DexieDoryEvent extends DoryEvent {
  eventId: number;  // Numeric UUID (not auto-increment)
  loggedAt: number;
}

/**
 * Generate a numeric UUID for event IDs
 */
function generateEventUuid(): number {
  // Get 6 random bytes (48 bits of randomness)
  const randomBytes = new Uint8Array(6);
  crypto.getRandomValues(randomBytes);
  
  // Convert to a numeric value (as a safe JavaScript integer)
  let value = 0;
  for (let i = 0; i < randomBytes.length; i++) {
    value = (value << 8) | randomBytes[i];
  }
  
  // Mask to 47 bits to ensure it's a positive safe integer
  return value & 0x7FFFFFFFFFFF;
}

/**
 * Log a dory event to Dexie storage. Events are synced later to the backend.
 * For SESSION_ENDED events, also triggers a cold storage sync operation.
 */
export async function logEvent(event: DoryEvent): Promise<void> {
  try {
    if (!event.sessionId) {
      console.warn('[DexieLogger] Missing sessionId, skipping log:', event);
      return;
    }
    if (!event.operation) {
      console.warn('[DexieLogger] Missing operation, skipping log:', event);
      return;
    }

    const db = dexieDb.getDB();

    // Ensure sessionId is a string
    if (typeof event.sessionId !== 'string') {
      event.sessionId = String(event.sessionId);
    }
    // Ensure timestamp
    if (!event.timestamp || typeof event.timestamp !== 'number') {
      event.timestamp = Date.now();
    }

    // If userId is missing, get from centralized service
    if (!event.userId) {
      const userId = await getCurrentUserId();
      if (!userId) {
        console.warn('[DexieLogger] No authenticated user, skipping event:', event.operation);
        return;
      }
      event.userId = userId;
    }

    const dexieEvent: DexieDoryEvent = {
      ...event,
      eventId: generateEventUuid(),
      loggedAt: Date.now()
    };

    console.debug('[DexieLogger] Storing event =>', {
      operation: dexieEvent.operation,
      sessionId: dexieEvent.sessionId,
      timestamp: dexieEvent.timestamp,
      loggedAt: dexieEvent.loggedAt
    });

    await db.events.put(dexieEvent);
    console.log(`[DexieLogger] Event logged: ${event.operation}`, {
      sessionId: event.sessionId,
      timestamp: new Date(event.timestamp).toISOString(),
    });
    
    // If this is a session end event, check if we should trigger a cold storage sync
    if (event.operation === EventType.SESSION_ENDED) {
      try {
        // Check when the last sync occurred to implement rate limiting
        const store = await chrome.storage.local.get(LAST_SYNC_KEY);
        const lastSyncTime: number = store[LAST_SYNC_KEY] ?? 0;
        const now = Date.now();
        
        if (now - lastSyncTime > MIN_SYNC_INTERVAL_MS) {
          console.log('[DexieLogger] Session ended, triggering cold storage sync');
          // Use the creator function to create a syncer with 'session_end' source
          const sessionEndSyncer = createColdStorageSyncer('session_end');
          sessionEndSyncer.performSync().catch((err: Error) => {
            console.error('[DexieLogger] Sync after session end failed:', err);
          });
        } else {
          console.log('[DexieLogger] Session ended, but sync recently ran. Skipping.');
        }
      } catch (syncError) {
        console.error('[DexieLogger] Error checking sync status or triggering sync:', syncError);
      }
    }
  } catch (error) {
    console.error('[DexieLogger] Error logging event:', error, event);
  }
}

/**
 * Retrieve events from Dexie, optionally filtered by sessionId & operation, up to `limit`.
 */
export async function getEvents(
  sessionId?: string,
  operation?: string,
  limit: number = 100
): Promise<DexieDoryEvent[]> {
  const db = dexieDb.getDB();
  let coll = db.events.orderBy('timestamp').reverse();

  if (sessionId) {
    coll = coll.filter(e => e.sessionId === sessionId);
  }
  if (operation) {
    coll = coll.filter(e => e.operation === operation);
  }

  return coll.limit(limit).toArray();
}

/**
 * Get a count of events by operation.
 */
export async function getEventCounts(): Promise<Record<string, number>> {
  const db = dexieDb.getDB();
  const all = await db.events.toArray();
  const counts: Record<string, number> = {};

  for (const evt of all) {
    counts[evt.operation] = (counts[evt.operation] || 0) + 1;
  }
  return counts;
}

/**
 * Clear all events in Dexie (careful with usage).
 */
export async function clearEvents(): Promise<void> {
  const db = dexieDb.getDB();
  await db.events.clear();
  console.log('[DexieLogger] All events cleared');
}

export default {
  logEvent,
  getEvents,
  getEventCounts,
  clearEvents
};