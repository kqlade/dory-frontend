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
        const filteredResults = results.filter(result => result.score >= 0.25);
        
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
 * - Single Enter always performs local search.
 * - Double Enter triggers a one-off semantic search via performSemanticSearch.
 */
export function useHybridSearch() {
  const [inputValue, setInputValue] = useState('');
  const [debouncedQuery] = useDebounce(inputValue, 1000); // For potential future use? Or remove?
  const [immediateQuery, setImmediateQuery] = useState(''); // For triggering local search on Enter

  // State specifically for semantic search results and loading state
  const [semanticSearchResults, setSemanticSearchResults] = useState<SearchResult[]>([]);
  const [isSemanticSearching, setIsSemanticSearching] = useState(false);
  const [semanticError, setSemanticError] = useState<Error | null>(null);

  // Determine which query string is used for local search triggering
  const localSearchQuery = immediateQuery || inputValue; // Use immediateQuery if set, else current input

  // --- Local Search ---
  const {
    data: localResults = [],
    isLoading: isLocalLoading,
  } = useLocalSearch(localSearchQuery); // Use the combined query trigger

  // --- Semantic Search Function ---
  const performSemanticSearch = useCallback(async (query: string) => {
    if (!query || query.length < 2) {
      setSemanticSearchResults([]);
      return;
    }

    setIsSemanticSearching(true);
    setSemanticError(null);
    setSemanticSearchResults([]); // Clear previous semantic results

    try {
      const userId = await getCurrentUserId();
      if (!userId) {
        throw new Error('User not authenticated for semantic search.');
      }

      const response = await semanticSearch(query, userId, {
        limit: 20,
        useHybridSearch: true,
        useLLMExpansion: true,
        useReranking: true,
      });

      const results = response as SearchResponse;
      const filteredResults = results.filter(result => result.score >= 0.25);

      const formattedResults = filteredResults.map((result: ApiSearchResult) => ({
        id: result.docId,
        pageId: result.pageId,
        title: result.title,
        url: result.url,
        score: result.score,
        explanation: result.explanation,
        source: 'semantic',
      }));
      setSemanticSearchResults(formattedResults);

    } catch (error) {
      console.error('[Semantic Search] performSemanticSearch Error:', error);
      setSemanticError(error as Error);
      setSemanticSearchResults([]); // Clear results on error
    } finally {
      setIsSemanticSearching(false);
    }
  }, []); // Depends only on getCurrentUserId and semanticSearch

  // --- Trigger Local Search (on Enter) ---
  const handleEnterKey = useCallback((value: string) => {
    // Set immediateQuery to trigger the useLocalSearch hook immediately
    setImmediateQuery(value);
    // Clear semantic results when triggering a new local search
    setSemanticSearchResults([]);
    setSemanticError(null);
  }, []);

  // Reset immediateQuery once the input value catches up (avoids re-triggering)
  // Or simply when input changes
   useEffect(() => {
     if (immediateQuery) {
       setImmediateQuery('');
     }
   }, [inputValue]); // Reset when input changes after Enter


  return {
    inputValue,
    setInputValue,
    handleEnterKey, // Triggers local search
    isSearching: isLocalLoading, // Loading state for local search
    localResults, // Always return local results
    performSemanticSearch, // Function to trigger semantic search
    isSemanticSearching, // Loading state for semantic search
    semanticSearchResults, // Results from the last semantic search
    semanticError, // Error object from semantic search
    // REMOVED: results, semanticEnabled, toggleSemanticSearch, isComplete
  };
}