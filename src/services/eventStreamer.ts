// src/services/eventStreamer.ts

import { DoryEvent, EventType } from '../api/types';
import { sendEvent } from '../api/client';
import { getUserInfo, UserInfo } from './auth';

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
  // Add user info if available
  if (currentUser) {
    event.userId = currentUser.id;
    event.userEmail = currentUser.email;
  }
  
  await sendEvent(event);
}

// Event type constants for convenience
export const EventTypes = EventType; 