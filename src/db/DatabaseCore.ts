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

/**
 * Initialize the database system
 * @returns A promise that resolves when initialization is complete
 */
export async function initializeDatabase(): Promise<void> {
  console.log('[DatabaseCore] Initializing database system...');
  
  try {
    // Get user data from storage
    const data = await chrome.storage.local.get(['user']);
    const userId = data.user?.id;
    
    // If we have a user, set them as current
    if (userId) {
      console.log(`[DatabaseCore] Setting current user: ${userId}`);
      DatabaseManager.setCurrentUser(userId);
      
      // Pre-initialize the database
      DatabaseManager.getUserDatabase(userId);
    } else {
      console.log('[DatabaseCore] No user found, database will be initialized when user logs in');
    }
    
    console.log('[DatabaseCore] Database system initialized');
  } catch (error) {
    console.error('[DatabaseCore] Failed to initialize database:', error);
    throw error;
  }
}

// Export default object for convenience
export default {
  DoryDatabase,
  DatabaseManager,
  initializeDatabase
};
