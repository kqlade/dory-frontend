/**
 * @file eventService.ts
 * 
 * Service for tracking and reporting user events.
 * Uses the repository pattern for database access and clean architecture principles.
 */

import { authService } from './authService';
import { eventRepository, sessionRepository, EventType } from '../db/repositories';
import { isDatabaseInitialized } from '../db/DatabaseCore'; // Import checker

/**
 * Track a search result click event
 * 
 * @param searchSessionId Unique ID for the search session
 * @param pageId ID of the clicked page
 * @param position Position of the result in the list (0-based)
 * @param url URL of the clicked result
 * @param query Search query that produced the result
 * @returns Promise resolving when the event is logged
 */
export async function trackSearchClick(
  searchSessionId: string,
  pageId: string,
  position: number,
  url: string,
  query: string
): Promise<number> {
  try {
    // Verify user is authenticated first
    const authState = await authService.getAuthState();
    if (!authState.isAuthenticated) {
      console.error('[EventService] User not authenticated for trackSearchClick');
      throw new Error('Authentication required');
    }
    
    // Check if database is properly initialized
    if (!isDatabaseInitialized()) {
      console.error('[EventService] Database not initialized for trackSearchClick');
      throw new Error('Database not initialized');
    }
    
    // Get the current session ID
    const sessionId = sessionRepository.getCurrentSessionId();
    if (!sessionId) {
      console.error('[EventService] No active session for trackSearchClick');
      throw new Error('No active session');
    }
    
    // Get the session details
    const session = await sessionRepository.getSession(sessionId);
    if (!session) {
      console.error('[EventService] Could not retrieve session details');
      throw new Error('Session details not found');
    }

    // Use authenticated user info
    const userId = authState.user?.id;
    const userEmail = authState.user?.email;

    // Log the event
    const eventId = await eventRepository.logEvent(
      EventType.SEARCH_RESULT_CLICKED, 
      String(sessionId),
      { 
        searchSessionId, 
        pageId, 
        position, 
        url, 
        query,
        timestamp: Date.now() 
      },
      userId,
      userEmail
    );

    console.log('[EventService] Search click logged:', {
      eventId,
      pageId,
      position,
      query: query.substring(0, 15) + (query.length > 15 ? '...' : '')
    });

    return eventId;
  } catch (error) {
    console.error('[EventService] trackSearchClick error:', error);
    // Propagate authentication and initialization errors
    if (error instanceof Error && 
        (error.message === 'Authentication required' || 
         error.message === 'Database not initialized')) {
      throw error;
    }
    // For other errors, rethrow
    throw error;
  }
}

/**
 * Track that a user performed a search.
 * Assumes session and DB are already initialized.
 */
export async function trackSearchPerformed(
  query: string,
  resultCount: number,
  searchType: 'local' | 'semantic' | 'hybrid' = 'local'
): Promise<{ searchSessionId: string }> {
  
  // Generate a unique search session ID regardless of logging success
  const searchSessionId = `search_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;

  try {
    // 1. Check prerequisites: Auth and DB Initialization
    const authState = authService.getAuthState(); // Use sync getter after init
    if (!authState.isAuthenticated) {
      console.warn('[EventService] trackSearchPerformed: User not authenticated. Event dropped.');
      return { searchSessionId }; // Return ID but don't log
    }
    if (!isDatabaseInitialized()) {
      console.warn('[EventService] trackSearchPerformed: Database not initialized. Event dropped.');
      return { searchSessionId }; // Return ID but don't log
    }

    // 2. Get current session (should exist if DB is initialized)
    const sessionId = sessionRepository.getCurrentSessionId();
    if (!sessionId) {
      // This indicates a logic error elsewhere if DB is initialized but session isn't
      console.error('[EventService] trackSearchPerformed: No active session found despite DB being initialized. Event dropped.');
      return { searchSessionId }; // Return ID but don't log
    }

    // 3. Log the event
    const userId = authState.user?.id;
    const userEmail = authState.user?.email;

    const eventId = await eventRepository.logEvent( // logEvent should have its own DB check
      EventType.SEARCH_PERFORMED,
      String(sessionId), // Ensure it's a string if needed by logEvent
      {
        searchSessionId,
        query,
        resultCount,
        searchType,
        timestamp: Date.now()
      },
      userId,
      userEmail
    );

    console.log('[EventService] Search performed logged:', { eventId, searchSessionId, query: query.substring(0, 15) + '...', resultCount, searchType });
    return { searchSessionId };

  } catch (error) {
    // Catch errors from logEvent (e.g., Dexie errors)
    console.error('[EventService] trackSearchPerformed error during logging:', error);
    // Return the generated searchSessionId even if logging fails
    return { searchSessionId };
  }
}

/**
 * Class to represent the EventService with all event-related functions
 * This allows for easier mocking and dependency injection
 */
class EventService {
    trackSearchClick = trackSearchClick; // Needs similar readiness checks
    trackSearchPerformed = trackSearchPerformed;
}

// Create and export a singleton instance
export const eventService = new EventService();

// Default export for convenience
export default eventService;
