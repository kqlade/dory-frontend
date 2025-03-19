// src/utils/useSearch.ts
import { useQuery } from '@tanstack/react-query';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useDebounce } from 'use-debounce';
import { localRanker } from '../services/localDoryRanking';
import { semanticSearch } from '../api/client';
import { getCurrentUserId } from '../services/userService';
import { SearchResponse } from '../api/types'; // Import the updated type

/** Standard search result interface shared across all search methods */
interface SearchResult {
  id: string;
  pageId?: string;
  title: string;
  url: string;
  score: number;
  source?: string;
  explanation?: string;
}

/** API result from the /api/search endpoint */
interface ApiSearchResult {
  docId: string;
  pageId: string;
  title: string;
  url: string;
  score: number;
  explanation?: string;
}

/**
 * Local search hook (always active) to provide immediate results.
 */
export function useLocalSearch(query: string) {
  return useQuery({
    queryKey: ['local-search', query],
    queryFn: async () => {
      if (!query || query.length < 2) return [];

      await localRanker.initialize();
      const results = await localRanker.rank(query);

      return results.map(r => ({
        id: r.pageId,
        title: r.title,
        url: r.url,
        score: r.score,
        source: 'local',
      }));
    },
    enabled: query.length >= 2,
  });
}

/**
 * Semantic search hook using the REST API endpoint.
 */
export function useSemanticSearch(query: string, isEnabled: boolean) {
  // State to store the real user ID
  const [userId, setUserId] = useState<string | null>(null);
  
  // Get the actual user ID on component mount
  useEffect(() => {
    const fetchUserId = async () => {
      const id = await getCurrentUserId();
      setUserId(id);
    };
    fetchUserId();
  }, []);

  return useQuery({
    queryKey: ['semantic-search', query, userId], // Include userId in cache key
    queryFn: async () => {
      if (!query || query.length < 2) return [];
      if (!userId) return []; // Don't perform search if no user ID

      try {
        const response = await semanticSearch(query, userId, {
          limit: 20,
          useHybridSearch: true,
          useLLMExpansion: true,
          useReranking: true,
        });

        // Updated: Handle the new array-based response format
        // The response is now directly an array of search results
        const results = response as SearchResponse;
        
        // Filter out results with scores below the threshold (0.55)
        const filteredResults = results.filter(result => result.score >= 0.55);
        
        console.log(`[Search] Filtered ${results.length - filteredResults.length} low-scoring results`);

        return filteredResults.map((result: ApiSearchResult) => ({
          id: result.docId,
          pageId: result.pageId,
          title: result.title,
          url: result.url,
          score: result.score,
          explanation: result.explanation,
          source: 'semantic',
        }));
      } catch (error) {
        console.error('[Semantic Search] Error:', error);
        throw error;
      }
    },
    enabled: isEnabled && query.length >= 2 && !!userId, // Only enable if we have a userId
    refetchOnWindowFocus: false,
    retry: 1,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Main hook combining local and semantic search with the ability to toggle modes.
 */
export function useHybridSearch() {
  const [inputValue, setInputValue] = useState('');
  const [debouncedQuery] = useDebounce(inputValue, 1000);
  const [immediateQuery, setImmediateQuery] = useState('');
  const [semanticEnabled, setSemanticEnabled] = useState(false);

  // Determine which query string is actually used for semantic search
  const searchQuery = immediateQuery || debouncedQuery;

  // Local search (always enabled)
  const {
    data: localResults = [],
    isLoading: isLocalLoading,
  } = useLocalSearch(inputValue);

  // Semantic search (enabled only when toggled on)
  const {
    data: semanticResults = [],
    isLoading: isSemanticLoading,
    isError: isSemanticError,
  } = useSemanticSearch(searchQuery, semanticEnabled);

  // Merge local and semantic results if semantic is enabled
  const results = useMemo(() => {
    if (semanticEnabled) {
      // Only return semantic results when semantic search is enabled
      return semanticResults;
    }
    // Return local results when semantic search is disabled
    return localResults;
  }, [localResults, semanticResults, semanticEnabled]);

  // Combined loading state
  const isSearching = semanticEnabled
    ? isLocalLoading || isSemanticLoading
    : isLocalLoading;

  // Completion state for the search
  const isComplete = semanticEnabled
    ? !isSemanticLoading && !isSemanticError
    : true;

  // Trigger immediate search (e.g., on pressing Enter)
  const handleEnterKey = useCallback((value: string) => {
    setImmediateQuery(value);
  }, []);

  // Toggle semantic search on/off
  const toggleSemanticSearch = useCallback(() => {
    setSemanticEnabled(prev => !prev);
  }, []);

  // Reset immediateQuery once debounce matches
  useEffect(() => {
    if (immediateQuery && immediateQuery === debouncedQuery) {
      setImmediateQuery('');
    }
  }, [immediateQuery, debouncedQuery]);

  return {
    inputValue,
    setInputValue,
    handleEnterKey,
    isSearching,
    isComplete,
    results,
    semanticEnabled,
    toggleSemanticSearch,
  };
}