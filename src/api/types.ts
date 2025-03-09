/**
 * src/api/types.ts
 *
 * Define request/response shapes and error types.
 */

// Search result types
export interface SearchResult {
  docId: string;
  chunkText: string;
  isHighlighted: boolean;
  metadata: {
    url: string;
    title: string;
    visitedAt: number;
    processedAt?: number;
    status?: string;
    chunkIndex?: number;
    totalChunks?: number;
  };
  score?: number;
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

export interface SearchResponse {
  results: SearchResult[];
  totalResults: number;
  metadata?: {
    total: number;
    query: {
      original: string;
      dense?: string;
      sparse?: string;
      filters?: Record<string, any>;
    };
    timing?: {
      total_ms: number;
      expansion_ms?: number;
      embedding_ms?: number;
      search_ms?: number;
      reranking_ms?: number;
    };
    search_type?: string;
    reranking_applied?: boolean;
  };
}

export interface SearchRequest {
  query: string;
  limit?: number;
  offset?: number;
  filters?: {
    startDate?: number;
    endDate?: number;
    domains?: string[];
  };
}

// API Error type
export class ApiError extends Error {
  status: number;
  
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

// Event streaming types
export enum EventType {
  SESSION_STARTED = 'SESSION_STARTED',
  PAGE_VISIT_STARTED = 'PAGE_VISIT_STARTED',
  CONTENT_EXTRACTED = 'CONTENT_EXTRACTED',
  PAGE_VISIT_ENDED = 'PAGE_VISIT_ENDED',
  ACTIVE_TIME_UPDATED = 'ACTIVE_TIME_UPDATED',
  SESSION_ENDED = 'SESSION_ENDED'
}

export interface DoryEvent {
  operation: EventType | string;
  sessionId: string;
  userId?: string;    // Optional to handle not-yet-authenticated state
  userEmail?: string; // Optional to handle not-yet-authenticated state
  timestamp: number;
  data: Record<string, any>;
}

export interface SessionStartedData {
  browser: {
    name: string;
    platform: string;
  };
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
  url?: string;  // Optional URL for the page
  content: {
    extracted: boolean;
    title: string;
    markdown: string;
    metadata: Record<string, any>;
  };
}

export interface PageVisitEndedData {
  pageId: string;
  visitId: string;
}

export interface ActiveTimeUpdatedData {
  pageId: string;
  visitId: string;
  duration: number;
  isActive: boolean;
}

export interface SessionEndedData {
  totalActiveTime: number;
  duration: number;
}