/**
 * @file searchService.ts
 * 
 * Service for performing search operations across different sources.
 * Combines local browser history search and local database ranking.
 */

import { SEARCH_CONFIG } from '../config';
import { SearchResult } from '../types';
import { historySearchService } from '../utils/historySearch';
import { localRanker } from '../utils/localDoryRanking';

/**
 * SearchService provides methods for searching across different sources.
 * It orchestrates calls to browser history and local database.
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
