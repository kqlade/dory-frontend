/**
 * Dexie-based Event Streamer
 * 
 * This file provides a replacement for the API-based event streamer
 * that stores events in the local Dexie.js database.
 */

import { DoryEvent, EventType } from '../api/types';
import { logEvent } from './dexieEventLogger';
import { getUserInfo, UserInfo } from '../auth/googleAuth';

// Re-export event types for convenience
export { EventType };

// Keep track of current user
let currentUser: UserInfo | null = null;

/**
 * Initialize event streaming and auth
 */
export async function initEventStreaming(): Promise<void> {
  // Get user info on startup
  currentUser = await getUserInfo();
  
  console.log('[DexieEventStreamer] Initialized', 
    currentUser ? `for user: ${currentUser.email}` : 'without user');
}

/**
 * Send a DORY event to the database instead of the backend
 */
export async function sendDoryEvent(event: DoryEvent): Promise<void> {
  // If no current user, try to get user info first
  if (!currentUser) {
    try {
      currentUser = await getUserInfo();
    } catch (error) {
      console.error('[DexieEventStreamer] Failed to get user info:', error);
      // Continue anyway, but log the error
    }
  }
  
  // Add user info if available
  if (currentUser) {
    event.userId = currentUser.id;
    event.userEmail = currentUser.email;
  } else {
    // If user info is still not available, use fallback values to prevent errors
    event.userId = event.userId || 'anonymous-user';
    event.userEmail = event.userEmail || 'anonymous@example.com';
    console.warn('[DexieEventStreamer] Using fallback user values for event:', event.operation);
  }
  
  // Store event in Dexie.js database instead of sending to API
  await logEvent(event);
}

// Event type constants for convenience
export const EventTypes = EventType;

export default {
  initEventStreaming,
  sendDoryEvent,
  EventTypes
}; 