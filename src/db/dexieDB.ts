/**
 * Dory Local Storage implementation using Dexie.js
 * 
 * This file provides a simplified IndexedDB implementation that maintains
 * user data isolation with significantly less code using Dexie.js
 */

import Dexie from 'dexie';

/**
 * Types for our database tables
 */
export interface Page {
  pageId: string;
  url: string;
  title: string;
  domain: string;
  favicon?: string;
  firstVisit: number;
  lastVisit: number;
  visitCount: number;
  hasExtractedContent: boolean;
  contentAvailability: 'local' | 'server' | 'both' | 'none';
  personalScore: number;
  tags?: string[];
  category?: string;
  syncStatus: 'synced' | 'pending' | 'conflict';
  updatedAt: number;
}

export interface Visit {
  id?: number;
  pageId: string;
  timestamp: number;
  dwellTime: number;
  sessionId: string;
  referrer?: string;
  exitPage?: string;
  syncStatus: 'synced' | 'pending';
  updatedAt: number;
}

export interface ActiveTime {
  id?: number;
  pageId: string;
  startTime: number;
  endTime: number;
  duration: number;
  sessionId: string;
  syncStatus: 'synced' | 'pending';
  updatedAt: number;
}

export interface Session {
  sessionId: string;
  startTime: number;
  endTime?: number;
  deviceInfo: string;
  syncStatus: 'synced' | 'pending';
  updatedAt: number;
}

export interface SearchHistory {
  id?: number;
  query: string;
  timestamp: number;
  resultCount: number;
  selectedResult?: string;
  selectedIndex?: number;
  sessionId: string;
  syncStatus: 'synced' | 'pending';
  updatedAt: number;
}

export interface PageContent {
  pageId: string;
  snippets?: string[];
  headings?: string[];
  keywords?: string[];
  summary?: string;
  wordCount?: number;
  extractedAt: number;
  contentSentToServer: boolean;
  syncStatus: 'synced' | 'pending';
  updatedAt: number;
}

export interface SyncLog {
  id?: number;
  operation: 'push' | 'pull' | 'merge';
  startTime: number;
  endTime: number;
  status: 'success' | 'failure' | 'partial' | 'inProgress';
  itemsSynced: number;
  error?: string;
  details?: object;
}

/**
 * Dory Database class that extends Dexie
 */
export class DoryDatabase extends Dexie {
  // Define table properties
  pages!: Dexie.Table<Page, string>;
  visits!: Dexie.Table<Visit, number>;
  activeTime!: Dexie.Table<ActiveTime, number>;
  sessions!: Dexie.Table<Session, string>;
  searchHistory!: Dexie.Table<SearchHistory, number>;
  pageContent!: Dexie.Table<PageContent, string>;
  syncLog!: Dexie.Table<SyncLog, number>;

  constructor(userId: string) {
    // Create database with user-specific name
    super(`doryLocalDB_${userId}`);

    // Define database schema
    this.version(1).stores({
      // Table name: primary key + indexed properties
      pages: 'pageId, url, domain, lastVisit, visitCount, personalScore, syncStatus, *tags, [personalScore+lastVisit], [domain+lastVisit]',
      visits: '++id, pageId, timestamp, sessionId, syncStatus, [pageId+timestamp]',
      activeTime: '++id, pageId, startTime, sessionId, syncStatus',
      sessions: 'sessionId, startTime, syncStatus',
      searchHistory: '++id, query, timestamp, sessionId, syncStatus',
      pageContent: 'pageId, extractedAt, syncStatus',
      syncLog: '++id, startTime, status'
    });
  }
}

// Store active database instances by user ID
const dbInstances: Record<string, DoryDatabase> = {};
let currentUserId: string | null = null;

/**
 * Gets a database instance for the specified user
 * @param userId The user's ID
 * @returns A Dexie database instance
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
 * Sets the current active user
 * @param userId The user's ID or null when logging out
 */
export function setCurrentUser(userId: string | null): void {
  if (userId === currentUserId) return;
  currentUserId = userId;
}

/**
 * Gets the current user's database
 * @returns The current user's database instance
 * @throws Error if no user is authenticated
 */
export function getCurrentDB(): DoryDatabase {
  if (!currentUserId) {
    throw new Error('No authenticated user: User must be logged in to access the database');
  }
  
  return getUserDB(currentUserId);
}

/**
 * Closes all database connections
 */
export function closeAllDatabases(): void {
  for (const userId in dbInstances) {
    dbInstances[userId].close();
    delete dbInstances[userId];
  }
}

/**
 * Initializes the database after successful authentication
 * @param userId The authenticated user's ID
 */
export async function initializeUserDatabase(userId: string): Promise<void> {
  if (!userId) {
    throw new Error('User ID is required to initialize the database');
  }

  try {
    setCurrentUser(userId);
    // Just accessing the DB will initialize it
    const db = getCurrentDB();
    console.log(`Database initialized for user: ${userId}`);
    return;
  } catch (error) {
    console.error('Failed to initialize database:', error);
    throw new Error(`Database initialization failed for user: ${userId}`);
  }
}

/**
 * Handles cleanup when a user logs out
 */
export function handleUserLogout(): void {
  if (!currentUserId) return;
  
  // Close the database but keep the instance in case they log back in
  if (dbInstances[currentUserId]) {
    dbInstances[currentUserId].close();
  }
  
  currentUserId = null;
}

export default {
  getUserDB,
  getCurrentDB,
  setCurrentUser,
  initializeUserDatabase,
  handleUserLogout,
  closeAllDatabases,
  DoryDatabase
}; 