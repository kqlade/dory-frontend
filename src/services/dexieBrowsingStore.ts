/**
 * Dexie-based Browsing Store 
 * 
 * This file provides the same API as the original browsingStore.ts
 * but uses Dexie.js for storage.
 */

import { DoryDatabase, PageRecord, EdgeRecord, VisitRecord } from './dexieDB';
import * as dexieDb from './dexieDB';

// Re-export types to maintain compatibility
export type { PageRecord, EdgeRecord, VisitRecord };

/**
 * Get the database instance
 * @returns A promise resolving to the Dexie database instance
 */
export function getDB(): Promise<DoryDatabase> {
  return Promise.resolve(dexieDb.getDB());
}

/**
 * Create or get a page by URL
 * @param url The URL of the page
 * @param title The title of the page
 * @param timestamp The timestamp of the visit
 * @returns The page ID
 */
export async function createOrGetPage(url: string, title: string, timestamp: number): Promise<number> {
  const db = dexieDb.getDB();
  
  // Try to find an existing page with this URL
  const existingPage = await db.pages.where('url').equals(url).first();
  
  if (existingPage) {
    // Update the existing page
    await db.pages.update(existingPage.pageId!, {
      lastVisit: timestamp,
      visitCount: (existingPage.visitCount || 0) + 1
    });
    return existingPage.pageId!;
  } else {
    // Create a new page
    const newPage: PageRecord = {
      url,
      title: title || url,
      totalActiveTime: 0,
      firstVisit: timestamp,
      lastVisit: timestamp,
      visitCount: 1
    };
    return await db.pages.add(newPage);
  }
}

/**
 * Update the active time for a page
 * @param url The URL of the page
 * @param duration The duration to add in seconds
 */
export async function updateActiveTimeForPage(url: string, duration: number): Promise<void> {
  if (duration <= 0) return;
  
  const db = dexieDb.getDB();
  
  // Find the page by URL
  const page = await db.pages.where('url').equals(url).first();
  if (page) {
    await db.pages.update(page.pageId!, {
      totalActiveTime: (page.totalActiveTime || 0) + duration
    });
  }
}

/**
 * Create a navigation edge between two pages
 * @param fromPageId The source page ID
 * @param toPageId The destination page ID
 * @param sessionId The session ID
 * @param timestamp The timestamp of the navigation
 * @returns The edge ID
 */
export async function createNavigationEdge(
  fromPageId: number, 
  toPageId: number, 
  sessionId: number, 
  timestamp: number
): Promise<number> {
  const db = dexieDb.getDB();
  
  const edge: EdgeRecord = {
    fromPageId,
    toPageId,
    sessionId,
    timestamp,
    count: 1,
    firstTraversal: timestamp,
    lastTraversal: timestamp
  };
  
  return await db.edges.add(edge);
}

/**
 * Create or update an edge (for deduplication)
 * @param fromPageId The source page ID
 * @param toPageId The destination page ID
 * @param sessionId The session ID
 * @param timestamp The timestamp of the navigation
 * @param isBackNav Whether this is a back navigation
 * @returns The edge ID
 */
export async function createOrUpdateEdge(
  fromPageId: number,
  toPageId: number,
  sessionId: number,
  timestamp: number,
  isBackNav: boolean
): Promise<number> {
  const db = dexieDb.getDB();
  
  // Try to find an existing edge
  const existingEdge = await db.edges
    .where(['fromPageId', 'toPageId', 'sessionId'])
    .equals([fromPageId, toPageId, sessionId])
    .first();
  
  if (existingEdge) {
    // Update the existing edge
    await db.edges.update(existingEdge.edgeId!, {
      count: existingEdge.count + 1,
      lastTraversal: timestamp,
      isBackNavigation: isBackNav || existingEdge.isBackNavigation
    });
    return existingEdge.edgeId!;
  } else {
    // Create a new edge
    const newEdge: EdgeRecord = {
      fromPageId,
      toPageId,
      sessionId,
      timestamp,
      count: 1,
      firstTraversal: timestamp,
      lastTraversal: timestamp,
      isBackNavigation: isBackNav
    };
    return await db.edges.add(newEdge);
  }
}

/**
 * Start a new visit
 * @param pageId The page ID
 * @param sessionId The session ID
 * @param fromPageId The source page ID (optional)
 * @param isBackNav Whether this is a back navigation (optional)
 * @returns The visit ID
 */
export async function startVisit(
  pageId: number,
  sessionId: number,
  fromPageId?: number,
  isBackNav?: boolean
): Promise<string> {
  const db = dexieDb.getDB();
  
  const visitId = `v${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const visit: VisitRecord = {
    visitId,
    pageId,
    sessionId,
    fromPageId,
    startTime: Date.now(),
    totalActiveTime: 0,
    isBackNavigation: isBackNav
  };
  
  await db.visits.add(visit);
  return visitId;
}

/**
 * End a visit
 * @param visitId The visit ID
 * @param endTime The end timestamp
 */
export async function endVisit(visitId: string, endTime: number): Promise<void> {
  const db = dexieDb.getDB();
  
  const visit = await db.visits.get(visitId);
  if (visit) {
    await db.visits.update(visitId, {
      endTime: endTime
    });
  }
}

/**
 * Update active time for a visit
 * @param visitId The visit ID
 * @param duration The duration to add in seconds
 */
export async function updateVisitActiveTime(visitId: string, duration: number): Promise<void> {
  if (duration <= 0) return;
  
  const db = dexieDb.getDB();
  
  const visit = await db.visits.get(visitId);
  if (visit) {
    await db.visits.update(visitId, {
      totalActiveTime: (visit.totalActiveTime || 0) + duration
    });
  }
} 