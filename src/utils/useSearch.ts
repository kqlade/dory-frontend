// src/hooks/useSearch.ts
import { useQuery } from '@tanstack/react-query';
import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useDebounce } from 'use-debounce';
import { quickLaunch } from '../services/localQuickLauncher';

/**
 * A standard shape for search results in your React UI.
 */
interface SearchResult {
  id: string;
  title: string;
  url: string;
  score: number;
  source?: string;  // e.g. 'local', 'quicklaunch', 'semantic'
}

/**
 * useLocalSearch: Hook for "instant" local search via Dexie (quickLaunch).
 * 
 * Because quickLaunch uses Dexie, and Dexie is valid in a web DOM environment
 * (popup or options page), this is MV3-safe. We do not run this code in the
 * background service worker.
 */
export function useLocalSearch(query: string) {
  return useQuery({
    queryKey: ['local-search', query],
    queryFn: async () => {
      if (!query || query.length < 2) return [];
      
      // Calls the quickLaunch service to do local Dexie-based ranking
      const results = await quickLaunch.search(query);

      // Convert to a uniform shape
      return results.map((r) => ({
        id: r.pageId,
        title: r.title,
        url: r.url,
        score: r.score
      }));
    },
    // Only run if there's enough query length to matter
    enabled: query.length >= 2,
  });
}

/**
 * useBackendStreamingSearch: Hook that uses SSE (EventSource) to fetch results
 * from a remote "unified-search" endpoint. 
 * 
 * This code is safe in a typical React extension page (popup, new tab, or options),
 * but not in the background service worker (which doesn't have a DOM or window).
 */
export function useBackendStreamingSearch(query: string) {
  const [quickResults, setQuickResults] = useState<SearchResult[]>([]);
  const [semanticResults, setSemanticResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isComplete, setIsComplete] = useState(false);

  const eventSourceRef = useRef<EventSource | null>(null);

  // On query change, reset old SSE, start fresh
  useEffect(() => {
    // Cleanup any previous SSE
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    // Reset states
    setQuickResults([]);
    setSemanticResults([]);
    setIsComplete(false);

    // If query too short, skip SSE
    if (!query || query.length < 2) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    // Build the SSE URL. `window.location.origin` is valid in a DOM environment:
    const url = new URL('/api/unified-search/stream', window.location.origin);
    url.searchParams.append('query', query);
    url.searchParams.append('userId', 'current-user-id'); // Replace with real user ID
    url.searchParams.append('timestamp', Date.now().toString());
    url.searchParams.append('triggerSemantic', 'true');

    const source = new EventSource(url.toString());
    eventSourceRef.current = source;

    source.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(event.data);

        switch (data.type) {
          case 'quicklaunch': {
            const quickData = Array.isArray(data.results) ? data.results : [data];
            setQuickResults((prev) => [...prev, ...quickData]);
            break;
          }
          case 'semantic': {
            const semanticData = Array.isArray(data.results) ? data.results : [data];
            setSemanticResults((prev) => [...prev, ...semanticData]);
            break;
          }
          case 'complete': {
            setIsComplete(true);
            setIsLoading(false);
            source.close();
            eventSourceRef.current = null;
            break;
          }
          case 'error': {
            console.error('Search error:', data.message, 'Source:', data.source);
            break;
          }
          default:
            console.log('Unknown SSE event type:', data);
        }
      } catch (err) {
        console.error('Error parsing SSE data:', err);
      }
    });

    source.addEventListener('open', () => {
      setIsLoading(true);
    });

    source.addEventListener('error', () => {
      console.error('SSE connection error');
      setIsLoading(false);
      source.close();
      eventSourceRef.current = null;
    });

    // Cleanup if unmounted or query changed
    return () => {
      setIsLoading(false);
      if (source) {
        source.close();
      }
    };
  }, [query]);

  return {
    quickResults,
    semanticResults,
    isLoading,
    isComplete
  };
}

/**
 * useHybridSearch: Combined hook that merges results from local Dexie-based
 * search and a backend SSE-based search.
 */
export function useHybridSearch() {
  const [inputValue, setInputValue] = useState('');
  const [debouncedQuery] = useDebounce(inputValue, 300);
  const [immediateQuery, setImmediateQuery] = useState('');

  // Local search is immediate
  const localSearchQuery = inputValue;

  // Backend search is debounced or triggered by Enter
  const backendSearchQuery = immediateQuery || debouncedQuery;

  // Local query hook
  const {
    data: localResults = [],
    isLoading: isLocalLoading
  } = useLocalSearch(localSearchQuery);

  // Backend SSE hook
  const {
    quickResults,
    semanticResults,
    isLoading: isBackendLoading,
    isComplete
  } = useBackendStreamingSearch(backendSearchQuery);

  // Merge + de-dupe all results
  const allResults = useMemo(() => {
    const combined = [
      ...localResults.map((r) => ({ ...r, source: 'local' })),
      ...quickResults.map((r) => ({ ...r, source: 'quicklaunch' })),
      ...semanticResults.map((r) => ({ ...r, source: 'semantic' })),
    ];

    // Deduplicate by ID
    return combined
      .filter(
        (result, index, self) =>
          index === self.findIndex((r) => r.id === result.id)
      )
      .sort((a, b) => {
        // Sort by source priority first
        const sourceOrder: Record<string, number> = {
          local: 0,
          quicklaunch: 1,
          semantic: 2
        };
        const sourceDiff = (sourceOrder[a.source ?? ''] ?? 99) - (sourceOrder[b.source ?? ''] ?? 99);
        if (sourceDiff !== 0) {
          return sourceDiff;
        }
        // Then by descending score
        return b.score - a.score;
      });
  }, [localResults, quickResults, semanticResults]);

  // If user presses Enter, run immediate search
  const handleEnterKey = useCallback((value: string) => {
    setImmediateQuery(value);
  }, []);

  // When debounced query catches up, reset immediateQuery
  useEffect(() => {
    if (immediateQuery && immediateQuery === debouncedQuery) {
      setImmediateQuery('');
    }
  }, [immediateQuery, debouncedQuery]);

  return {
    inputValue,
    setInputValue,
    handleEnterKey,
    isSearching: isLocalLoading || isBackendLoading,
    isComplete,
    results: allResults,

    // Expose these if needed for debugging
    localResults,
    quickResults,
    semanticResults,
  };
}