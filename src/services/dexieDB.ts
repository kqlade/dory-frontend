/**
 * Dexie.js Database for Dory Extension
 * 
 * This file implements the database layer using Dexie.js while maintaining
 * compatibility with the existing data models and API.
 */

import Dexie from 'dexie';
import { getUserInfo } from '../auth/googleAuth';

// Import or define types to match existing models
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

export interface BrowsingSession {
  sessionId?: number;
  startTime: number;
  endTime?: number;
  lastActivityAt: number;
  totalActiveTime: number; // cumulative across all pages in the session
  isActive: boolean;       // indicates whether the session is still ongoing
}

export interface DoryEvent {
  eventId?: number;
  operation: string;
  sessionId: string;
  userId?: string;
  userEmail?: string;
  timestamp: number;
  data: any;
  loggedAt: number;
}

/**
 * Dory Database class that extends Dexie
 */
export class DoryDatabase extends Dexie {
  pages!: Dexie.Table<PageRecord, number>;
  edges!: Dexie.Table<EdgeRecord, number>;
  sessions!: Dexie.Table<BrowsingSession, number>;
  visits!: Dexie.Table<VisitRecord, string>;
  events!: Dexie.Table<DoryEvent, number>;

  constructor(userId: string) {
    // Create database with user-specific name
    super(`doryLocalDB_${userId}`);

    // Define database schema to match existing structure
    this.version(1).stores({
      pages: 'pageId, url, title, totalActiveTime, firstVisit, lastVisit, visitCount',
      edges: 'edgeId, fromPageId, toPageId, sessionId, timestamp, count, firstTraversal, lastTraversal, *isBackNavigation',
      sessions: 'sessionId, startTime, endTime, lastActivityAt, totalActiveTime, isActive',
      visits: 'visitId, pageId, sessionId, fromPageId, startTime, endTime, totalActiveTime, *isBackNavigation',
      events: '++eventId, operation, sessionId, userId, timestamp, loggedAt'
    });
  }
}

// Store active database instances by user ID
const dbInstances: Record<string, DoryDatabase> = {};
let currentUserId: string | null = null;

/**
 * Initializes the Dexie database for the authenticated user
 */
export async function initializeDexieDB(): Promise<void> {
  try {
    const userInfo = await getUserInfo();
    if (userInfo && userInfo.id) {
      currentUserId = userInfo.id;
      console.log(`[DexieDB] Initialized for user: ${userInfo.id}`);
      // Initialize database for this user
      getDB(); // This will create the DB if needed
    } else {
      console.log('[DexieDB] No authenticated user found, using anonymous database');
      // For testing, we can use a default user ID
      currentUserId = 'anonymous';
      getDB();
    }
  } catch (error) {
    console.error('[DexieDB] Error initializing database:', error);
    // For development/fallback, use anonymous mode
    currentUserId = 'anonymous';
    getDB();
  }
}

/**
 * Gets a database instance for the current user
 * @returns Database instance
 */
export function getDB(): DoryDatabase {
  if (!currentUserId) {
    throw new Error("No authenticated user. Call initializeDexieDB first.");
  }
  
  if (!dbInstances[currentUserId]) {
    dbInstances[currentUserId] = new DoryDatabase(currentUserId);
  }
  
  return dbInstances[currentUserId];
}

/**
 * Sets the current user for database operations
 * @param userId The user ID
 */
export function setCurrentUser(userId: string): void {
  currentUserId = userId;
}

/**
 * Handles user logout by closing the database connection
 */
export function handleUserLogout(): void {
  if (currentUserId && dbInstances[currentUserId]) {
    dbInstances[currentUserId].close();
    delete dbInstances[currentUserId];
  }
  currentUserId = null;
}

export default {
  getDB,
  initializeDexieDB,
  setCurrentUser,
  handleUserLogout,
  DoryDatabase
}; 