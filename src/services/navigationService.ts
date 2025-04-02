/**
 * @file navigationService.ts
 * 
 * Service responsible for tracking user navigation and building the knowledge graph.
 * Handles page records, visits, and navigation edges.
 */

import { pageRepository, sessionRepository, edgeRepository, visitRepository } from '../db/repositories';

// Constants
const SESSION_IDLE_THRESHOLD = 15 * 60 * 1000; // 15 minutes in milliseconds
let isStartingSession = false; // Flag to prevent concurrent session creation

/**
 * Create or get a page record for a URL
 */
export async function createOrGetPage(
  url: string, 
  title: string, 
  timestamp: number
): Promise<string> {
  try {
    // First check if page exists
    const existingPage = await pageRepository.getByUrl(url);
    
    if (existingPage) {
      // Update last visit time and title if changed
      if (existingPage.title !== title || existingPage.lastVisit < timestamp) {
        // Use createOrUpdate which will update the existing page
        await pageRepository.createOrUpdate(url, title, timestamp);
      }
      
      return existingPage.pageId;
    }
    
    // Create new page if it doesn't exist
    const pageId = await pageRepository.createOrUpdate(url, title, timestamp);
    
    console.log(`[NavigationService] Created new page: ${pageId} - ${url}`);
    return pageId;
  } catch (error) {
    console.error(`[NavigationService] Error creating/getting page for ${url}:`, error);
    throw error;
  }
}

/**
 * Start a new visit to a page
 */
export async function startVisit(
  pageId: string,
  sessionId: string,
  fromPageId?: string,
  isBackNavigation?: boolean
): Promise<string> {
  try {
    // Create visit record using startVisit method in repository
    const visitId = await visitRepository.startVisit(
      pageId,
      Number(sessionId), // Convert to number since repository expects sessionId as number
      fromPageId,
      isBackNavigation || false
    );
    
    // Update page visit count - this is now handled by createOrUpdate
    
    console.log(`[NavigationService] Started visit ${visitId} to page ${pageId}`);
    return visitId;
  } catch (error) {
    console.error(`[NavigationService] Error starting visit to page ${pageId}:`, error);
    throw error;
  }
}

/**
 * End a visit to a page
 */
export async function endVisit(visitId: string, timestamp: number): Promise<void> {
  try {
    // Get the visit to update
    const visit = await visitRepository.getVisit(visitId);
    if (!visit) {
      console.warn(`[NavigationService] Cannot end visit ${visitId}: not found`);
      return;
    }
    
    // Calculate time spent
    const timeSpent = timestamp - visit.startTime;
    
    // End the visit
    await visitRepository.endVisit(visitId, timestamp);
    
    // Update page total time
    await pageRepository.updateActiveTime(visit.pageId, timeSpent / 1000); // Convert ms to seconds
    
    console.log(`[NavigationService] Ended visit ${visitId} after ${timeSpent}ms`);
  } catch (error) {
    console.error(`[NavigationService] Error ending visit ${visitId}:`, error);
    throw error;
  }
}

/**
 * Get a visit by ID
 */
export async function getVisit(visitId: string): Promise<any | null> {
  try {
    return await visitRepository.getVisit(visitId);
  } catch (error) {
    console.error(`[NavigationService] Error getting visit ${visitId}:`, error);
    return null;
  }
}

/**
 * Create or update an edge between pages
 */
export async function createOrUpdateEdge(
  fromPageId: string,
  toPageId: string,
  sessionId: string,
  timestamp: number,
  isBackNavigation: boolean
): Promise<string> {
  try {
    // The EdgeRepository's createOrUpdate method handles both creation and updating
    // It checks if the edge exists and updates it, or creates a new one if needed
    const edgeId = await edgeRepository.createOrUpdate(
      fromPageId,
      toPageId,
      Number(sessionId), // Convert to number since repository expects sessionId as number
      timestamp,
      isBackNavigation
    );
    
    // Convert the number edge ID to string to maintain consistent return type
    const stringEdgeId = String(edgeId);
    
    console.log(`[NavigationService] Created edge ${stringEdgeId}: ${fromPageId} → ${toPageId}`);
    return stringEdgeId;
  } catch (error) {
    console.error(`[NavigationService] Error creating/updating edge ${fromPageId} → ${toPageId}:`, error);
    throw error;
  }
}

/**
 * Ensure there is an active session, creating one if needed
 */
export async function ensureActiveSession(): Promise<boolean> {
  // Check if we have a current session
  const currentSessionId = await getCurrentSessionId();
  if (currentSessionId) {
    return true;
  }
  
  // Prevent concurrent session creation
  if (isStartingSession) return false;
  
  isStartingSession = true;
  try {
    // startNewSession will automatically reuse a recent session if available,
    // or create a new one if needed
    const sessionId = await sessionRepository.startNewSession(SESSION_IDLE_THRESHOLD);
    console.log(`[NavigationService] Active session: ${sessionId}`);
    
    // Log session start event
    console.log(`[NavigationService] New session started: ${sessionId}`);
    
    return true;
  } catch (error) {
    console.error(`[NavigationService] Error ensuring active session:`, error);
    return false;
  } finally {
    isStartingSession = false;
  }
}

/**
 * Get the current session ID
 */
export async function getCurrentSessionId(): Promise<string | null> {
  try {
    const sessionId = sessionRepository.getCurrentSessionId();
    // Convert number to string since the function expects to return a string
    return sessionId ? String(sessionId) : null;
  } catch (error) {
    console.error(`[NavigationService] Error getting current session ID:`, error);
    return null;
  }
}

/**
 * Update session activity time
 */
export async function updateSessionActivityTime(duration: number = 0): Promise<void> {
  try {
    const sessionId = await getCurrentSessionId();
    if (!sessionId) return;
    
    await sessionRepository.updateSessionActivityTime(Number(sessionId));
  } catch (error) {
    console.error(`[NavigationService] Error updating session activity time:`, error);
  }
}

/**
 * End current session
 */
export async function endCurrentSession(): Promise<void> {
  try {
    const sessionId = await getCurrentSessionId();
    if (!sessionId) return;
    
    await sessionRepository.endSession(Number(sessionId));
    console.log(`[NavigationService] Ended session: ${sessionId}`);
    
    // Log session end event
    console.log(`[NavigationService] Session ended: ${sessionId}`);
  } catch (error) {
    console.error(`[NavigationService] Error ending current session:`, error);
  }
}

// Create a class for service-oriented usage
export class NavigationService {
  createOrGetPage = createOrGetPage;
  startVisit = startVisit;
  endVisit = endVisit;
  getVisit = getVisit;
  createOrUpdateEdge = createOrUpdateEdge;
  ensureActiveSession = ensureActiveSession;
  getCurrentSessionId = getCurrentSessionId;
  updateSessionActivityTime = updateSessionActivityTime;
  endCurrentSession = endCurrentSession;
}

// Create and export singleton instance
export const navigationService = new NavigationService();

// Default export for convenience
export default navigationService;
