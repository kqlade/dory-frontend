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
 * Content script search hook that uses messaging.
 * - Single Enter sends PERFORM_SEARCH with semanticEnabled: false.
 * - Double Enter triggers performSemanticSearch, which sends PERFORM_SEARCH with semanticEnabled: true.
 */
export function useOverlaySearch() {
  const [inputValue, setInputValue] = useState('');
  const [debouncedQuery] = useDebounce(inputValue, 1000); // Kept for potential future use?
  const [immediateQuery, setImmediateQuery] = useState(''); // For triggering local on Enter
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Determine which query string is actually used for the default (local) search trigger
  const defaultSearchQuery = immediateQuery || debouncedQuery; // Or should this just be inputValue?

  // --- Perform Default (Local) Search via Background Script ---
  useEffect(() => {
    // Triggered by immediateQuery (on Enter) or debouncedQuery
    const query = immediateQuery || debouncedQuery;
    if (!query || query.length < 2) {
      setResults([]);
      return;
    }

    const performLocalSearch = async () => {
      setIsSearching(true);
      setResults([]); // Clear previous results

      try {
        console.log('[OverlaySearch] Sending LOCAL search request:', query);
        chrome.runtime.sendMessage({
          type: 'PERFORM_SEARCH',
          query: query,
          semanticEnabled: false // Always false for default search
        });
      } catch (error) {
        console.error('[OverlaySearch] Error sending local search message:', error);
        setIsSearching(false); // Ensure searching stops on error
      }
      // Note: isSearching will be set to false when results arrive (or on error above)
    };

    performLocalSearch();

  }, [immediateQuery, debouncedQuery]); // Trigger on immediate or debounced query


  // --- Function to Perform Semantic Search via Background Script ---
  const performSemanticSearch = useCallback((query: string) => {
    if (!query || query.length < 2) {
      setResults([]);
      return;
    }
    setIsSearching(true);
    setResults([]); // Clear previous results

    try {
      console.log('[OverlaySearch] Sending SEMANTIC search request:', query);
      chrome.runtime.sendMessage({
        type: 'PERFORM_SEARCH',
        query: query,
        semanticEnabled: true // Force true for semantic search
      });
    } catch (error) {
      console.error('[OverlaySearch] Error sending semantic search message:', error);
      setIsSearching(false); // Ensure searching stops on error
    }
    // Note: isSearching will be set to false when results arrive (or on error above)
  }, []);


  // --- Listener for Search Results (from Background Script) ---
  useEffect(() => {
    const messageListener = (message: any) => {
      if (message.type === 'SEARCH_RESULTS') {
        console.log('[OverlaySearch] Received search results:', message.results.length);
        setResults(message.results);
        setIsSearching(false); // Stop searching indicator
      }
    };
    chrome.runtime.onMessage.addListener(messageListener);
    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
    };
  }, []); // Run once on mount


  // --- Trigger Default (Local) Search on Enter ---
  const handleEnterKey = useCallback((value: string) => {
    // Set immediateQuery to trigger the useEffect for local search
    setImmediateQuery(value);
  }, []);

   // Reset immediateQuery after it triggers the effect
   useEffect(() => {
     if (immediateQuery) {
       setImmediateQuery('');
     }
   }, [results, isSearching]); // Reset when results come back or search stops


  return {
    inputValue,
    setInputValue,
    handleEnterKey,         // Triggers local search via messaging
    isSearching,            // Unified searching state
    results,                // Unified results state (local or semantic)
    performSemanticSearch,  // Function to trigger semantic search via messaging
    isComplete: !isSearching // isComplete flag (optional)
  };
} 