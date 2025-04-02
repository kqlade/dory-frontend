/**
 * @file useBackgroundSearch.ts
 * 
 * React hook for searching via the background API
 * Provides a unified interface for local, semantic, and hybrid search
 */

import { useState, useCallback } from 'react';
import { getBackgroundAPI } from '../utils/comlinkSetup';
import type { BackgroundAPI } from '../background/api';
import { SearchResult } from '../types';
import { SearchOptions } from '../services/searchService';

/**
 * Hook for accessing search functionality from the background API
 * @returns Search methods and event tracking
 */
export function useBackgroundSearch() {
  // Generate a unique search session ID for tracking
  const [searchSessionId] = useState<string>(`search_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`);

  
  /**
   * Perform a local search using the background API
   * @param query The search query
   * @returns Promise resolving to search results
   */
  const searchLocal = useCallback(async (query: string): Promise<SearchResult[]> => {
    if (!query || query.trim().length === 0) {
      return [];
    }
    
    try {
      const api = getBackgroundAPI<BackgroundAPI>();
      const searchService = await api.search;
      const results = await searchService.searchLocal(query);
      
      // Track this search
      const eventService = await api.events;
      await eventService.trackSearchPerformed(
        query, 
        results.length, 
        'local'
      );
      
      return results;
    } catch (error) {
      console.error('[useBackgroundSearch] Local search error:', error);
      return [];
    }
  }, []);
  
  
  /**
   * Perform a semantic search using the background API
   * @param query The search query
   * @param options Optional search options
   * @returns Promise resolving to search results
   */
  const searchSemantic = useCallback(async (query: string, options?: SearchOptions): Promise<SearchResult[]> => {
    if (!query || query.trim().length === 0) {
      return [];
    }
    
    try {
      const api = getBackgroundAPI<BackgroundAPI>();
      const searchService = await api.search;
      const results = await searchService.searchSemantic(query, options);
      
      // Track this semantic search
      const eventService = await api.events;
      await eventService.trackSearchPerformed(
        query, 
        results.length, 
        'semantic'
      );
      
      return results;
    } catch (error) {
      console.error('[useBackgroundSearch] Semantic search error:', error);
      return [];
    }
  }, []);
  
  /**
   * Perform a hybrid search using the background API
   * @param query The search query
   * @param options Optional search options
   * @returns Promise resolving to both local and semantic results
   */
  const searchHybrid = useCallback(async (query: string, options?: SearchOptions) => {
    if (!query || query.trim().length === 0) {
      return { localResults: [], semanticResults: [] };
    }
    
    try {
      const api = getBackgroundAPI<BackgroundAPI>();
      const searchService = await api.search;
      const results = await searchService.searchHybrid(query, options);
      
      // Track this hybrid search
      const eventService = await api.events;
      await eventService.trackSearchPerformed(
        query, 
        results.localResults.length + results.semanticResults.length, 
        'hybrid'
      );
      
      return results;
    } catch (error) {
      console.error('[useBackgroundSearch] Hybrid search error:', error);
      return { localResults: [], semanticResults: [] };
    }
  }, []);

  /**
   * Track a search result click
   * @param resultId ID of the clicked result
   * @param position Position in the results list
   * @param url URL of the clicked result
   * @param query Search query that produced the result
   */
  const trackResultClick = useCallback(async (
    resultId: string,
    position: number,
    url: string,
    query: string
  ) => {
    try {
      const api = getBackgroundAPI<BackgroundAPI>();
      const eventService = await api.events;
      await eventService.trackSearchClick(
        searchSessionId,
        resultId,
        position,
        url,
        query
      );
    } catch (error) {
      console.error('[useBackgroundSearch] Error tracking result click:', error);
    }
  }, [searchSessionId]);
  
  return {
    searchLocal,
    searchSemantic,
    searchHybrid,
    trackResultClick,
    searchSessionId
  };
}
