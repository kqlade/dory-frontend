/**
 * @file dexieDB.ts
 *
 * A full rewrite that:
 *  1) Uses auto-incremented primary keys on edges/sessions (`++edgeId`, `++sessionId`).
 *  2) Adds compound index [fromPageId+toPageId+sessionId] on edges, fixing "KeyPath not indexed" errors.
 */

import Dexie from 'dexie';
import { getCurrentUser } from '../services/authService';

/** PageRecord: same as before */
export interface PageRecord {
  pageId: string;
  url: string;
  title: string;
  domain: string;
  firstVisit: number;
  lastVisit: number;
  visitCount: number;
  totalActiveTime: number;
  personalScore: number;
  syncStatus: 'synced' | 'pending' | 'conflict';
  updatedAt: number;
  hasExtractedContent?: boolean;
  contentAvailability?: 'local' | 'server' | 'both' | 'none';
}

/**
 * EdgeRecord: 
 *  - `edgeId?: number` is auto-increment so Dexie sets it.
 *  - We define a compound index in the schema so we can do 
 *    db.edges.where(['fromPageId','toPageId','sessionId'])
 */
export interface EdgeRecord {
  edgeId?: number; // auto-increment
  fromPageId: string;
  toPageId: string;
  sessionId: number;
  timestamp: number;
  count: number;
  firstTraversal: number;
  lastTraversal: number;
  isBackNavigation?: boolean;
}

/**
 * VisitRecord:
 * We already supply `visitId` ourselves, so it's not auto-increment.
 */
export interface VisitRecord {
  visitId: string;
  pageId: string;
  sessionId: number;
  startTime: number;
  totalActiveTime: number;
  fromPageId?: string;
  endTime?: number;
  isBackNavigation?: boolean;
}

/**
 * BrowsingSession:
 *  - `sessionId?: number` is now auto-increment
 */
export interface BrowsingSession {
  sessionId?: number;   // auto-increment
  startTime: number;
  endTime?: number;
  lastActivityAt: number;
  totalActiveTime: number;
  isActive: boolean;
}

/**
 * DoryEvent:
 *  - eventId is `++eventId` so Dexie auto-increments it
 */
export interface DoryEvent {
  eventId?: number;
  operation: string;
  sessionId: string;  // or number cast to string
  userId?: string;
  userEmail?: string;
  timestamp: number;
  data: any;
  loggedAt: number;
}

/**
 * MetadataRecord:
 * - For storing application configuration and model data
 */
export interface MetadataRecord {
  key: string;        // Primary key
  value: string;      // JSON or other string value
  updatedAt: number;  // Last update timestamp
}

/** Our Dexie subclass */
export class DoryDatabase extends Dexie {
  // Dexie tables
  pages!: Dexie.Table<PageRecord, string>;
  edges!: Dexie.Table<EdgeRecord, number>;
  sessions!: Dexie.Table<BrowsingSession, number>;
  visits!: Dexie.Table<VisitRecord, string>;
  events!: Dexie.Table<DoryEvent, number>;
  metadata!: Dexie.Table<MetadataRecord, string>;

  constructor(userId: string) {
    // Each user has a separate DB
    super(`doryLocalDB_${userId}`);

    /**
     *  Single version(1) schema that does:
     *   - edges: '++edgeId, [fromPageId+toPageId+sessionId], ...'
     *   - sessions: '++sessionId, ...'
     *   - visits: 'visitId, ...'
     *   - pages: 'pageId, ...'
     *   - events: '++eventId, ...'
     *   - metadata: 'key, ...'
     */
    this.version(1).stores({
      pages: `
        pageId,
        url,
        domain,
        lastVisit,
        visitCount,
        personalScore,
        syncStatus
      `,
      /**
       * edges store:
       *  - `++edgeId` means auto-increment PK
       *  - `[fromPageId+toPageId+sessionId]` is a compound index
       *  - We also list single-field indexes: fromPageId, toPageId, sessionId, etc.
       */
      edges: `
        ++edgeId,
        [fromPageId+toPageId+sessionId],
        fromPageId,
        toPageId,
        sessionId,
        timestamp,
        count,
        firstTraversal,
        lastTraversal,
        *isBackNavigation
      `,
      /**
       * sessions store:
       *  - `++sessionId` means auto-increment PK
       */
      sessions: `
        ++sessionId,
        startTime,
        endTime,
        lastActivityAt,
        totalActiveTime,
        isActive
      `,
      /**
       * visits store:
       *  - We supply `visitId` ourselves, so it's the PK
       */
      visits: `
        visitId,
        pageId,
        sessionId,
        fromPageId,
        startTime,
        endTime,
        totalActiveTime,
        *isBackNavigation
      `,
      /**
       * events store:
       *  - `++eventId` auto-increment
       */
      events: `
        ++eventId,
        operation,
        sessionId,
        timestamp,
        loggedAt
      `
    });

    // Updated to version 2 to add metadata table
    this.version(2).stores({
      metadata: `
        key,
        updatedAt
      `
    });
  }
}

/** Active instances keyed by userId */
const dbInstances: Record<string, DoryDatabase> = {};

/** Track current user ID in memory */
let currentUserId: string | null = null;

/**
 * If no DB instance for the user, create it.
 */
export function getUserDB(userId: string): DoryDatabase {
  if (!userId) {
    throw new Error('User ID is required to access the database');
  }
  if (!dbInstances[userId]) {
    dbInstances[userId] = new DoryDatabase(userId);
  }
  return dbInstances[userId];
}

/**
 * Get DB for the currently authenticated user
 */
export function getDB(): DoryDatabase {
  if (!currentUserId) {
    throw new Error('No authenticated user. Call initializeDexieDB first.');
  }
  return getUserDB(currentUserId);
}

/**
 * Initialize Dexie DB system based on whichever user is authenticated.
 */
export async function initializeDexieDB(): Promise<void> {
  try {
    const userInfo = await getCurrentUser();
    if (userInfo?.id) {
      currentUserId = userInfo.id;
      console.log(`[DexieDB] Initialized for user: ${userInfo.id}`);
      getDB(); // ensures creation
    } else {
      console.log('[DexieDB] No authenticated user => using "anonymous" DB');
      currentUserId = 'anonymous';
      getDB();
    }
  } catch (error) {
    console.error('[DexieDB] Error initializing database:', error);
    currentUserId = 'anonymous';
    getDB();
  }
}

/**
 * Switch to a new user ID at runtime, if needed
 */
export function setCurrentUser(userId: string): void {
  currentUserId = userId;
}

/**
 * Close the DB for the current user, if open
 */
export function handleUserLogout(): void {
  if (currentUserId && dbInstances[currentUserId]) {
    dbInstances[currentUserId].close();
    delete dbInstances[currentUserId];
  }
  currentUserId = null;
}

/**
 * Close ALL open DBs (for all users)
 */
export function closeAllDatabases(): void {
  for (const userId of Object.keys(dbInstances)) {
    dbInstances[userId].close();
    delete dbInstances[userId];
  }
}

// Optionally export a default object if you like:
export default {
  getDB,
  getUserDB,
  initializeDexieDB,
  setCurrentUser,
  handleUserLogout,
  closeAllDatabases,
  DoryDatabase
};