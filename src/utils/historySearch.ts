/**
 * @file historySearch.ts
 * 
 * Service for querying the Chrome browser history API
 * and transforming results into the application's format.
 */

import { SearchResult } from '../types';
import { shouldRecordHistoryEntry } from './urlUtils';
import { SEARCH_CONFIG } from '../config';

/**
 * Service for searching browser history and transforming results
 * into the application's standard format.
 */
class HistorySearchService {
  /**
   * Queries the browser's history using chrome.history.search
   * and maps the results to the SearchResult interface.
   *
   * @param query The search string entered by the user.
   * @returns A promise resolving to an array of SearchResult.
   */
  async searchHistory(query: string): Promise<SearchResult[]> {
    if (!query || query.trim().length === 0) {
      return [];
    }

    console.log(`[HistorySearch] Querying chrome.history for: "${query}"`);

    try {
      const historyItems = await chrome.history.search({
        text: query,
        maxResults: SEARCH_CONFIG.MAX_HISTORY_RESULTS,
        startTime: 0, // Search entire history
      });

      console.log(`[HistorySearch] Found ${historyItems.length} items from chrome.history`);

      // Apply comprehensive filtering using the utility function
      const filteredItems = historyItems.filter(item =>
        shouldRecordHistoryEntry(item.url, item.title, 'searchHistoryAPI')
      );

      console.log(`[HistorySearch] Filtered down to ${filteredItems.length} items`);

      // Transform to application's SearchResult format
      return filteredItems.map(item => ({
        id: item.url!, // Use URL as ID for history items
        url: item.url!,
        title: item.title!,
        source: 'history',
        score: 1, // Default score for history items
        // History-specific fields
        lastVisitTime: item.lastVisitTime,
        visitCount: item.visitCount,
        typedCount: item.typedCount,
      }));
    } catch (error) {
      console.error('[HistorySearch] Error querying chrome.history:', error);
      return []; // Return empty array on error
    }
  }

  /**
   * Legacy method to maintain backward compatibility with existing code.
   * @deprecated Use searchHistory instead
   */
  async searchHistoryAPI(query: string): Promise<SearchResult[]> {
    return this.searchHistory(query);
  }
}

// Create and export a singleton instance
export const historySearchService = new HistorySearchService();

// Default export for convenience
export default HistorySearchService;

// Legacy export to maintain backward compatibility
export const searchHistoryAPI = historySearchService.searchHistory.bind(historySearchService); 