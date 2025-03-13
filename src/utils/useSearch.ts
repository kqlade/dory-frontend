// src/utils/useSearch.ts
import { useQuery } from '@tanstack/react-query';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useDebounce } from 'use-debounce';
import { localRanker } from '../services/localDoryRanking';
import { semanticSearch } from '../api/client';

/** Standard search result interface shared across all search methods */
interface SearchResult {
  id: string;
  title: string;
  url: string;
  score: number;
  source?: string;
  explanation?: string;
}

/** API Result from /api/search endpoint */
interface ApiSearchResult {
  docId: string;
  chunkText: string;
  metadata: {
    title?: string;
    url?: string;
    [key: string]: any;
  };
  score: number;
  explanation?: string;
}

/**
 * Local search hook - Always active to provide immediate results
 */
export function useLocalSearch(query: string) {
  return useQuery({
    queryKey: ['local-search', query],
    queryFn: async () => {
      if (!query || query.length < 2) return [];
      
      // Initialize the ranker and get results
      await localRanker.initialize();
      const results = await localRanker.rank(query);
      
      // Map to the standard result format
      return results.map(r => ({
        id: r.pageId,
        title: r.title,
        url: r.url,
        score: r.score,
        source: 'local'
      }));
    },
    enabled: query.length >= 2,
  });
}

/**
 * Semantic search using standard REST API
 */
export function useSemanticSearch(query: string, isEnabled: boolean) {
  return useQuery({
    queryKey: ['semantic-search', query],
    queryFn: async () => {
      if (!query || query.length < 2) return [];
      
      try {
        // Call the semantic search API
        const data = await semanticSearch(query, 'current-user-id', {
          limit: 20,
          useHybridSearch: true,
          useLLMExpansion: true,
          useReranking: true,
        });
        
        // Map API results to standard format
        return data.results.map((result: ApiSearchResult) => ({
          id: result.docId,
          title: result.metadata.title || result.chunkText.substring(0, 50) + '...',
          url: result.metadata.url || '',
          score: result.score,
          explanation: result.explanation,
          source: 'semantic'
        }));
      } catch (error) {
        console.error('[Semantic Search] Error:', error);
        throw error;
      }
    },
    enabled: isEnabled && query.length >= 2,
    refetchOnWindowFocus: false,
    retry: 1,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Main search hook that toggles between local-only and semantic search
 */
export function useHybridSearch() {
  // Search input and state
  const [inputValue, setInputValue] = useState('');
  const [debouncedQuery] = useDebounce(inputValue, 300);
  const [immediateQuery, setImmediateQuery] = useState('');
  const [semanticEnabled, setSemanticEnabled] = useState(false);

  // Determine the actual query to use
  const searchQuery = immediateQuery || debouncedQuery;
  
  // Local search - always run
  const { 
    data: localResults = [], 
    isLoading: isLocalLoading 
  } = useLocalSearch(inputValue);
  
  // Semantic search - only when enabled
  const { 
    data: semanticResults = [], 
    isLoading: isSemanticLoading,
    isError: isSemanticError
  } = useSemanticSearch(searchQuery, semanticEnabled);

  // Results based on mode
  const results = useMemo(() => {
    if (semanticEnabled && semanticResults.length > 0) {
      // When semantic search is enabled and has results, merge with local
      const combined = [...localResults, ...semanticResults];
      return combined.filter((result, index, self) => 
        index === self.findIndex(r => r.id === result.id)
      );
    } else {
      // Otherwise just use local results
      return localResults;
    }
  }, [localResults, semanticResults, semanticEnabled]);

  // Combined loading state
  const isSearching = semanticEnabled 
    ? (isLocalLoading || isSemanticLoading)
    : isLocalLoading;

  // Overall completion state
  const isComplete = semanticEnabled 
    ? !isSemanticLoading && !isSemanticError
    : true; // Local search is always "complete" when done loading

  // Handle immediate search (Enter key)
  const handleEnterKey = useCallback((value: string) => {
    setImmediateQuery(value);
  }, []);

  // Toggle between search modes
  const toggleSemanticSearch = useCallback(() => {
    setSemanticEnabled(prev => !prev);
  }, []);

  // Reset immediate query once debounce catches up
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
    toggleSemanticSearch
  };
}