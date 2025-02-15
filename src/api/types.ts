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
export interface DocumentIngestionRequest {
  title?: string;
  url?: string;
  fullText: string;
  chunks?: string[];
  metadata?: any;
}

export interface DocumentResponse {
  docId: string;
  message: string;
}

export interface DocumentRecord {
  docId: string;
  title?: string;
  url?: string;
  fullText: string;
  metadata?: any;
  version?: number;
  createdAt: number;
  updatedAt?: number;
}

export interface SearchResult {
  score: number;
  chunkId: string;
  metadata: {
    chunkText: string;
    title?: string;
    url?: string;
    visitedAt?: string;
    lastModified?: string;
    docId: string;
    [key: string]: any;
  };
}

// Generic API error
export interface ApiError {
  status: number;
  message: string;
  details?: any;
}