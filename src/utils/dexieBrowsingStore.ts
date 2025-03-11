/**
 * @file dexieBrowsingStore.ts
 * 
 * Dexie-based Browsing Store 
 * This provides the same API as the original browsingStore.ts 
 * but uses Dexie for local storage of pages, edges, visits, etc.
 */

import { DoryDatabase, PageRecord, EdgeRecord, VisitRecord } from '../db/dexieDB';
import * as dexieDb from '../db/dexieDB';

// Re-export types
export type { PageRecord, EdgeRecord, VisitRecord };

/**
 * Get the active Dexie database instance (for the current user).
 * @returns a Promise resolving to the Dexie database instance.
 */
export function getDB(): Promise<DoryDatabase> {
  // Your code is already synchronous in sense but let's keep the 
  // signature returning a Promise for consistency.
  return Promise.resolve(dexieDb.getDB());
}

/**
 * Create or retrieve an existing page record by URL.
 * If found, update its lastVisit and visitCount.
 * Otherwise, create a new PageRecord.
 */
export async function createOrGetPage(
  url: string,
  title: string,
  timestamp: number
): Promise<string> {
  const db = dexieDb.getDB();

  // Try to find an existing page with this URL
  const existingPage = await db.pages.where('url').equals(url).first();
  if (existingPage) {
    await db.pages.update(existingPage.pageId, {
      lastVisit: timestamp,
      visitCount: (existingPage.visitCount || 0) + 1,
      updatedAt: timestamp
    });
    return existingPage.pageId;
  } else {
    // Create a new page
    const pageId = `page_${timestamp}_${Math.random().toString(36).substring(2, 9)}`;
    const newPage: PageRecord = {
      pageId,
      url,
      title: title || url,
      domain: new URL(url).hostname,
      firstVisit: timestamp,
      lastVisit: timestamp,
      visitCount: 1,
      totalActiveTime: 0,
      personalScore: 0.5,
      syncStatus: 'pending',
      updatedAt: timestamp
    };
    await db.pages.add(newPage);
    return pageId;
  }
}

/**
 * Update the active time (in seconds) for a given page by its URL.
 */
export async function updateActiveTimeForPage(url: string, duration: number): Promise<void> {
  if (duration <= 0) return;
  
  const db = dexieDb.getDB();
  const page = await db.pages.where('url').equals(url).first();
  if (page) {
    await db.pages.update(page.pageId, {
      totalActiveTime: (page.totalActiveTime || 0) + duration,
      updatedAt: Date.now()
    });
  }
}

/**
 * Create a brand new navigation edge.
 */
export async function createNavigationEdge(
  fromPageId: string,
  toPageId: string,
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
  return db.edges.add(edge);
}

/**
 * Create or update an existing navigation edge for deduplication.
 */
export async function createOrUpdateEdge(
  fromPageId: string,
  toPageId: string,
  sessionId: number,
  timestamp: number,
  isBackNav: boolean
): Promise<number> {
  const db = dexieDb.getDB();
  // Try to find existing edge
  const existing = await db.edges
    .where(['fromPageId', 'toPageId', 'sessionId'])
    .equals([fromPageId, toPageId, sessionId])
    .first();

  if (existing) {
    await db.edges.update(existing.edgeId!, {
      count: existing.count + 1,
      lastTraversal: timestamp,
      isBackNavigation: isBackNav || existing.isBackNavigation
    });
    return existing.edgeId!;
  } else {
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
    return db.edges.add(newEdge);
  }
}

/**
 * Start a new visit record for a page within a given session.
 */
export async function startVisit(
  pageId: string,
  sessionId: number,
  fromPageId?: string,
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
 * End a visit by setting the endTime field.
 */
export async function endVisit(visitId: string, endTime: number): Promise<void> {
  const db = dexieDb.getDB();
  const visit = await db.visits.get(visitId);
  if (visit) {
    await db.visits.update(visitId, { endTime });
  }
}

/**
 * Add active time (in seconds) to a visit record.
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