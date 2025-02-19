/**
 * src/api/client.ts
 */

import {
    API_BASE_URL,
    ENDPOINTS,
    REQUEST_TIMEOUT,
    RETRY_ATTEMPTS,
    RETRY_DELAY
  } from './config';
  
  import {
    ApiError,
    EmbeddingRequest,
    EmbeddingResponse,
    DocumentIngestionRequest,
    DocumentResponse,
    DocumentRecord,
    SearchResult,
    DocumentMetadata,
    SearchResponse
  } from './types';
  
  /**
   * Helper: Delay for a given ms
   */
  function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Main API request function with timeout and retry logic
   */
  export async function apiRequest<T>(
    endpoint: string,
    init: RequestInit = {},
    attempt = 1
  ): Promise<T> {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  
    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          ...(init.headers || {})
        },
        signal: controller.signal
      });
      clearTimeout(id);
  
      if (!response.ok) {
        const errorText = await response.text();
        throw <ApiError>{
          status: response.status,
          message: errorText || 'Request failed',
          details: null
        };
      }
  
      return response.json() as Promise<T>;
  
    } catch (error: any) {
      clearTimeout(id);
  
      // Handle timeouts with retry
      if (error.name === 'AbortError') {
        if (attempt < RETRY_ATTEMPTS) {
          await delay(RETRY_DELAY);
          return apiRequest(endpoint, init, attempt + 1);
        }
        throw <ApiError>{
          status: 408,
          message: 'Request timed out after multiple attempts',
          details: error
        };
      }
  
      // If network or unknown error, retry
      if (attempt < RETRY_ATTEMPTS) {
        await delay(RETRY_DELAY);
        return apiRequest(endpoint, init, attempt + 1);
      }
  
      // Exhausted retries
      throw <ApiError>{
        status: error.status || 500,
        message: error.message || 'Unknown error',
        details: error.details || error
      };
    }
  }
  
  /**
   * Convenience helpers for common HTTP verbs
   */
  export async function apiGet<T>(endpoint: string): Promise<T> {
    return apiRequest<T>(endpoint, { method: 'GET' });
  }
  
  export async function apiPost<T>(endpoint: string, body: unknown): Promise<T> {
    return apiRequest<T>(endpoint, {
      method: 'POST',
      body: JSON.stringify(body)
    });
  }
  
  /**
   * Get embeddings from the backend
   */
  export async function getEmbeddings(texts: string[]): Promise<number[][]> {
    const payload: EmbeddingRequest = { texts };
    const response = await apiPost<EmbeddingResponse>(ENDPOINTS.EMBEDDINGS, payload);
    return response.embeddings;
  }
  
  /**
   * Store a full document
   */
  export async function sendFullDocument(
    fullText: string,
    metadata: DocumentMetadata
  ): Promise<string> {
    const payload: DocumentIngestionRequest = {
      fullText,
      metadata
    };
  
    const response = await apiPost<DocumentResponse>(ENDPOINTS.DOCUMENTS, payload);
    return response.docId;
  }
  
  /**
   * Splits documents into batches of appropriate size
   */
  function splitIntoBatches(documents: DocumentIngestionRequest[]): DocumentIngestionRequest[][] {
    const MAX_BATCH_SIZE = 100;
    const batches: DocumentIngestionRequest[][] = [];
    
    for (let i = 0; i < documents.length; i += MAX_BATCH_SIZE) {
      batches.push(documents.slice(i, i + MAX_BATCH_SIZE));
    }
    
    return batches;
  }
  
  /**
   * Batch store multiple documents
   * Handles batching limits:
   * - Maximum 100 documents per batch
   * - Each document must be under 300kb
   * - Maximum 10 batch requests per minute
   */
  export async function sendDocumentsBatch(
    documents: DocumentIngestionRequest[]
  ): Promise<Array<{ docId: string; success: boolean; error?: string }>> {
    // Validate document sizes
    const MAX_DOC_SIZE = 300 * 1024; // 300kb in bytes
    documents.forEach((doc, index) => {
      const docSize = new TextEncoder().encode(doc.fullText).length;
      if (docSize > MAX_DOC_SIZE) {
        throw new Error(`Document at index ${index} exceeds maximum size of 300kb`);
      }
    });

    // Split into batches of 100
    const batches = splitIntoBatches(documents);
    const results: Array<{ docId: string; success: boolean; error?: string }> = [];

    // Process each batch
    for (const batch of batches) {
      const response = await apiPost<{ results: Array<{ docId: string; success: boolean; error?: string }> }>(
        ENDPOINTS.DOCUMENTS_BATCH,
        { documents: batch }
      );
      results.push(...response.results);

      // If there are more batches, add a delay to respect rate limits
      if (batches.length > 1) {
        await delay(6000); // 6 second delay to stay under 10 requests per minute
      }
    }

    return results;
  }
  
  /**
   * Retrieve a stored document by ID
   */
  export async function getDocument(docId: string): Promise<DocumentRecord> {
    return apiGet<DocumentRecord>(`${ENDPOINTS.DOCUMENTS}/${docId}`);
  }
  
  /**
   * Perform semantic search
   */
  export async function semanticSearch(
    query: string, 
    topK: number = 5,
    options?: { enableTwoPassSystem?: boolean }
  ): Promise<SearchResponse> {
    const response = await apiPost<SearchResponse>(
      ENDPOINTS.ADVANCED_SEARCH,
      { 
        userQuery: query, 
        options
      }
    );
    return response;
  }
  
  /**
   * Health check function to test backend connectivity
   */
  export async function checkHealth(): Promise<boolean> {
    try {
      await apiGet(ENDPOINTS.HEALTH);
      return true;
    } catch (error) {
      console.error('Health check failed:', error);
      return false;
    }
  }