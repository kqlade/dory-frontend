import { useState, useEffect, useCallback } from 'react';
import { useDebounce } from 'use-debounce';
import { UnifiedLocalSearchResult } from '../types/search';

/**
 * Content script search hook that uses messaging.
 * - Single Enter triggers PERFORM_LOCAL_SEARCH.
 * - Double Enter triggers PERFORM_SEMANTIC_SEARCH.
 */
export function useOverlaySearch() {
  const [inputValue, setInputValue] = useState('');
  const [debouncedQuery] = useDebounce(inputValue, 1000);
  const [results, setResults] = useState<UnifiedLocalSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // --- Function to Perform Semantic Search via Background Script ---
  const performSemanticSearch = useCallback((query: string) => {
    if (!query || query.length < 2) {
      return;
    }
    setIsSearching(true);

    try {
      console.log('[OverlaySearch] Sending PERFORM_SEMANTIC_SEARCH request:', query);
      chrome.runtime.sendMessage({
        type: 'PERFORM_SEMANTIC_SEARCH',
        query: query,
      });
    } catch (error) {
      console.error('[OverlaySearch] Error sending semantic search message:', error);
      setIsSearching(false);
    }
  }, []);

  // --- Listener for Search Results (from Background Script) ---
  useEffect(() => {
    const messageListener = (message: any) => {
      if (message.type === 'SEARCH_RESULTS') {
        console.log('[OverlaySearch] Received search results:', message.results?.length);
        setResults(message.results || []);
        setIsSearching(false);
      }
    };
    chrome.runtime.onMessage.addListener(messageListener);
    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
    };
  }, []);

  // --- Trigger Default (Local) Search on Enter ---
  const handleEnterKey = useCallback((value: string) => {
    if (!value || value.length < 2) {
      return;
    }
    setIsSearching(true);
    try {
      console.log('[OverlaySearch] Sending PERFORM_LOCAL_SEARCH request:', value);
      chrome.runtime.sendMessage({
        type: 'PERFORM_LOCAL_SEARCH',
        query: value,
      });
    } catch (error) {
      console.error('[OverlaySearch] Error sending local search message:', error);
      setIsSearching(false);
    }
  }, []);

  return {
    inputValue,
    setInputValue,
    handleEnterKey,         // Triggers local search via messaging
    isSearching,
    results,                // Unified results state (local or semantic)
    performSemanticSearch,  // Triggers semantic search via messaging
    isComplete: !isSearching
  };
} 