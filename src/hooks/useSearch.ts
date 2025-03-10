import { useQuery } from '@tanstack/react-query';
import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useDebounce } from 'use-debounce';
import { quickLaunch } from '../services/localQuickLauncher';

// Define result types
interface SearchResult {
  id: string;
  title: string;
  url: string;
  score: number;
  source?: string;
}

// 1. Hook for local search
export function useLocalSearch(query: string) {
  return useQuery({
    queryKey: ['local-search', query],
    queryFn: async () => {
      if (!query || query.length < 2) return [];
      
      // Use the quickLaunch service to search local IndexedDB
      const results = await quickLaunch.search(query);
      
      // Convert to our standard result format
      return results.map(result => ({
        id: result.pageId,
        title: result.title,
        url: result.url,
        score: result.score
      }));
    },
    enabled: query.length >= 2,
  });
}

// 2. Hook for backend streaming search that matches the backend SSE flow
export function useBackendStreamingSearch(query: string) {
  const [quickResults, setQuickResults] = useState<SearchResult[]>([]);
  const [semanticResults, setSemanticResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  
  // Reset and start search when query changes
  useEffect(() => {
    // Clean up previous search
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    
    // Reset state for new search
    setQuickResults([]);
    setSemanticResults([]);
    setIsComplete(false);
    
    // Don't start a new search if query is too short
    if (!query || query.length < 2) {
      setIsLoading(false);
      return;
    }
    
    // Start new search
    setIsLoading(true);
    
    // Set up connection to backend search endpoint
    const url = new URL('/api/unified-search/stream', window.location.origin);
    url.searchParams.append('query', query);
    url.searchParams.append('userId', 'current-user-id'); // Replace with actual userId
    url.searchParams.append('timestamp', Date.now().toString());
    url.searchParams.append('triggerSemantic', 'true');
    
    const source = new EventSource(url.toString());
    eventSourceRef.current = source;
    
    // Handle incoming SSE events based on type
    source.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(event.data);
        
        // Handle event based on its type
        switch(data.type) {
          case 'quicklaunch':
            const quickData = Array.isArray(data.results) ? data.results : [data];
            setQuickResults(prev => [...prev, ...quickData]);
            break;
            
          case 'semantic':
            const semanticData = Array.isArray(data.results) ? data.results : [data];
            setSemanticResults(prev => [...prev, ...semanticData]);
            break;
            
          case 'complete':
            setIsComplete(true);
            setIsLoading(false);
            source.close();
            eventSourceRef.current = null;
            break;
            
          case 'error':
            console.error('Search error:', data.message, 'Source:', data.source);
            break;
            
          default:
            // Handle any other events or malformed data
            console.log('Unknown event type:', data);
        }
      } catch (error) {
        console.error('Error parsing SSE data:', error);
      }
    });
    
    // Handle connection open
    source.addEventListener('open', () => {
      setIsLoading(true);
    });
    
    // Handle errors
    source.addEventListener('error', () => {
      console.error('SSE connection error');
      setIsLoading(false);
      source.close();
      eventSourceRef.current = null;
    });
    
    // Clean up on unmount or when query changes
    return () => {
      if (source) {
        source.close();
      }
      setIsLoading(false);
    };
  }, [query]);
  
  return { 
    quickResults, 
    semanticResults, 
    isLoading,
    isComplete
  };
}

// 3. Hybrid search hook combining local and backend results
export function useHybridSearch() {
  const [inputValue, setInputValue] = useState('');
  const [debouncedQuery] = useDebounce(inputValue, 300);
  const [immediateQuery, setImmediateQuery] = useState('');
  
  // For local search: Use raw inputValue for instant results with each keystroke
  const localSearchQuery = inputValue;
  
  // For backend search: Use debounced query (or immediate when Enter is pressed)
  const backendSearchQuery = immediateQuery || debouncedQuery;
  
  // Get local search results - INSTANT with each keystroke
  const { 
    data: localResults = [], 
    isLoading: isLocalLoading 
  } = useLocalSearch(localSearchQuery);
  
  // Get backend streaming results - DEBOUNCED
  const { 
    quickResults,
    semanticResults,
    isLoading: isBackendLoading,
    isComplete
  } = useBackendStreamingSearch(backendSearchQuery);
  
  // Combine and deduplicate all results
  const allResults = useMemo(() => {
    const combined = [
      ...localResults.map(r => ({ ...r, source: 'local' })),
      ...quickResults.map(r => ({ ...r, source: 'quicklaunch' })),
      ...semanticResults.map(r => ({ ...r, source: 'semantic' }))
    ];
    
    // Deduplicate by page/document ID
    return combined
      .filter((result, index, self) => 
        index === self.findIndex(r => r.id === result.id)
      )
      .sort((a, b) => {
        // Sort results by source type first
        const sourceOrder: Record<string, number> = { local: 0, quicklaunch: 1, semantic: 2 };
        const sourceCompare = sourceOrder[a.source || ''] - sourceOrder[b.source || ''];
        
        // If same source, sort by score
        return sourceCompare !== 0 ? sourceCompare : b.score - a.score;
      });
  }, [localResults, quickResults, semanticResults]);
  
  // Handle Enter key for immediate search
  const handleEnterKey = useCallback((value: string) => {
    setImmediateQuery(value);
  }, []);
  
  // Reset immediate query when debounced query catches up
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
    
    // For debugging or specialized UI
    localResults,
    quickResults,
    semanticResults
  };
} 