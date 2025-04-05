/**
 * @file searchService.ts
 * 
 * Service for performing search operations across different sources.
 * Combines local browser history search, local database ranking,
 * and semantic search via the backend API.
 */

import { API_BASE_URL, SEARCH_ENDPOINTS, SEARCH_CONFIG } from '../config';
import { SearchResult, SearchResponse } from '../types';
import { authService } from './authService';
import { historySearchService } from '../utils/historySearch';
import { localRanker } from '../utils/localDoryRanking';

/**
 * Options for semantic search
 */
export interface SearchOptions {
  limit?: number;
  useHybridSearch?: boolean;
  useLLMExpansion?: boolean;
  useReranking?: boolean;
}

/**
 * SearchService provides methods for searching across different sources.
 * It orchestrates calls to browser history, local database, and backend API.
 */
class SearchService {
  /**
   * Performs a local search using browser history and local database.
   * 
   * @param query The search query
   * @returns Promise resolving to array of search results
   */
  async searchLocal(query: string): Promise<SearchResult[]> {
    if (!query || query.length < SEARCH_CONFIG.MIN_QUERY_LENGTH) {
      return [];
    }

    try {
      console.log(`[SearchService] Performing local search for: "${query}"`);
      
      // Fetch results from both sources in parallel
      const historyPromise = historySearchService.searchHistory(query);
      const dexiePromise = localRanker.rank(query);
      
      const [historyResults, dexieResults] = await Promise.all([historyPromise, dexiePromise]);
      
      // Merge and sort results
      return this.mergeAndSortResults(historyResults, dexieResults);
    } catch (error) {
      console.error('[SearchService] Error in local search:', error);
      return [];
    }
  }

  /**
   * Performs a semantic search via the backend API.
   * 
   * @param query The search query
   * @param options Search options
   * @returns Promise resolving to array of search results
   */
  async searchSemantic(
    query: string, 
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    if (!query || query.length < SEARCH_CONFIG.MIN_QUERY_LENGTH) {
      return [];
    }

    try {
      console.log(`[SearchService] Performing semantic search for: "${query}"`);
      
      const authState = await authService.getAuthState();
      if (!authState.isAuthenticated || !authState.user?.id) {
        console.warn('[SearchService] User not authenticated for semantic search');
        return [];
      }

      const userId = authState.user.id;
      
      // Create request body as JSON instead of URL parameters
      const requestBody = {
        query,
        userId,
        limit: options.limit || SEARCH_CONFIG.MAX_SEMANTIC_RESULTS,
        useHybridSearch: options.useHybridSearch !== false,
        useLLMExpansion: options.useLLMExpansion !== false,
        useReranking: options.useReranking !== false
      };

      const response = await fetch(`${API_BASE_URL}${SEARCH_ENDPOINTS.SEARCH}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authState.accessToken}`
        },
        credentials: 'include',
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        throw new Error(`Semantic search failed: ${response.statusText}`);
      }

      const semanticResults = await response.json() as SearchResponse;
      
      // Transform results and filter by minimum score threshold
      return semanticResults
        .map(result => ({
          id: result.id || `semantic-${result.pageId || result.url}`, // Ensure ID is never undefined
          pageId: result.pageId,
          title: result.title,
          url: result.url,
          score: result.score,
          source: 'semantic',
          explanation: result.explanation,
          snippet: result.snippet
        }))
        // Filter out results with scores below the minimum threshold
        .filter(result => result.score >= SEARCH_CONFIG.MIN_SEMANTIC_SCORE);
    } catch (error) {
      console.error('[SearchService] Error in semantic search:', error);
      return [];
    }
  }

  /**
   * Performs both local and semantic search, returning results from both.
   * 
   * @param query The search query
   * @param options Search options for semantic search
   * @returns Promise resolving to object containing both result sets
   */
  async searchHybrid(
    query: string, 
    options: SearchOptions = {}
  ): Promise<{
    localResults: SearchResult[],
    semanticResults: SearchResult[]
  }> {
    if (!query || query.length < SEARCH_CONFIG.MIN_QUERY_LENGTH) {
      return { localResults: [], semanticResults: [] };
    }

    try {
      // Run searches in parallel for better performance
      const [localResults, semanticResults] = await Promise.all([
        this.searchLocal(query),
        this.searchSemantic(query, options)
      ]);

      return { localResults, semanticResults };
    } catch (error) {
      console.error('[SearchService] Error in hybrid search:', error);
      return { localResults: [], semanticResults: [] };
    }
  }

  /**
   * Merges and sorts results from history API and local database.
   * Prioritizes local database results for items found in both sources.
   * 
   * @param historyResults Results from historySearchService
   * @param dexieResults Results from localRanker
   * @returns Merged and sorted array of SearchResult
   */
  private mergeAndSortResults(
    historyResults: SearchResult[],
    dexieResults: Array<{ pageId: string; title: string; url: string; score: number }>
  ): SearchResult[] {
    try {
      // Create a map for quick lookups of history results by URL
      const historyMap = new Map<string, SearchResult>();
      historyResults.forEach(item => {
        historyMap.set(item.url, item);
      });

      // Convert dexieResults to SearchResult format
      const dexieSearchResults: SearchResult[] = dexieResults.map(item => ({
        id: item.pageId,
        pageId: item.pageId,
        title: item.title,
        url: item.url,
        score: item.score,
        source: 'dexie'
      }));

      // Create a set of URLs already covered by dexieResults
      const dexieUrls = new Set(dexieResults.map(item => item.url));

      // Only include history results for URLs not already in dexieResults
      const uniqueHistoryResults = historyResults.filter(item => !dexieUrls.has(item.url));

      // Combine the results
      const combinedResults = [...dexieSearchResults, ...uniqueHistoryResults];

      // Sort by score descending (higher is better)
      combinedResults.sort((a, b) => b.score - a.score);

      // Limit results if needed
      return combinedResults.slice(0, SEARCH_CONFIG.MAX_LOCAL_RESULTS);
    } catch (error) {
      console.error('[SearchService] Error merging search results:', error);
      // In case of error, return whatever we have from history
      return historyResults.slice(0, SEARCH_CONFIG.MAX_LOCAL_RESULTS);
    }
  }
}

// Create and export a singleton instance
export const searchService = new SearchService();

// Default export for convenience
export default SearchService;
