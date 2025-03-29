import { useState, useEffect, useCallback } from 'react';
import { useDebounce } from 'use-debounce';
import { UnifiedLocalSearchResult } from '../types/search';
import { MessageType } from './messageSystem';

const SEARCH_DEBOUNCE_MS = 50; // Debounce time for search-as-you-type
const MIN_QUERY_LENGTH = 2;

/**
 * Content script search hook that uses messaging.
 * - Single Enter triggers PERFORM_LOCAL_SEARCH.
 * - Double Enter triggers PERFORM_SEMANTIC_SEARCH.
 */
export function useOverlaySearch() {
  const [inputValue, setInputValue] = useState('');
  const [results, setResults] = useState<UnifiedLocalSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Debounce the input value
  const [debouncedQuery] = useDebounce(inputValue, SEARCH_DEBOUNCE_MS);

  // Effect to listen for results from the background script
  useEffect(() => {
    const messageListener = (message: any) => {
      if (message.type === MessageType.SEARCH_RESULTS) {
        console.log(`[useOverlaySearch] Received ${message.results?.length} results`);
        setResults(message.results || []);
        setIsLoading(false);
      }
    };
    chrome.runtime.onMessage.addListener(messageListener);
    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
    };
  }, []);

  // Effect to trigger search when debounced query changes
  useEffect(() => {
    if (debouncedQuery && debouncedQuery.length >= MIN_QUERY_LENGTH) {
      setIsLoading(true);
      setResults([]);
      console.log(`[useOverlaySearch] Sending PERFORM_LOCAL_SEARCH for debounced query: "${debouncedQuery}"`);
      try {
        chrome.runtime.sendMessage({
          type: MessageType.PERFORM_LOCAL_SEARCH,
          query: debouncedQuery,
        });
      } catch (error) {
        console.error('[useOverlaySearch] Error sending search message:', error);
        setIsLoading(false);
        setResults([]);
      }
    } else {
      setResults([]);
      setIsLoading(false);
    }
  }, [debouncedQuery]);

  // Function to manually trigger semantic search
  const performSemanticSearch = useCallback((query: string) => {
    if (!query || query.length < MIN_QUERY_LENGTH) return;

    setIsLoading(true);
    setResults([]);
    console.log(`[useOverlaySearch] Sending PERFORM_SEMANTIC_SEARCH for: "${query}"`);
    try {
      chrome.runtime.sendMessage({
        type: MessageType.PERFORM_SEMANTIC_SEARCH,
        query: query,
      });
    } catch (error) {
      console.error('[useOverlaySearch] Error sending semantic search message:', error);
      setIsLoading(false);
      setResults([]);
    }
  }, []);

  return {
    inputValue,
    setInputValue,
    performSemanticSearch,
    isSearching: isLoading,
    results,
  };
} 