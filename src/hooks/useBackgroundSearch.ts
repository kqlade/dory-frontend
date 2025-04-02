/**
 * @file useBackgroundSearch.ts
 *
 * React hook for searching via the background API.
 * Provides a unified interface for local, semantic, and hybrid search.
 */

import { useState, useCallback } from 'react';
import { getBackgroundAPI } from '../utils/comlinkSetup';
import type { BackgroundAPI, SearchServiceAPI, EventServiceAPI } from '../types';
import type { SearchResult } from '../types';
import type { SearchOptions } from '../services/searchService';

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

  const searchSemantic = useCallback(
    async (query: string, options?: SearchOptions): Promise<SearchResult[]> => {
      if (!query.trim()) return [];

      try {
        const api = await getBackgroundAPI<BackgroundAPI>();
        // Use the proxy objects directly without awaiting them
        const results = await api.search.searchSemantic(query, options);
        await api.events.trackSearchPerformed(query, results.length, 'semantic');

        return results;
      } catch (error) {
        console.error('[useBackgroundSearch] Semantic search error:', error);
        return [];
      }
    },
    []
  );

  const searchHybrid = useCallback(
    async (
      query: string,
      options?: SearchOptions
    ): Promise<{ localResults: SearchResult[]; semanticResults: SearchResult[] }> => {
      if (!query.trim()) return { localResults: [], semanticResults: [] };

      try {
        const api = await getBackgroundAPI<BackgroundAPI>();
        // Use the proxy objects directly without awaiting them
        const results = await api.search.searchHybrid(query, options);
        const total = results.localResults.length + results.semanticResults.length;

        await api.events.trackSearchPerformed(query, total, 'hybrid');

        return results;
      } catch (error) {
        console.error('[useBackgroundSearch] Hybrid search error:', error);
        return { localResults: [], semanticResults: [] };
      }
    },
    []
  );

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
    searchSemantic,
    searchHybrid,
    trackResultClick,
    searchSessionId,
  };
}