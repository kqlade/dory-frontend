// src/utils/useSearch.ts
import { useQuery } from '@tanstack/react-query';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useDebounce } from 'use-debounce';
import { semanticSearch } from '../api/client';
import { getCurrentUserId } from '../services/userService';
import { UnifiedLocalSearchResult } from '../types/search';
import { SearchResponse, SearchResult as ApiSearchResultType } from '../api/types';

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

// Define ApiSearchResult if it's specific to this file's usage
// Or ensure it's correctly exported/imported if defined elsewhere.
// Re-adding based on useSemanticSearch usage:
interface ApiSearchResult {
  docId: string;
  pageId: string;
  title: string;
  url: string;
  score: number;
  explanation?: string;
}

/**
 * Refactored local search hook using messaging to background script.
 */
export function useLocalSearch(query: string) {
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<UnifiedLocalSearchResult[]>([]);

  useEffect(() => {
    // Listener for results from the background script
    const messageListener = (message: any) => {
      if (message.type === 'SEARCH_RESULTS') {
        // Check if the results are intended for this hook instance?
        // For now, assume any SEARCH_RESULTS are for the current local search
        console.log(`[useLocalSearch] Received ${message.results?.length} results`);
        setResults(message.results || []);
        setIsLoading(false);
      }
    };

    chrome.runtime.onMessage.addListener(messageListener);

    // Cleanup listener on unmount or query change
    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
    };
  }, []); // Run listener setup only once

  useEffect(() => {
    // Perform search when query is valid
    if (query && query.length >= 2) {
      setIsLoading(true);
      setResults([]); // Clear previous results
      console.log(`[useLocalSearch] Sending PERFORM_LOCAL_SEARCH for: "${query}"`);
      try {
        chrome.runtime.sendMessage({
          type: 'PERFORM_LOCAL_SEARCH',
          query: query,
        });
        // isLoading will be set to false when results arrive
      } catch (error) {
        console.error('[useLocalSearch] Error sending message:', error);
        setIsLoading(false); // Stop loading on send error
        setResults([]);
      }
    } else {
      // Clear results if query is too short
      setResults([]);
      setIsLoading(false);
    }
    // Dependency array ensures this runs when query changes
  }, [query]);

  // Return data in a shape similar to useQuery for compatibility with useHybridSearch
  return {
    data: results,
    isLoading,
    // Add other fields if useHybridSearch expects them (e.g., isError)
    isError: false, // Placeholder, messaging errors handled internally
  };
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
        
        // Filter out results with scores below the threshold (0.25)
        const filteredResults = results.filter(result => result.score >= 0.25);
        
        console.log(`[Search] Filtered ${results.length - filteredResults.length} low-scoring results`);

        return filteredResults.map((result: ApiSearchResultType) => ({
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
  const [semanticSearchResults, setSemanticSearchResults] = useState<UnifiedLocalSearchResult[]>([]);
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

      // Map to UnifiedLocalSearchResult - ensure all required fields are present
      const formattedResults: UnifiedLocalSearchResult[] = filteredResults.map((result: ApiSearchResultType) => ({
        id: result.docId, // Use docId as ID
        pageId: result.pageId,
        title: result.title,
        url: result.url,
        score: result.score, // Mandatory score
        explanation: result.explanation,
        source: 'semantic', // Explicitly mark source
        // Optional history fields (lastVisitTime, visitCount, typedCount) are undefined here
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