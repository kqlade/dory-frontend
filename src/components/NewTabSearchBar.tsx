import React, { useRef, useState, useEffect } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, WheelEvent as ReactWheelEvent } from 'react';
import { useBackgroundSearch } from '../hooks/useBackgroundSearch';
import { SearchResult } from '../types';
import Favicon from '../utils/faviconUtils';
import { SEARCH_CONFIG } from '../config';
import './NewTabSearchBar.css';

/** Small Dory logo component */
const DoryLogo = ({ size = 24 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 576 512">
    <path
      fill="#74d6ff"
      d="M180.5 141.5C219.7 108.5 272.6 80 336 80s116.3 28.5 155.5 61.5c39.1 33 66.9 72.4 81 99.8c4.7 9.2 4.7 20.1 0 29.3c-14.1 27.4-41.9 66.8-81 99.8C452.3 403.5 399.4 432 336 432s-116.3-28.5-155.5-61.5c-16.2-13.7-30.5-28.5-42.7-43.1L48.1 379.6c-12.5 7.3-28.4 5.3-38.7-4.9S-3 348.7 4.2 336.1L50 256 4.2 175.9c-7.2-12.6-5-28.4 5.3-38.6s26.1-12.2 38.7-4.9l89.7 52.3c12.2-14.6 26.5-29.4 42.7-43.1zM448 256a32 32 0 1 0 -64 0 32 32 0 1 0 64 0z"
    />
  </svg>
);

interface NewTabSearchBarProps {
  onSearchStateChange?: (isSearchActive: boolean) => void;
}

const NewTabSearchBar: React.FC<NewTabSearchBarProps> = ({ onSearchStateChange }) => {
  const { searchLocal, trackResultClick } = useBackgroundSearch();

  const [inputValue, setInputValue] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [localResults, setLocalResults] = useState<SearchResult[]>([]);
  
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [startIndex, setStartIndex] = useState(0); // For showing 2 results at a time
  const [lastKeystrokeTime, setLastKeystrokeTime] = useState(Date.now());

  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Focus the search bar globally if '/' pressed
  useEffect(() => {
    const handleGlobalKeyDown = (e: globalThis.KeyboardEvent) => {
      const tag = document.activeElement?.tagName;
      if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  // When user types, reset lastKeystrokeTime
  useEffect(() => {
    setLastKeystrokeTime(Date.now());
  }, [inputValue]);

  // Clean up any timeout on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  // Visible items for the results list
  const visibleResults = localResults.slice(startIndex, startIndex + 2);
  const maxStartIndex = Math.max(0, localResults.length - 2);

  // Reset selection when the result set changes
  useEffect(() => {
    setSelectedIndex(localResults.length > 0 ? 0 : -1);
    setStartIndex(0);
  }, [localResults]);

  // Notify parent about whether the search UI is active (>=2 chars)
  const isSearchActive = inputValue.trim().length >= 2;
  useEffect(() => {
    onSearchStateChange?.(isSearchActive);
  }, [isSearchActive, onSearchStateChange]);

  // Debounced search function
  const performDebouncedLocalSearch = (value: string) => {
    // Clear any existing timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (value.trim().length >= 2) {
      setIsSearching(true);
      
      // Set a new timeout
      searchTimeoutRef.current = setTimeout(() => {
        searchLocal(value)
          .then(results => {
            setLocalResults(results);
            setIsSearching(false);
          })
          .catch(err => {
            console.error('[NewTabSearchBar] Local search error:', err);
            setLocalResults([]);
            setIsSearching(false);
          });
        searchTimeoutRef.current = null;
      }, SEARCH_CONFIG.SEARCH_DEBOUNCE_MS);
    } else {
      setLocalResults([]);
    }
  };

  // Handler for text changes -> debounced local search
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputValue(value);
    performDebouncedLocalSearch(value);
  };

  // Navigate to a result URL, track the click
  const navigateToResult = (result: SearchResult) => {
    const idx = localResults.findIndex(r => r.id === result.id);
    trackResultClick(result.id || result.pageId || '', idx, result.url, inputValue);
    
    // Ensure URL has proper protocol
    let url = result.url;
    
    // Add protocol if missing
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }
    
    console.log('[SearchBar] Navigating to:', url, 'Original URL:', result.url);
    
    // Determine if we're in a new tab context or overlay context by checking the URL
    const isNewTabPage = window.location.href.includes('newtab.html');
    
    if (isNewTabPage) {
      // In new tab context, navigate in the same tab
      window.location.href = url;
    } else {
      // In overlay context, open in a new tab
      chrome.tabs.create({ url });
    }
  };

  // Handle user hitting Enter, Escape, or arrow keys in the input
  const onInputKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    const length = localResults.length;
    if (e.key === 'ArrowDown' && length > 0) {
      e.preventDefault();
      const newIdx = selectedIndex < length - 1 ? selectedIndex + 1 : 0;
      setSelectedIndex(newIdx);
      if (newIdx >= startIndex + 2) {
        setStartIndex(Math.min(newIdx - 1, maxStartIndex));
      } else if (newIdx < startIndex) {
        setStartIndex(0);
      }
    } else if (e.key === 'ArrowUp' && length > 0) {
      e.preventDefault();
      const newIdx = selectedIndex > 0 ? selectedIndex - 1 : length - 1;
      setSelectedIndex(newIdx);
      if (newIdx < startIndex) {
        setStartIndex(newIdx);
      } else if (newIdx === length - 1) {
        setStartIndex(maxStartIndex);
      }
    } else if (e.key === 'Escape') {
      setSelectedIndex(-1);
    } else if (e.key === 'Enter') {
      // Navigate if there's a selection
      if (selectedIndex >= 0 && selectedIndex < length) {
        e.preventDefault();
        navigateToResult(localResults[selectedIndex]);
      }
    }
  };

  // Handle scrolling in the results list
  const handleScroll = (e: ReactWheelEvent<HTMLUListElement>) => {
    e.preventDefault();
    if (e.deltaY > 0 && startIndex < maxStartIndex) {
      setStartIndex(s => Math.min(s + 1, maxStartIndex));
    } else if (e.deltaY < 0 && startIndex > 0) {
      setStartIndex(s => Math.max(s - 1, 0));
    }
  };

  // Determine UI states
  const timeSinceKeystroke = Date.now() - lastKeystrokeTime;
  const debounceElapsed = timeSinceKeystroke > 1000;
  const showResults = isSearchActive && localResults.length > 0 && !isSearching;
  const showSearching = isSearchActive && isSearching;
  const showNoResults = isSearchActive && localResults.length === 0 && !isSearching && debounceElapsed;

  return (
    <div className="search-container">
      <div className="search-bar-inner-container">
        <div className="icon-wrapper" title="Dory">
          <DoryLogo size={22} />
        </div>
        <input
          ref={searchInputRef}
          type="text"
          className="search-input"
          placeholder="Find what you forgot..."
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={onInputKeyDown}
          autoFocus
        />
        {isSearching && (
          <div className="spinner-wrapper">
            <div className="spinner" />
          </div>
        )}
      </div>

      {showResults && (
        <>
          <div className="results-header">
            Quick Launch Results
          </div>
          <ul className="results-list" onWheel={handleScroll}>
            {visibleResults.map((item, idx) => {
              const actualIndex = startIndex + idx;
              return (
                <li
                  key={item.id}
                  className={`result-item ${selectedIndex === actualIndex ? 'selected' : ''}`}
                  onClick={() => navigateToResult(item)}
                  onMouseEnter={() => setSelectedIndex(actualIndex)}
                >
                  <div className="result-title">
                    <Favicon url={item.url} />
                    {item.title}
                  </div>
                  <div className="result-url">{item.url}</div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {showSearching && (
        <div className="status-message searching">
          Using quick launcher...
        </div>
      )}

      {showNoResults && (
        <div className="status-message no-results">
          No results found in quick launcher
        </div>
      )}
    </div>
  );
};

export default NewTabSearchBar;