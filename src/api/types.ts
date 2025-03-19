// src/api/types.ts

/**
 * Request/response shapes, errors, event types, etc.
 */

// Search result types
export interface SearchResult {
  docId: string;       // Document/content ID
  pageId: string;      // Page ID from the browser 
  title: string;
  url: string;
  score: number;       // Now required, not optional
  searchSessionId?: string;
  isHighlighted?: boolean;
  explanation?: string;
}

export interface SearchDebugInfo {
  parsedQuery: {
    metadata_filters: {
      domainFilter: string | null;
      visitedAfterDomain: string | null;
      lastNDays: number | null;
    };
    semantic_text: string;
    confidence: number;
    modelUsed: string;
    complexity: number;
  };
  totalChunksFound: number;
  performance: {
    total: number;
    parsing: number;
    filtering: number;
    vectorSearch: number;
    recheck: number;
  };
}

// Updated: Search response is now a simple array of SearchResult objects
export type SearchResponse = SearchResult[];

/**
 * Custom error class for API calls
 */
export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * Event Types
 */
export enum EventType {
  SESSION_STARTED = 'SESSION_STARTED',
  PAGE_VISIT_STARTED = 'PAGE_VISIT_STARTED',
  CONTENT_EXTRACTED = 'CONTENT_EXTRACTED',
  PAGE_VISIT_ENDED = 'PAGE_VISIT_ENDED',
  ACTIVE_TIME_UPDATED = 'ACTIVE_TIME_UPDATED',
  SESSION_ENDED = 'SESSION_ENDED',
  SEARCH_CLICK = 'SEARCH_CLICK',
}

/**
 * Generic Dory event shape
 */
export interface DoryEvent {
  operation: EventType | string;
  sessionId: string;
  userId?: string;
  userEmail?: string;
  timestamp: number;
  data: Record<string, any>;
}

/**
 * Example event-specific shapes (optional)
 */
export interface SessionStartedData {
  userAgent: string;
  platform: string;
  language: string;
}

export interface PageVisitStartedData {
  pageId: string;
  visitId: string;
  url: string;
  title: string;
  fromPageId?: string;
  isBackNavigation?: boolean;
}

export interface ContentExtractedData {
  pageId: string;
  visitId: string;
  userId: string;
  url?: string;
  content: {
    title: string;
    markdown: string;
    metadata?: {
      language?: string;
      [key: string]: any;
    };
  };
}

export interface PageVisitEndedData {
  pageId: string;
  visitId: string;
  toPageId?: string;
  timeSpent: number;
}

export interface ActiveTimeUpdatedData {
  pageId: string;
  visitId: string;
  duration: number;
  isActive: boolean;
}

export interface SessionEndedData {
  totalDuration: number;
  pagesVisited: number;
}

export interface SearchClickData {
  searchSessionId: string;
  pageId: string;
  url: string;
  query: string;
  position: number;
}