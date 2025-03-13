import React, { useRef, useEffect, useState } from 'react';
import NewTabSearchBar from '../../components/NewTabSearchBar';
import ThemeToggle from './ThemeToggle';
import { trackSearchClick } from '../../services/eventService';
import { useHybridSearch } from '../../utils/useSearch';
import './newtab.css';

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

const NewTab: React.FC = () => {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const {
    inputValue,
    setInputValue,
    handleEnterKey,
    isSearching,
    results,
    semanticEnabled,
    toggleSemanticSearch
  } = useHybridSearch();

  // Reset selected index when results change
  useEffect(() => {
    setSelectedIndex(-1);
  }, [results]);

  // Handle input changes
  const handleQueryChange = (newQuery: string) => {
    setInputValue(newQuery);
  };

  // Handle result clicks
  const handleResultClick = (result: SearchResult) => {
    navigateToResult(result);
  };

  // Handle navigation to a result
  const navigateToResult = (result: SearchResult) => {
    // Track the click for learning
    trackSearchClick(
      result.searchSessionId || 'local-session',
      result.id || result.pageId || '',  // Provide empty string as fallback
      results.findIndex((r: SearchResult) => r.id === result.id),
      result.url,
      inputValue // current search query
    );

    // Navigate to the result
    window.location.href = result.url;
  };

  // Handle key down in search input
  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (selectedIndex >= 0 && selectedIndex < results.length) {
        // Navigate to the selected result
        e.preventDefault();
        navigateToResult(results[selectedIndex]);
      } else if (inputValue.trim()) {
        // Perform default search if no result is selected
        handleEnterKey(inputValue);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (results.length > 0) {
        setSelectedIndex(prev => (prev < results.length - 1 ? prev + 1 : 0));
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (results.length > 0) {
        setSelectedIndex(prev => (prev > 0 ? prev - 1 : results.length - 1));
      }
    } else if (e.key === 'Escape') {
      setSelectedIndex(-1);
    }
  };

  // Handle global keyboard events for navigating results
  useEffect(() => {
    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      // When '/' is pressed and no input is focused, focus our search
      if (
        event.key === '/' &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
      ) {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    };

    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      document.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, []);

  // Focus the search input on mount
  useEffect(() => {
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, []);

  // Determine if we show the results list
  const showResults = inputValue.length >= 2 && results.length > 0;
  
  // Only show "No results found" if:
  // - For quick launch: when not searching and no results
  // - For semantic search: when not searching, no results, and it's been at least 1 second since last keystroke
  const [lastKeystrokeTime, setLastKeystrokeTime] = useState(Date.now());
  const timeSinceLastKeystroke = Date.now() - lastKeystrokeTime;
  const debounceElapsed = timeSinceLastKeystroke > 1000;
  
  // Update lastKeystrokeTime whenever inputValue changes
  useEffect(() => {
    setLastKeystrokeTime(Date.now());
  }, [inputValue]);
  
  const showNoResults = inputValue.length >= 2 && 
                         results.length === 0 && 
                         !isSearching && 
                         (!semanticEnabled || debounceElapsed);
                         
  const showSearchMode = inputValue.length >= 2;

  return (
    <div className="newtab-container">
      <div className="dory-container">
        <div className="dory-text">
          <span className="word"><span className="dory-letter">D</span>ynamic</span>{' '}
          <span className="word"><span className="dory-letter">O</span>nline</span>{' '}
          <span className="word"><span className="dory-letter">R</span>ecall</span>{' '}
          <span className="word">for</span>{' '}
          <span className="word"><span className="dory-letter">Y</span>ou</span>
        </div>
      </div>
      
      <div className="search-container">
        <NewTabSearchBar
          value={inputValue}
          onChange={handleQueryChange}
          onKeyDown={handleInputKeyDown}
          isLoading={semanticEnabled ? (isSearching || (inputValue.length >= 2 && !debounceElapsed)) : isSearching}
          inputRef={searchInputRef}
          semanticEnabled={semanticEnabled}
          onToggleSemantic={toggleSemanticSearch}
        />

        <div className={`search-mode-indicator ${!showSearchMode ? 'hidden' : ''}`}>
          {semanticEnabled ? 'Semantic Search Mode' : 'Quick Launch Mode'}
        </div>

        {showResults && (
          <ul className="results-list">
            {results.map((result: SearchResult, index: number) => (
              <li 
                key={result.id} 
                className={`result-item ${index === selectedIndex ? 'selected' : ''}`}
                onClick={() => handleResultClick(result)}
              >
                <div className="result-title">{result.title}</div>
                <div className="result-url">{result.url}</div>
                {result.explanation && result.source === 'semantic' && (
                  <div className="result-explanation">
                    <span className="explanation-label">Why: </span>
                    {result.explanation}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {/* Show "Searching..." message during both debounce period and actual search */}
        {semanticEnabled && inputValue.length >= 2 && results.length === 0 && (!debounceElapsed || isSearching) && (
          <div className="status-message searching">
            Searching...
          </div>
        )}

        <div className={`status-message ${!showNoResults ? 'hidden' : ''} ${showNoResults ? 'no-results' : ''}`}>
          No results found. Try refining your search.
        </div>
      </div>
      <ThemeToggle />
    </div>
  );
};

export default NewTab;