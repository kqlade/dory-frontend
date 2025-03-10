// src/services/eventStreamer.ts

import { DoryEvent, EventType } from '../api/types';
import { sendEvent } from '../api/client';
import { getUserInfo, UserInfo } from '../auth/googleAuth';

// Re-export event types for convenience
export { EventType };

// Export the DoryEvent interface
export type { DoryEvent };

// Keep track of current user
let currentUser: UserInfo | null = null;

/**
 * Initialize event streaming and auth
 */
export async function initEventStreaming(): Promise<void> {
  // Get user info on startup
  currentUser = await getUserInfo();
}

/**
 * Send a DORY event to the backend
 * This function now uses the API client and includes user info
 */
export async function sendDoryEvent(event: DoryEvent): Promise<void> {
  // If no current user, try to get user info first
  if (!currentUser) {
    try {
      currentUser = await getUserInfo();
    } catch (error) {
      console.error('[EventStreamer] Failed to get user info:', error);
      // Continue anyway, but log the error
    }
  }
  
  // Add user info if available
  if (currentUser) {
    event.userId = currentUser.id;
    event.userEmail = currentUser.email;
  } else {
    // If user info is still not available, use fallback values to prevent API errors
    // These should be replaced with actual values in a production environment
    event.userId = event.userId || 'anonymous-user';
    event.userEmail = event.userEmail || 'anonymous@example.com';
    console.warn('[EventStreamer] Using fallback user values for event:', event.operation);
  }
  
  await sendEvent(event);
}

// Event type constants for convenience
export const EventTypes = EventType; 