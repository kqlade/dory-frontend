// src/services/browsingStore.ts

import { IDBPDatabase, openDB } from 'idb';

// Define interfaces for our database records
export interface PageRecord {
  pageId?: number;
  url: string;
  title: string;
  totalActiveTime: number; // sum of all visits
  firstVisit: number;
  lastVisit: number;
  visitCount: number;      // how many times user visited
}

export interface EdgeRecord {
  edgeId?: number;
  fromPageId: number;
  toPageId: number;
  sessionId: number;
  timestamp: number;
  // New metadata:
  count: number;           // how many times we used this edge
  firstTraversal: number;  // earliest time the user navigated from -> to
  lastTraversal: number;   // most recent time
  isBackNavigation?: boolean;
}

export interface VisitRecord {
  visitId: string;          // unique ID for the visit
  pageId: number;           // link to the PageRecord
  sessionId: number;        // which session this visit belongs to
  fromPageId?: number;      // if user navigated from a known page
  startTime: number;        // ms timestamp
  endTime?: number;         // ms timestamp, if ended
  totalActiveTime: number;  // how many seconds user was active
  isBackNavigation?: boolean;
}

// Get a reference to the database
export function getDB(): Promise<IDBPDatabase> {
  return openDB('dory-db', 1, {
    upgrade(db) {
      // Create stores if they don't exist
      if (!db.objectStoreNames.contains('pages')) {
        const pageStore = db.createObjectStore('pages', { keyPath: 'pageId', autoIncrement: true });
        pageStore.createIndex('by-url', 'url', { unique: true });
      }
      
      if (!db.objectStoreNames.contains('edges')) {
        const edgeStore = db.createObjectStore('edges', { keyPath: 'edgeId', autoIncrement: true });
        edgeStore.createIndex('by-from', 'fromPageId', { unique: false });
        edgeStore.createIndex('by-to', 'toPageId', { unique: false });
        edgeStore.createIndex('by-from-to-session', ['fromPageId', 'toPageId', 'sessionId'], { unique: true });
      }
      
      if (!db.objectStoreNames.contains('sessions')) {
        db.createObjectStore('sessions', { keyPath: 'sessionId', autoIncrement: true });
      }
      
      // Add visits store
      if (!db.objectStoreNames.contains('visits')) {
        const visitStore = db.createObjectStore('visits', { keyPath: 'visitId' });
        visitStore.createIndex('by-pageId', 'pageId', { unique: false });
        visitStore.createIndex('by-sessionId', 'sessionId', { unique: false });
      }
    }
  });
}

// Create or get a page by URL
export async function createOrGetPage(url: string, title: string, timestamp: number): Promise<number> {
  const db = await getDB();
  const tx = db.transaction('pages', 'readwrite');
  const store = tx.objectStore('pages');
  const index = store.index('by-url');
  
  // Try to find an existing page with this URL
  const existingPage = await index.get(url);
  
  if (existingPage) {
    // Update the existing page
    existingPage.lastVisit = timestamp;
    existingPage.visitCount = (existingPage.visitCount || 0) + 1;
    await store.put(existingPage);
    await tx.done;
    return existingPage.pageId;
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
    const pageId = await store.add(newPage);
    await tx.done;
    return pageId as number;
  }
}

// Update the active time for a page
export async function updateActiveTimeForPage(url: string, duration: number): Promise<void> {
  if (duration <= 0) return;
  
  const db = await getDB();
  const tx = db.transaction('pages', 'readwrite');
  const store = tx.objectStore('pages');
  const index = store.index('by-url');
  
  const page = await index.get(url);
  if (page) {
    page.totalActiveTime = (page.totalActiveTime || 0) + duration;
    await store.put(page);
  }
  
  await tx.done;
}

// Create a navigation edge between two pages
export async function createNavigationEdge(fromPageId: number, toPageId: number, sessionId: number, timestamp: number): Promise<number> {
  const db = await getDB();
  const tx = db.transaction('edges', 'readwrite');
  const store = tx.objectStore('edges');
  
  const edge: EdgeRecord = {
    fromPageId,
    toPageId,
    sessionId,
    timestamp,
    count: 1,
    firstTraversal: timestamp,
    lastTraversal: timestamp
  };
  
  const edgeId = await store.add(edge);
  await tx.done;
  return edgeId as number;
}

// Create or update an edge (for deduplication)
export async function createOrUpdateEdge(
  fromPageId: number,
  toPageId: number,
  sessionId: number,
  timestamp: number,
  isBackNav: boolean
): Promise<number> {
  const db = await getDB();
  const tx = db.transaction('edges', 'readwrite');
  const store = tx.objectStore('edges');
  const index = store.index('by-from-to-session');

  const existingEdge = await index.get([fromPageId, toPageId, sessionId]);
  if (existingEdge) {
    existingEdge.count += 1;
    existingEdge.lastTraversal = timestamp;
    if (isBackNav) existingEdge.isBackNavigation = true; 
    await store.put(existingEdge);
    await tx.done;
    return existingEdge.edgeId;
  } else {
    // create a new edge
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
    const edgeId = await store.add(newEdge);
    await tx.done;
    return edgeId as number;
  }
}

// Start a new visit
export async function startVisit(
  pageId: number,
  sessionId: number,
  fromPageId?: number,
  isBackNav?: boolean
): Promise<string> {
  const db = await getDB();
  const tx = db.transaction('visits', 'readwrite');
  const store = tx.objectStore('visits');
  
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
  
  await store.add(visit);
  await tx.done;
  return visitId;
}

// End a visit
export async function endVisit(visitId: string, endTime: number): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('visits', 'readwrite');
  const store = tx.objectStore('visits');
  
  const visit = await store.get(visitId);
  if (visit) {
    visit.endTime = endTime;
    await store.put(visit);
  }
  
  await tx.done;
}

// Update active time for a visit
export async function updateVisitActiveTime(visitId: string, duration: number): Promise<void> {
  if (duration <= 0) return;
  
  const db = await getDB();
  const tx = db.transaction('visits', 'readwrite');
  const store = tx.objectStore('visits');
  
  const visit = await store.get(visitId);
  if (visit) {
    visit.totalActiveTime = (visit.totalActiveTime || 0) + duration;
    await store.put(visit);
  }
  
  await tx.done;
}