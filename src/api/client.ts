/**
 * src/api/client.ts
 *
 * Main API client for your extension.
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
    EmbeddingResponse
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