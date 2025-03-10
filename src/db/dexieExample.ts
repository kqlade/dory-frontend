/**
 * Dexie.js Database Examples
 * 
 * This file demonstrates how to perform common database operations
 * using our Dexie-based database implementation.
 */

import { getCurrentDB, Page, Visit } from './dexieDB';

/**
 * Records a page visit
 * @param url The URL of the page
 * @param title The title of the page
 * @param sessionId The current session ID
 */
export async function recordPageVisit(url: string, title: string, sessionId: string): Promise<void> {
  // Get the current user's database
  const db = getCurrentDB();
  
  // Transaction wraps multiple operations together
  await db.transaction('rw', [db.pages, db.visits], async () => {
    // Get the domain from the URL
    const domain = new URL(url).hostname;
    
    // Get the current timestamp
    const now = Date.now();
    
    // Check if the page exists
    let page = await db.pages.get(generatePageId(url));
    
    if (page) {
      // Update existing page
      await db.pages.update(page.pageId, {
        title, // Update title in case it changed
        lastVisit: now,
        visitCount: page.visitCount + 1,
        updatedAt: now
      });
    } else {
      // Create a new page record
      page = {
        pageId: generatePageId(url),
        url,
        title,
        domain,
        firstVisit: now,
        lastVisit: now,
        visitCount: 1,
        hasExtractedContent: false,
        contentAvailability: 'none',
        personalScore: 0.5, // Initial score
        syncStatus: 'pending',
        updatedAt: now
      };
      
      await db.pages.add(page);
    }
    
    // Record the visit
    await db.visits.add({
      pageId: page.pageId,
      timestamp: now,
      dwellTime: 0, // Will be updated when the user leaves the page
      sessionId,
      syncStatus: 'pending',
      updatedAt: now
    });
    
    console.log(`Recorded visit to ${url}`);
  });
}

/**
 * Updates the dwell time for a page visit
 * @param url The URL of the page
 * @param dwellTime The time spent on the page in seconds
 */
export async function updateDwellTime(url: string, dwellTime: number): Promise<void> {
  const db = getCurrentDB();
  const pageId = generatePageId(url);
  
  // Get the most recent visit for this page
  const visit = await db.visits
    .where('pageId')
    .equals(pageId)
    .reverse() // Sort by most recent first
    .first();
  
  if (visit) {
    await db.visits.update(visit.id!, {
      dwellTime,
      updatedAt: Date.now()
    });
    console.log(`Updated dwell time for ${url}: ${dwellTime} seconds`);
  }
}

/**
 * Searches for pages matching a query
 * @param query The search query
 * @returns Array of matching pages
 */
export async function searchPages(query: string): Promise<Page[]> {
  const db = getCurrentDB();
  
  // Simple search implementation - can be enhanced based on requirements
  const lowerQuery = query.toLowerCase();
  
  // Search pages by title and url with limit 20
  const results = await db.pages
    .filter(page => 
      page.title.toLowerCase().includes(lowerQuery) ||
      page.url.toLowerCase().includes(lowerQuery)
    )
    .limit(20)
    .toArray();
  
  return results;
}

/**
 * Gets the user's recently visited pages
 * @param limit The maximum number of pages to return
 * @returns Array of recently visited pages
 */
export async function getRecentPages(limit: number = 10): Promise<Page[]> {
  const db = getCurrentDB();
  
  return await db.pages
    .orderBy('lastVisit')
    .reverse() // Most recent first
    .limit(limit)
    .toArray();
}

/**
 * Gets the history for a specific page
 * @param url The URL of the page
 * @returns Array of visits to this page
 */
export async function getPageHistory(url: string): Promise<Visit[]> {
  const db = getCurrentDB();
  const pageId = generatePageId(url);
  
  return await db.visits
    .where('pageId')
    .equals(pageId)
    .reverse() // Most recent first
    .toArray();
}

/**
 * Records active time on a page
 * @param url The URL of the page
 * @param startTime When the active period started
 * @param endTime When the active period ended
 * @param sessionId The current session ID
 */
export async function recordActiveTime(
  url: string, 
  startTime: number, 
  endTime: number, 
  sessionId: string
): Promise<void> {
  const db = getCurrentDB();
  const pageId = generatePageId(url);
  const duration = Math.floor((endTime - startTime) / 1000); // Convert to seconds
  
  await db.activeTime.add({
    pageId,
    startTime,
    endTime,
    duration,
    sessionId,
    syncStatus: 'pending',
    updatedAt: Date.now()
  });
  
  console.log(`Recorded ${duration}s of active time on ${url}`);
}

/**
 * Starts a new browsing session
 * @param deviceInfo Information about the user's device
 * @returns The new session ID
 */
export async function startSession(deviceInfo: string): Promise<string> {
  const db = getCurrentDB();
  const sessionId = generateSessionId();
  const now = Date.now();
  
  await db.sessions.add({
    sessionId,
    startTime: now,
    deviceInfo,
    syncStatus: 'pending',
    updatedAt: now
  });
  
  console.log(`Started new session: ${sessionId}`);
  return sessionId;
}

/**
 * Ends a browsing session
 * @param sessionId The ID of the session to end
 */
export async function endSession(sessionId: string): Promise<void> {
  const db = getCurrentDB();
  const now = Date.now();
  
  await db.sessions.update(sessionId, {
    endTime: now,
    updatedAt: now
  });
  
  console.log(`Ended session: ${sessionId}`);
}

/**
 * Records a search query and selected result
 * @param query The search query
 * @param resultCount The number of results returned
 * @param selectedResult The selected result, if any
 * @param selectedIndex The index of the selected result
 * @param sessionId The current session ID
 */
export async function recordSearch(
  query: string,
  resultCount: number,
  selectedResult: string | null,
  selectedIndex: number | null,
  sessionId: string
): Promise<void> {
  const db = getCurrentDB();
  const now = Date.now();
  
  await db.searchHistory.add({
    query,
    timestamp: now,
    resultCount,
    selectedResult: selectedResult || undefined,
    selectedIndex: selectedIndex !== null ? selectedIndex : undefined,
    sessionId,
    syncStatus: 'pending',
    updatedAt: now
  });
  
  console.log(`Recorded search for "${query}" with ${resultCount} results`);
}

/**
 * Utility to generate a page ID from a URL
 * @param url The URL
 * @returns A consistent ID for this URL
 */
function generatePageId(url: string): string {
  // Simple approach - in production, you might want a more robust ID generation
  return `page_${encodeURIComponent(url)}`;
}

/**
 * Utility to generate a session ID
 * @returns A unique session ID
 */
function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

export default {
  recordPageVisit,
  updateDwellTime,
  searchPages,
  getRecentPages,
  getPageHistory,
  recordActiveTime,
  startSession,
  endSession,
  recordSearch
}; 