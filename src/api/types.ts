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

// Generic API error
export interface ApiError {
  status: number;
  message: string;
  details?: any;
}