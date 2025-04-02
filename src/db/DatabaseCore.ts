/**
 * @file DatabaseCore.ts
 * 
 * Core database foundation for the Dory extension.
 * Provides a Dexie database implementation with user isolation
 * and centralized database instance management.
 */

import Dexie from 'dexie';
import {
  PageRecord,
  VisitRecord,
  EdgeRecord,
  BrowsingSession,
  EventRecord,
  MetadataRecord,
  DoryDatabaseTables
} from '../types';
import { STORAGE_KEYS } from '../config';

/**
 * The main Dory database class.
 * Extends Dexie to provide a strongly-typed database with the tables we need.
 */
export class DoryDatabase extends Dexie implements DoryDatabaseTables {
  // Table declarations - these get their types from DoryDatabaseTables
  pages!: Dexie.Table<PageRecord, string>;
  visits!: Dexie.Table<VisitRecord, string>;
  edges!: Dexie.Table<EdgeRecord, number>;
  sessions!: Dexie.Table<BrowsingSession, number>;
  events!: Dexie.Table<EventRecord, number>;
  metadata!: Dexie.Table<MetadataRecord, string>;

  constructor(userId: string) {
    // Each user gets their own database
    super(`dory_${userId}`);
    
    // Database schema - using latest version only
    this.version(1).stores({
      pages: `
        pageId,
        url,
        domain,
        lastVisit,
        visitCount,
        personalScore,
        syncStatus,
        updatedAt
      `,
      edges: `
        edgeId,
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
      sessions: `
        sessionId,
        startTime,
        endTime,
        lastActivityAt,
        totalActiveTime,
        isActive
      `,
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
      events: `
        eventId,
        operation,
        sessionId,
        timestamp,
        loggedAt
      `,
      metadata: `
        key,
        updatedAt
      `
    });
  }
}

/**
 * Central manager for database instances.
 * Handles multiple user databases and tracks the current active user.
 */
export class DatabaseManager {
  // Store database instances by user ID
  private static instances: Map<string, DoryDatabase> = new Map();
  private static currentUserId: string | null = null;
  
  /**
   * Get a database instance for a specific user
   * @param userId The user's ID
   * @returns A DoryDatabase instance for that user
   */
  static getUserDatabase(userId: string): DoryDatabase {
    if (!this.instances.has(userId)) {
      this.instances.set(userId, new DoryDatabase(userId));
    }
    return this.instances.get(userId)!;
  }
  
  /**
   * Get the database for the current user
   * @returns The current user's database, or null if no user is set
   */
  static getCurrentDatabase(): DoryDatabase | null {
    if (!this.currentUserId) return null;
    return this.getUserDatabase(this.currentUserId);
  }
  
  /**
   * Set the current active user
   * @param userId The user's ID
   */
  static setCurrentUser(userId: string): void {
    this.currentUserId = userId;
  }
  
  /**
   * Get the current user's ID
   * @returns The current user's ID, or null if not set
   */
  static getCurrentUserId(): string | null {
    return this.currentUserId;
  }
  
  /**
   * Close a user's database
   * @param userId The user's ID
   */
  static closeDatabase(userId: string): void {
    const db = this.instances.get(userId);
    if (db) {
      db.close();
      this.instances.delete(userId);
    }
  }
  
  /**
   * Close all database instances
   */
  static closeAllDatabases(): void {
    this.instances.forEach(db => db.close());
    this.instances.clear();
  }
}

// Track initialization state
let dbInitializationComplete = false;
let dbInitializationPromise: Promise<void> | null = null; // Track initialization promise

/**
 * Initialize the database system for the current user.
 * Ensures Dexie's open() is called and handles potential errors.
 * @returns A promise that resolves when initialization is complete or rejects on error.
 */
export function initializeDatabase(): Promise<void> {
  // If initialization is already in progress, return the existing promise
  if (dbInitializationPromise) {
    return dbInitializationPromise;
  }

  // Start a new initialization process
  dbInitializationPromise = (async () => {
    console.log('[DatabaseCore] Initializing database system...');
    dbInitializationComplete = false; // Reset flag

    try {
      // Get user data from storage (assuming authService already populated this)
      const data = await chrome.storage.local.get([STORAGE_KEYS.AUTH_STATE]);
      const userId = data[STORAGE_KEYS.AUTH_STATE]?.user?.id;

      if (!userId) {
        console.log('[DatabaseCore] No user ID found in storage. Cannot initialize database.');
        dbInitializationComplete = false;
        dbInitializationPromise = null; // Reset promise for next attempt
        // No need to throw here, let the caller handle the unauthenticated state
        return; 
      }

      console.log(`[DatabaseCore] Setting current user: ${userId}`);
      DatabaseManager.setCurrentUser(userId);

      // Get the database instance (creates if needed)
      const db = DatabaseManager.getUserDatabase(userId);

      // *** Explicitly open the database to ensure it's ready ***
      // Dexie's methods often open implicitly, but explicit open catches immediate errors.
      await db.open(); 
      console.log(`[DatabaseCore] Database connection opened successfully for user ${userId}.`);

      // Mark initialization as complete *only after* successful open
      dbInitializationComplete = true;
      console.log('[DatabaseCore] Database system initialization complete.');

    } catch (error) {
      console.error('[DatabaseCore] Failed to initialize database:', error);
      dbInitializationComplete = false;
      DatabaseManager.setCurrentUser(''); // Clear current user on failure
      dbInitializationPromise = null; // Reset promise
      throw error; // Re-throw the error to signal failure
    }
  })();

  return dbInitializationPromise;
}

/**
 * Check if the database is initialized and ready.
 * @returns True if database initialization is complete and successful.
 */
export function isDatabaseInitialized(): boolean {
  // Also check if the current user ID is set, as DB is user-specific
  return dbInitializationComplete && !!DatabaseManager.getCurrentUserId();
}

// Export default object (optional, based on preference)
export default {
  DoryDatabase,
  DatabaseManager,
  initializeDatabase,
  isDatabaseInitialized
};
