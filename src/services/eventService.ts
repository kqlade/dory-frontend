/**
 * @file eventService.ts
 * 
 * Service for tracking and reporting user events.
 * Uses the repository pattern for database access and clean architecture principles.
 */

import { authService } from './authService';
import { eventRepository, sessionRepository, EventType } from '../db/repositories';

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

    // Get user ID if authenticated
    const authState = await authService.getAuthState();
    const userId = authState.isAuthenticated ? authState.user?.id : undefined;
    const userEmail = authState.isAuthenticated ? authState.user?.email : undefined;

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
    throw error;
  }
}

/**
 * Track that a user performed a search
 * 
 * @param query The search query
 * @param resultCount Number of results returned
 * @param searchType Type of search (local, semantic, hybrid)
 * @returns Promise resolving to the event ID
 */
export async function trackSearchPerformed(
  query: string,
  resultCount: number,
  searchType: 'local' | 'semantic' | 'hybrid' = 'local'
): Promise<number> {
  try {
    // Get the current session ID
    const sessionId = sessionRepository.getCurrentSessionId();
    if (!sessionId) {
      console.error('[EventService] No active session for trackSearchPerformed');
      throw new Error('No active session');
    }
    
    // Get the session details
    const session = await sessionRepository.getSession(sessionId);
    if (!session) {
      console.error('[EventService] Could not retrieve session details');
      throw new Error('Session details not found');
    }

    // Get user ID if authenticated
    const authState = await authService.getAuthState();
    const userId = authState.isAuthenticated ? authState.user?.id : undefined;
    const userEmail = authState.isAuthenticated ? authState.user?.email : undefined;

    // Generate a unique search session ID
    const searchSessionId = `search_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;

    // Log the event
    const eventId = await eventRepository.logEvent(
      EventType.SEARCH_PERFORMED,
      String(sessionId),
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

    console.log('[EventService] Search performed:', {
      eventId,
      query: query.substring(0, 15) + (query.length > 15 ? '...' : ''),
      resultCount,
      searchType
    });

    return eventId;
  } catch (error) {
    console.error('[EventService] trackSearchPerformed error:', error);
    throw error;
  }
}

/**
 * Class to represent the EventService with all event-related functions
 * This allows for easier mocking and dependency injection
 */
class EventService {
  /**
   * Track a search result click
   */
  trackSearchClick = trackSearchClick;
  
  /**
   * Track a search being performed
   */
  trackSearchPerformed = trackSearchPerformed;
}

// Create and export a singleton instance
export const eventService = new EventService();

// Default export for convenience
export default eventService;
