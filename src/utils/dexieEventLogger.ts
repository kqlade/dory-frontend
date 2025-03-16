/**
 * @file dexieEventLogger.ts
 * 
 * Dexie-based Event Logger
 * Logs events to Dexie (later synced to the backend via cold storage).
 */

import * as dexieDb from '../db/dexieDB';
import { DoryEvent } from '../api/types';

// Extend the API event type with database-specific fields
interface DexieDoryEvent extends DoryEvent {
  eventId?: number;
  loggedAt: number;
}

/**
 * Service worker safe method to get user ID from storage directly
 */
async function getUserIdFromStorage(): Promise<string | undefined> {
  try {
    const data = await chrome.storage.local.get(['user']);
    return data.user?.id || undefined;
  } catch (error) {
    console.error('[EventLogger] Error getting user ID from storage:', error);
    return undefined;
  }
}

/**
 * Log a dory event to Dexie storage. Events are synced later to the backend.
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

    // If userId is missing, get from storage
    event.userId = await getUserIdFromStorage();

    const dexieEvent: DexieDoryEvent = {
      ...event,
      loggedAt: Date.now()
    };

    console.debug('[DexieLogger] Storing event =>', {
      operation: dexieEvent.operation,
      sessionId: dexieEvent.sessionId,
      timestamp: dexieEvent.timestamp,
      loggedAt: dexieEvent.loggedAt
    });

    await db.events.add(dexieEvent);
    console.log(`[DexieLogger] Event logged: ${event.operation}`, {
      sessionId: event.sessionId,
      timestamp: new Date(event.timestamp).toISOString(),
    });
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