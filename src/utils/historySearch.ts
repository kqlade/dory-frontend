/**
 * @file historySearch.ts
 * 
 * Service for querying the Chrome browser history API
 * and transforming results into the application's format.
 */

import { SearchResult, PageRecord } from '../types';
import { shouldRecordHistoryEntry } from './urlUtils';
import { SEARCH_CONFIG } from '../config';
import { HybridSearchProvider } from './hybridSearchProvider';

// Type to represent a history item with all the necessary fields
interface HistoryItem {
  id: string;
  url: string;
  title: string;
  lastVisitTime?: number;
  visitCount?: number;
  typedCount?: number;
}

/**
 * Service for searching browser history and transforming results
 * into the application's standard format.
 */
class HistorySearchService {
  // Cache for history items to avoid repeated API calls
  private historyCache: HistoryItem[] = [];
  // Fuzzy search provider for typo-tolerant search
  private searchProvider: HybridSearchProvider | null = null;
  // Flag to track if initializing
  private isInitializing = false;

  constructor() {
    // Initialize the history cache asynchronously
    this.initializeCache();
  }

  /**
   * Initialize the history cache and search provider
   */
  private async initializeCache(): Promise<void> {
    if (this.isInitializing) return;
    this.isInitializing = true;

    try {
      console.log('[HistorySearch] Initializing history cache...');
      
      // Get history items from Chrome
      const historyItems = await chrome.history.search({
        text: '', // Empty query returns all history
        maxResults: 1000, // Limit to reasonable number
        startTime: 0, // Search entire history
      });

      // Filter and transform the history items
      this.historyCache = historyItems
        .filter(item => shouldRecordHistoryEntry(item.url, item.title, 'cacheInit'))
        .map(item => ({
          id: item.url!,
          url: item.url!,
          title: item.title || item.url!,
          lastVisitTime: item.lastVisitTime,
          visitCount: item.visitCount,
          typedCount: item.typedCount,
        }));

      // Convert history items to PageRecord format for the search provider
      const pageRecords: PageRecord[] = this.historyCache.map(item => {
        const url = new URL(item.url);
        return {
          pageId: item.id,
          title: item.title,
          url: item.url,
          domain: url.hostname,
          content: '', // Empty content is fine for fuzzy title/url search
          visitCount: item.visitCount || 0,
          personalScore: 0.5,
          firstVisit: item.lastVisitTime || Date.now(),
          lastVisit: item.lastVisitTime || Date.now(),
          totalActiveTime: 0,
          syncStatus: 'synced', // Lowercase to match the type definition
          updatedAt: Date.now()
        };
      });

      // Initialize the search provider with the page records
      this.searchProvider = new HybridSearchProvider(
        pageRecords, 
        { fuzzyMatchThreshold: 70 }
      );

      console.log(`[HistorySearch] Cache initialized with ${this.historyCache.length} items`);
    } catch (error) {
      console.error('[HistorySearch] Error initializing cache:', error);
    } finally {
      this.isInitializing = false;
    }
  }

  /**
   * Queries the browser's history using chrome.history.search
   * and maps the results to the SearchResult interface.
   * Enhanced with fuzzy search capabilities for typo tolerance.
   *
   * @param query The search string entered by the user.
   * @returns A promise resolving to an array of SearchResult.
   */
  async searchHistory(query: string): Promise<SearchResult[]> {
    if (!query || query.trim().length === 0) {
      return [];
    }

    console.log(`[HistorySearch] Searching for: "${query}"`);

    try {
      // First try Chrome's built-in search
      const historyItems = await chrome.history.search({
        text: query,
        maxResults: SEARCH_CONFIG.MAX_HISTORY_RESULTS,
        startTime: 0, // Search entire history
      });

      console.log(`[HistorySearch] Found ${historyItems.length} items from chrome.history`);

      // Apply comprehensive filtering 
      const exactResults = historyItems
        .filter(item => shouldRecordHistoryEntry(item.url, item.title, 'searchHistoryAPI'))
        .map(item => ({
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

      // If we have enough exact matches, return them without fuzzy search
      if (exactResults.length >= 5) {
        return exactResults;
      }

      // Otherwise, try fuzzy matching
      if (this.searchProvider) {
        const fuzzyResults = this.searchProvider.search(query, 10);
        
        console.log(`[HistorySearch] Found ${fuzzyResults.length} items with fuzzy search`);
        
        // Transform to application's SearchResult format
        const fuzzySearchResults = fuzzyResults.map(result => ({
          id: result.page.url,
          url: result.page.url,
          title: result.page.title,
          source: 'history_fuzzy',
          // Scale the score (0.5-1.0 range)
          score: 0.5 + (result.score * 0.5),
          isFuzzyMatch: true,
          matchType: result.matchType,
          // Find and add history-specific fields if available
          ...this.getHistoryMetadata(result.page.url),
        }));
        
        // Combine results, prioritizing exact matches
        return this.mergeSearchResults(exactResults, fuzzySearchResults);
      }

      return exactResults;
    } catch (error) {
      console.error('[HistorySearch] Error searching history:', error);
      return []; // Return empty array on error
    }
  }

  /**
   * Get history metadata for a URL if available
   */
  private getHistoryMetadata(url: string): Partial<SearchResult> {
    const historyItem = this.historyCache.find(item => item.url === url);
    if (historyItem) {
      return {
        lastVisitTime: historyItem.lastVisitTime,
        visitCount: historyItem.visitCount,
        typedCount: historyItem.typedCount,
      };
    }
    return {};
  }

  /**
   * Merge exact and fuzzy search results, removing duplicates
   */
  private mergeSearchResults(
    exactResults: SearchResult[],
    fuzzyResults: SearchResult[]
  ): SearchResult[] {
    // Create a set of URLs already in exact results
    const exactUrls = new Set(exactResults.map(item => item.url));
    
    // Filter out fuzzy results that are already in exact results
    const uniqueFuzzyResults = fuzzyResults.filter(item => !exactUrls.has(item.url));
    
    // Combine and sort by score
    const combinedResults = [...exactResults, ...uniqueFuzzyResults];
    combinedResults.sort((a, b) => b.score - a.score);
    
    return combinedResults.slice(0, SEARCH_CONFIG.MAX_LOCAL_RESULTS);
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