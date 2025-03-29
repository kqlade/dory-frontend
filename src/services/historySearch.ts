import { UnifiedLocalSearchResult } from '../types/search';
import { shouldRecordHistoryEntry } from '../utils/urlUtils';

const MAX_HISTORY_RESULTS = 100; // Max results to request from chrome.history

/**
 * Queries the browser's history using chrome.history.search
 * and maps the results to the UnifiedLocalSearchResult interface.
 *
 * @param query The search string entered by the user.
 * @returns A promise resolving to an array of UnifiedLocalSearchResult.
 */
export async function searchHistoryAPI(query: string): Promise<UnifiedLocalSearchResult[]> {
  if (!query || query.trim().length === 0) {
    return [];
  }

  console.log(`[HistorySearch] Querying chrome.history for: "${query}"`);

  try {
    const historyItems = await chrome.history.search({
      text: query,
      maxResults: MAX_HISTORY_RESULTS,
      startTime: 0, // Search entire history
    });

    console.log(`[HistorySearch] Found ${historyItems.length} items from chrome.history`);

    // Apply comprehensive filtering using the utility function
    const filteredItems = historyItems.filter(item =>
      shouldRecordHistoryEntry(item.url, item.title, 'searchHistoryAPI')
    );

    console.log(`[HistorySearch] Filtered down to ${filteredItems.length} items`);

    const results: UnifiedLocalSearchResult[] = filteredItems.map(item => ({
      id: item.url!, // Use URL as ID for history items
      url: item.url!,
      title: item.title!,
      source: 'history',
      score: 1, // Add default score for history items
      // Dexie fields are undefined for history source
      // dexieScore field was removed from UnifiedLocalSearchResult
      explanation: undefined,
      pageId: undefined,
      // History fields
      lastVisitTime: item.lastVisitTime,
      visitCount: item.visitCount,
      typedCount: item.typedCount,
    }));

    return results;

  } catch (error) {
    console.error('[HistorySearch] Error querying chrome.history:', error);
    return []; // Return empty array on error
  }
} 