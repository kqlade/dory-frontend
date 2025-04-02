/**
 * @file database.ts
 * 
 * Type definitions for the Dory database system.
 * Contains interfaces for all database records and tables.
 */

import Dexie from 'dexie';

/**
 * Represents a web page in the database
 */
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
 * Represents a visit to a specific page
 */
export interface VisitRecord {
  visitId: string;
  pageId: string;
  sessionId: number;
  fromPageId?: string;
  startTime: number;
  endTime?: number;
  totalActiveTime: number;
  isBackNavigation?: boolean;
}

/**
 * Represents a navigation from one page to another
 */
export interface EdgeRecord {
  edgeId: number;
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
 * Represents a browsing session
 */
export interface BrowsingSession {
  sessionId: number;
  startTime: number;
  endTime?: number;
  lastActivityAt: number;
  totalActiveTime: number;
  isActive: boolean;
}

/**
 * Represents an event in the system
 */
export interface EventRecord {
  eventId: number;
  operation: string;
  sessionId: string;
  userId?: string;
  userEmail?: string;
  timestamp: number;
  data: any;
  loggedAt: number;
}

/**
 * Represents a metadata key-value pair
 */
export interface MetadataRecord {
  key: string;
  value: string;
  updatedAt: number;
}

/**
 * Interface for the Dory database tables
 */
export interface DoryDatabaseTables {
  pages: Dexie.Table<PageRecord, string>;
  visits: Dexie.Table<VisitRecord, string>;
  edges: Dexie.Table<EdgeRecord, number>;
  sessions: Dexie.Table<BrowsingSession, number>;
  events: Dexie.Table<EventRecord, number>;
  metadata: Dexie.Table<MetadataRecord, string>;
}
