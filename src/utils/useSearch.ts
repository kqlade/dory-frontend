// src/hooks/useSearch.ts
import { useQuery } from '@tanstack/react-query';
import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useDebounce } from 'use-debounce';
import { localRanker } from '../services/localDoryRanking';
import { API_BASE_URL } from '../config';

/** Standard shape for displayed results */
interface SearchResult {
  id: string;
  title: string;
  url: string;
  score: number;
  source?: string;  
}

/** 1) useLocalSearch => Local ranking via AdvancedLocalRanker */
export function useLocalSearch(query: string) {
  return useQuery({
    queryKey: ['local-search', query],
    queryFn: async () => {
      if (!query || query.length < 2) return [];
      console.log(`[DEBUG] Sending query for local ranking: "${query}"`);
      
      // Initialize the ranker if needed
      await localRanker.initialize();
      
      // Get ranking results - now includes pageId, title, url, and score
      const results = await localRanker.rank(query);
      
      // Map to the expected SearchResult format
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

/** 2) useBackendStreamingSearch => SSE approach */
export function useBackendStreamingSearch(query: string) {
  const [quickResults, setQuickResults] = useState<SearchResult[]>([]);
  const [semanticResults, setSemanticResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isComplete, setIsComplete] = useState(false);

  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    setQuickResults([]);
    setSemanticResults([]);
    setIsComplete(false);

    if (!query || query.length < 2) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);

    // Use API_BASE_URL instead of window.location.origin to ensure proper connection in extension context
    const url = new URL('/api/unified-search', API_BASE_URL);
    url.searchParams.append('query', query);
    url.searchParams.append('userId', 'current-user-id');
    url.searchParams.append('timestamp', Date.now().toString());
    url.searchParams.append('triggerSemantic', 'true');

    const source = new EventSource(url.toString());
    eventSourceRef.current = source;

    source.addEventListener('message', (evt) => {
      try {
        const data = JSON.parse(evt.data);
        switch (data.type) {
          case 'quicklaunch': {
            const arr = Array.isArray(data.results) ? data.results : [data];
            setQuickResults(prev => [
              ...prev,
              ...arr.map((x: { id?: string; pageId?: string; title: string; url: string; score?: number }) => ({
                id: x.id || x.pageId || `${Date.now()}-q`,
                title: x.title,
                url: x.url,
                score: x.score || 1,
                source: 'quicklaunch'
              }))
            ]);
            break;
          }
          case 'semantic': {
            const arr = Array.isArray(data.results) ? data.results : [data];
            setSemanticResults(prev => [
              ...prev,
              ...arr.map((x: { id?: string; pageId?: string; title: string; url: string; score?: number }) => ({
                id: x.id || x.pageId || `${Date.now()}-s`,
                title: x.title,
                url: x.url,
                score: x.score || 1,
                source: 'semantic'
              }))
            ]);
            break;
          }
          case 'complete':
            setIsComplete(true);
            setIsLoading(false);
            source.close();
            eventSourceRef.current = null;
            break;
          case 'error':
            console.error('[SSE Error]', data.message);
            break;
          default:
            console.log('[SSE] Unknown event type =>', data);
        }
      } catch (err) {
        console.error('Error parsing SSE data =>', err);
      }
    });

    source.addEventListener('open', () => {
      setIsLoading(true);
    });

    source.addEventListener('error', () => {
      console.error('[SSE] Connection error');
      setIsLoading(false);
      source.close();
      eventSourceRef.current = null;
    });

    return () => {
      setIsLoading(false);
      if (source) source.close();
    };
  }, [query]);

  return { quickResults, semanticResults, isLoading, isComplete };
}

/** 3) useHybridSearch => merges local + SSE results */
export function useHybridSearch() {
  const [inputValue, setInputValue] = useState('');
  // Debounce the typed input
  const [debouncedQuery] = useDebounce(inputValue, 300);
  const [immediateQuery, setImmediateQuery] = useState('');

  // Local search => immediate
  const { data: localResults = [], isLoading: isLocalLoading } = useLocalSearch(inputValue);

  // SSE backend => debounced or immediate
  const backendQuery = immediateQuery || debouncedQuery;
  const {
    quickResults,
    semanticResults,
    isLoading: isBackendLoading,
    isComplete
  } = useBackendStreamingSearch(backendQuery);

  // Combine / deduplicate
  const results = useMemo(() => {
    const combined = [...localResults, ...quickResults, ...semanticResults];
    return combined.filter((r, idx, self) =>
      idx === self.findIndex(x => x.id === r.id)
    );
  }, [localResults, quickResults, semanticResults]);

  // Single "is searching" flag
  const isSearching = (isLocalLoading || isBackendLoading);

  // If user presses enter, do an immediate SSE search 
  // (bypassing the 300ms debounce)
  const handleEnterKey = useCallback((value: string) => {
    setImmediateQuery(value);
  }, []);

  // Once our debounced query matches the immediateQuery, we reset
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
    localResults,
    quickResults,
    semanticResults
  };
}