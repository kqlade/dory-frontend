/**
 * @file EventRepository.ts
 * 
 * Repository for working with event records in the database.
 * Events represent user actions, system operations, and other notable occurrences.
 */

import { DatabaseManager } from '../DatabaseCore';
import { EventRecord } from '../../types';
import { generateEventId } from '../../utils/idGenerator';

/**
 * Enum of standard event types
 * This can be extended as needed for new event types
 */
export enum EventType {
  // Session events
  SESSION_STARTED = 'session_started',
  SESSION_ENDED = 'session_ended',
  
  // Page events
  PAGE_VISITED = 'page_visited',
  CONTENT_EXTRACTED = 'content_extracted',
  
  // User actions
  SEARCH_PERFORMED = 'search_performed',
  SEARCH_RESULT_CLICKED = 'search_result_clicked',
  
  // System events
  SYNC_STARTED = 'sync_started',
  SYNC_COMPLETED = 'sync_completed',
  SYNC_FAILED = 'sync_failed',
  
  // Auth events
  USER_LOGGED_IN = 'user_logged_in',
  USER_LOGGED_OUT = 'user_logged_out'
}

/**
 * Repository for managing event records in the database
 */
export class EventRepository {
  /**
   * Log an event to the database
   * @param operation The type of event/operation
   * @param sessionId The session ID associated with the event
   * @param data Additional data for the event
   * @param userId Optional user ID
   * @param userEmail Optional user email
   * @returns The event ID
   */
  async logEvent(
    operation: string,
    sessionId: string,
    data: any = {},
    userId?: string,
    userEmail?: string
  ): Promise<number> {
    const db = DatabaseManager.getCurrentDatabase();
    if (!db) throw new Error('No active database');
    
    if (!operation || !sessionId) {
      throw new Error('Operation and session ID are required for logging events');
    }
    
    const now = Date.now();
    const eventId = generateEventId();
    
    try {
      // Create the event record
      await db.events.add({
        eventId,
        operation,
        sessionId,
        userId,
        userEmail,
        timestamp: now,
        data,
        loggedAt: now
      });
      
      // For certain events, we might want to perform additional actions
      // For example, sync to backend for important events
      if (this.shouldTriggerBackendSync(operation)) {
        // Queue for background sync (placeholder - would be implemented elsewhere)
        console.log(`[EventRepository] Event ${eventId} (${operation}) queued for sync`);
      }
      
      return eventId;
    } catch (error) {
      console.error(`[EventRepository] Error logging event (${operation}):`, error);
      throw error;
    }
  }
  
  /**
   * Helper method to determine if an event should trigger backend sync
   * This can be customized based on which events need immediate syncing
   */
  private shouldTriggerBackendSync(operation: string): boolean {
    const highPriorityEvents = [
      EventType.USER_LOGGED_IN,
      EventType.USER_LOGGED_OUT,
      EventType.SEARCH_PERFORMED,
      EventType.SEARCH_RESULT_CLICKED
    ];
    
    return highPriorityEvents.includes(operation as EventType);
  }
  
  /**
   * Get events by session ID
   * @param sessionId The session ID
   * @param limit Maximum number of events to return
   * @returns Array of events for the session
   */
  async getEventsBySession(sessionId: string, limit = 100): Promise<EventRecord[]> {
    const db = DatabaseManager.getCurrentDatabase();
    if (!db) throw new Error('No active database');
    
    return db.events
      .where('sessionId')
      .equals(sessionId)
      .limit(limit)
      .toArray();
  }
  
  /**
   * Get events by type/operation
   * @param operation The event type/operation
   * @param limit Maximum number of events to return
   * @returns Array of events of the specified type
   */
  async getEventsByType(operation: string, limit = 100): Promise<EventRecord[]> {
    const db = DatabaseManager.getCurrentDatabase();
    if (!db) throw new Error('No active database');
    
    return db.events
      .where('operation')
      .equals(operation)
      .limit(limit)
      .toArray();
  }
  
  /**
   * Get recent events, optionally filtered by operation
   * @param limit Maximum number of events to return
   * @param operation Optional operation type to filter by
   * @returns Array of recent events
   */
  async getRecentEvents(limit = 100, operation?: string): Promise<EventRecord[]> {
    const db = DatabaseManager.getCurrentDatabase();
    if (!db) throw new Error('No active database');
    
    // Build query based on whether we're filtering by operation
    let collection = db.events.orderBy('timestamp').reverse();
    
    if (operation) {
      collection = collection.filter(event => event.operation === operation);
    }
    
    return collection.limit(limit).toArray();
  }
  
  /**
   * Get counts of events by operation type
   * @returns Object with counts keyed by operation type
   */
  async getEventCounts(): Promise<Record<string, number>> {
    const db = DatabaseManager.getCurrentDatabase();
    if (!db) throw new Error('No active database');
    
    const events = await db.events.toArray();
    
    // Use reduce to count events by operation
    return events.reduce((counts: Record<string, number>, event) => {
      const op = event.operation;
      counts[op] = (counts[op] || 0) + 1;
      return counts;
    }, {});
  }
  
  /**
   * Clear all events from the database
   * Use with caution - primarily for testing/development
   */
  async clearAllEvents(): Promise<void> {
    const db = DatabaseManager.getCurrentDatabase();
    if (!db) throw new Error('No active database');
    
    await db.events.clear();
    console.log('[EventRepository] All events have been cleared');
  }
  
  /**
   * Get events that have not been synced to the backend
   * This could be used by a cold storage sync service
   * @param limit Maximum number of events to return
   * @returns Array of unsynced events
   */
  async getUnsyncedEvents(limit = 500): Promise<EventRecord[]> {
    const db = DatabaseManager.getCurrentDatabase();
    if (!db) throw new Error('No active database');
    
    // This assumes events would have a 'synced' flag in their data
    // You might need to adjust based on your actual sync tracking mechanism
    return db.events
      .filter(event => !event.data?.synced)
      .limit(limit)
      .toArray();
  }
  
  /**
   * Mark events as synced
   * @param eventIds Array of event IDs that have been synced
   */
  async markEventsSynced(eventIds: number[]): Promise<void> {
    const db = DatabaseManager.getCurrentDatabase();
    if (!db) throw new Error('No active database');
    
    // For each event ID, update the synced status
    for (const eventId of eventIds) {
      try {
        const event = await db.events.get(eventId);
        if (event) {
          // Update the data field to include synced: true
          const updatedData = { ...event.data, synced: true };
          await db.events.update(eventId, { data: updatedData });
        }
      } catch (error) {
        console.error(`[EventRepository] Error marking event ${eventId} as synced:`, error);
        // Continue with other events even if one fails
      }
    }
  }
  
  /**
   * Get the total count of event records
   * @returns Count of event records
   */
  async getCount(): Promise<number> {
    const db = DatabaseManager.getCurrentDatabase();
    if (!db) throw new Error('No active database');
    
    return db.events.count();
  }
  
  /**
   * Get events of a specific type that occurred after a timestamp
   * @param eventType The type of events to retrieve
   * @param timestamp The timestamp to filter events after
   * @returns Array of matching event records
   */
  async getEventsByTypeAfterTime(eventType: EventType, timestamp: number): Promise<EventRecord[]> {
    const db = DatabaseManager.getCurrentDatabase();
    if (!db) throw new Error('No active database');
    
    return db.events
      .where('operation')
      .equals(eventType)
      .and(e => e.timestamp > timestamp)
      .toArray();
  }
}

// Create and export a singleton instance
export const eventRepository = new EventRepository();

// Default export for convenience
export default EventRepository;
