/**
 * @file useBackgroundSearch.ts
 *
 * React hook for searching via the background API.
 * Provides interface for local search.
 */

import { useState, useCallback } from 'react';
import { getBackgroundAPI } from '../utils/comlinkSetup';
import type { BackgroundAPI } from '../types';
import type { SearchResult } from '../types';

export function useBackgroundSearch() {
  // Generate a unique search session ID for tracking
  const [searchSessionId] = useState<string>(
    `search_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
  );

  const searchLocal = useCallback(async (query: string): Promise<SearchResult[]> => {
    if (!query.trim()) return [];

    try {
      const api = await getBackgroundAPI<BackgroundAPI>();
      // Use the proxy objects directly without awaiting them
      const results = await api.search.searchLocal(query);

      try {
        await api.events.trackSearchPerformed(query, results.length, 'local');
      } catch (trackErr) {
        console.warn('[useBackgroundSearch] Failed to track local search:', trackErr);
      }

      return results;
    } catch (error) {
      console.error('[useBackgroundSearch] Local search error:', error);
      return [];
    }
  }, []);

  const trackResultClick = useCallback(
    async (resultId: string, position: number, url: string, query: string) => {
      try {
        const api = await getBackgroundAPI<BackgroundAPI>();
        // Use the proxy object directly without awaiting it
        await api.events.trackSearchClick(searchSessionId, resultId, position, url, query);
      } catch (error) {
        console.error('[useBackgroundSearch] Error tracking result click:', error);
      }
    },
    [searchSessionId]
  );

  return {
    searchLocal,
    trackResultClick,
    searchSessionId,
  };
}