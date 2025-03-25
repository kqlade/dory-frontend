import { useState, useEffect, useCallback } from 'react';
import { useDebounce } from 'use-debounce';

interface SearchResult {
  id: string;
  title: string;
  url: string;
  score: number;
  source?: string;
  explanation?: string;
  pageId?: string;
  searchSessionId?: string;
}

/**
 * Content script search hook that uses messaging to communicate with the background script.
 * This hook is designed to have the same interface as useHybridSearch.
 */
export function useOverlaySearch() {
  const [inputValue, setInputValue] = useState('');
  const [debouncedQuery] = useDebounce(inputValue, 1000);
  const [immediateQuery, setImmediateQuery] = useState('');
  const [semanticEnabled, setSemanticEnabled] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Determine which query string is actually used for search
  const searchQuery = immediateQuery || debouncedQuery;

  // Perform search when query changes
  useEffect(() => {
    if (!searchQuery || searchQuery.length < 2) {
      setResults([]);
      return;
    }

    const performSearch = async () => {
      setIsSearching(true);
      
      try {
        // Send message to background script
        console.log('[DORY] Sending search request to background script:', searchQuery);
        
        // For now, we'll just return some sample results after a delay
        chrome.runtime.sendMessage({
          type: 'PERFORM_SEARCH',
          query: searchQuery,
          semanticEnabled
        });
      } catch (error) {
        console.error('[DORY] Error sending search message:', error);
        setIsSearching(false);
      }
    };

    performSearch();
  }, [searchQuery, semanticEnabled]);

  // Set up listener for search results
  useEffect(() => {
    const messageListener = (message: any) => {
      if (message.type === 'SEARCH_RESULTS') {
        console.log('[DORY] Received search results:', message.results);
        setResults(message.results);
        setIsSearching(false);
      }
    };

    // Add listener
    chrome.runtime.onMessage.addListener(messageListener);

    // Cleanup
    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
    };
  }, []);

  // Trigger immediate search (e.g., on pressing Enter)
  const handleEnterKey = useCallback((value: string) => {
    setImmediateQuery(value);
  }, []);

  // Toggle semantic search on/off
  const toggleSemanticSearch = useCallback(() => {
    setSemanticEnabled(prev => !prev);
  }, []);

  return {
    inputValue,
    setInputValue,
    handleEnterKey,
    isSearching,
    results,
    semanticEnabled,
    toggleSemanticSearch,
    isComplete: !isSearching
  };
} 