/**
 * Dexie-based Event Logger
 * 
 * This file provides functionality to log events to the Dexie.js database
 * instead of sending them to an API.
 */

import * as dexieDb from './dexieDB';
import { DoryEvent as ApiDoryEvent } from '../api/types';

// Extend the API event type with our database-specific fields
interface DexieDoryEvent extends ApiDoryEvent {
  eventId?: number;
  loggedAt: number;
}

/**
 * Log an event to the database
 * @param event The event to log
 */
export async function logEvent(event: ApiDoryEvent): Promise<void> {
  try {
    const db = dexieDb.getDB();
    
    // Convert API event to Dexie event with loggedAt timestamp
    const dexieEvent: DexieDoryEvent = {
      ...event,
      loggedAt: Date.now()
    };
    
    // Store the event in the database
    await db.events.add(dexieEvent);
    
    // Log to console for debugging
    console.log(`[DexieLogger] Event logged: ${event.operation}`, {
      sessionId: event.sessionId,
      timestamp: new Date(event.timestamp).toISOString()
    });
  } catch (error) {
    console.error('[DexieLogger] Error logging event:', error, event);
  }
}

/**
 * Get events from the database
 * @param sessionId Optional session ID to filter by
 * @param operation Optional operation type to filter by
 * @param limit Maximum number of events to return
 * @returns An array of events
 */
export async function getEvents(
  sessionId?: string,
  operation?: string,
  limit: number = 100
): Promise<DexieDoryEvent[]> {
  const db = dexieDb.getDB();
  
  let collection = db.events.orderBy('timestamp').reverse();
  
  // Apply filters if provided
  if (sessionId) {
    collection = collection.filter(event => event.sessionId === sessionId);
  }
  
  if (operation) {
    collection = collection.filter(event => event.operation === operation);
  }
  
  // Return limited results
  return await collection.limit(limit).toArray();
}

/**
 * Get a count of events by operation type
 * @returns Record with counts by operation type
 */
export async function getEventCounts(): Promise<Record<string, number>> {
  const db = dexieDb.getDB();
  const allEvents = await db.events.toArray();
  
  const counts: Record<string, number> = {};
  
  for (const event of allEvents) {
    const op = event.operation;
    counts[op] = (counts[op] || 0) + 1;
  }
  
  return counts;
}

/**
 * Clear all events from the database
 */
export async function clearEvents(): Promise<void> {
  const db = dexieDb.getDB();
  await db.events.clear();
}

export default {
  logEvent,
  getEvents,
  getEventCounts,
  clearEvents
}; 