/**
 * @file dexieBrowsingStore.ts
 * 
 * Dexie-based Browsing Store 
 * This provides the same API as the original browsingStore.ts 
 * but uses Dexie for local storage of pages, edges, visits, etc.
 */

import { DoryDatabase, PageRecord, EdgeRecord, VisitRecord } from '../db/dexieDB';
import * as dexieDb from '../db/dexieDB';
import { generatePageIdFromUrlSync } from './pageIdGenerator';

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
export async function createOrGetPage(url: string, title?: string, timestamp?: number): Promise<string> {
  if (!url) {
    console.error('[DORY] Cannot create page record without URL');
    return '';
  }
  
  const now = timestamp || Date.now();
  const db = await getDB();
  
  try {
    // Check if we already have a page with this URL
    const existingPage = await db.pages.where('url').equals(url).first();
    
    if (existingPage) {
      // Update the existing page with new visit information
      await db.pages.update(existingPage.pageId, {
        lastVisit: now,
        visitCount: (existingPage.visitCount || 0) + 1,
        title: title || existingPage.title,
        updatedAt: now
      });
      console.log('[DORY] Updated existing page =>', existingPage.pageId);
      return existingPage.pageId;
    }
    
    // Create a new deterministic page ID for this URL
    const pageId = generatePageIdFromUrlSync(url);
    
    // Create a new page record
    await db.pages.add({
      pageId,
      url,
      title: title || url,
      firstVisit: now,
      updatedAt: now,
      lastVisit: now,
      visitCount: 1,
      totalActiveTime: 0,
      domain: new URL(url).hostname,
      personalScore: 0.5,
      syncStatus: 'pending'
    });
    
    console.log('[DORY] Created new page =>', pageId);
    return pageId;
  } catch (error) {
    console.error('[DORY] Error creating/getting page:', error);
    return '';
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
 * Generate a numeric UUID for edge IDs
 */
function generateEdgeUuid(): number {
  // Get 6 random bytes (48 bits of randomness)
  const randomBytes = new Uint8Array(6);
  crypto.getRandomValues(randomBytes);
  
  // Convert to a numeric value (as a safe JavaScript integer)
  let value = 0;
  for (let i = 0; i < randomBytes.length; i++) {
    value = (value << 8) | randomBytes[i];
  }
  
  // Mask to 47 bits to ensure it's a positive safe integer
  return value & 0x7FFFFFFFFFFF;
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
  const edgeId = generateEdgeUuid();
  const edge: EdgeRecord = {
    edgeId,
    fromPageId,
    toPageId,
    sessionId,
    timestamp,
    count: 1,
    firstTraversal: timestamp,
    lastTraversal: timestamp
  };
  await db.edges.put(edge);
  return edgeId;
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
    await db.edges.update(existing.edgeId, {
      count: existing.count + 1,
      lastTraversal: timestamp,
      isBackNavigation: isBackNav || existing.isBackNavigation
    });
    return existing.edgeId;
  } else {
    const edgeId = generateEdgeUuid();
    const newEdge: EdgeRecord = {
      edgeId,
      fromPageId,
      toPageId,
      sessionId,
      timestamp,
      count: 1,
      firstTraversal: timestamp,
      lastTraversal: timestamp,
      isBackNavigation: isBackNav
    };
    await db.edges.put(newEdge);
    return edgeId;
  }
}

/**
 * Generate a string-format UUID for visit IDs
 * Format: v{uuid_part}
 */
function generateVisitUuid(): string {
  // Get 16 random bytes (128 bits of randomness)
  const randomBytes = new Uint8Array(16);
  crypto.getRandomValues(randomBytes);
  
  // Convert to a hex string
  const hexString = Array.from(randomBytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  
  // Format as a UUID-like string with 'v' prefix
  return `v${hexString.substring(0, 8)}-${hexString.substring(8, 12)}-${hexString.substring(12, 16)}-${hexString.substring(16, 20)}-${hexString.substring(20)}`;
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
  const visitId = generateVisitUuid();
  
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