/**
 * src/api/types.ts
 *
 * Define request/response shapes and error types.
 */

// Embedding request/response
export interface EmbeddingRequest {
  texts: string[];
}

export interface EmbeddingResponse {
  embeddings: number[][];
}

// New document storage types (from backendGuide.md)
export interface DocumentMetadata {
  url: string;
  title: string;
  visitedAt: number;
  processedAt: number;
  status: 'processed' | 'failed';
}

export interface DocumentIngestionRequest {
  fullText: string;
  chunks?: string[];
  metadata: DocumentMetadata;
}

export interface DocumentResponse {
  docId: string;
  message: string;
}

export interface DocumentRecord {
  docId: string;
  fullText: string;
  metadata: DocumentMetadata;
  version?: number;
  createdAt: number;
  updatedAt?: number;
}

export interface SearchResult {
  contentId: string;
  finalScore: number;
  explanation: string;
  isHighlighted: boolean;
  metadata: {
    chunkText: string;
    title: string;
    url: string;
    visitedAt: number;
    snippet: string;
    docId: string;
  };
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
  result: {
    topResults: SearchResult[];
    reasoning: string;
  };
  debug: SearchDebugInfo;
}

// Generic API error
export interface ApiError {
  status: number;
  message: string;
  details?: any;
}