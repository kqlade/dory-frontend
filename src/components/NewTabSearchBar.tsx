import React, { useRef, useState, useEffect, KeyboardEvent, WheelEvent } from 'react';
import { useHybridSearch } from '../utils/useSearch';
import { trackSearchClick } from '../services/eventService';
import { UnifiedLocalSearchResult } from '../types/search';
import { getFaviconUrl } from '../utils/faviconHelper';
import './NewTabSearchBar.css';

/**
 * Shape of each search result (customize fields as needed).
 */
// interface SearchResult {
//   id: string;
//   title: string;
//   url: string;
//   score: number;
//   source?: string;
//   explanation?: string;
//   pageId?: string;
//   searchSessionId?: string;
// }

/**
 * Simple Dory logo for toggling semantic mode (unchanged).
 */
const DoryLogo = ({ size = 24 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 576 512"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path 
      fill="#74d6ff" 
      d="M180.5 141.5C219.7 108.5 272.6 80 336 80s116.3 28.5 155.5 61.5c39.1 33 66.9 72.4 81 99.8c4.7 9.2 4.7 20.1 0 29.3c-14.1 27.4-41.9 66.8-81 99.8C452.3 403.5 399.4 432 336 432s-116.3-28.5-155.5-61.5c-16.2-13.7-30.5-28.5-42.7-43.1L48.1 379.6c-12.5 7.3-28.4 5.3-38.7-4.9S-3 348.7 4.2 336.1L50 256 4.2 175.9c-7.2-12.6-5-28.4 5.3-38.6s26.1-12.2 38.7-4.9l89.7 52.3c12.2-14.6 26.5-29.4 42.7-43.1zM448 256a32 32 0 1 0 -64 0 32 32 0 1 0 64 0z"
    />
  </svg>
);

/**
 * Self-contained search bar component that:
 * 1) Uses `useHybridSearch` internally (no props needed).
 * 2) Manages its own inputValue, results, spinner, semantic toggle, etc.
 * 3) Handles arrow key navigation, Enter/Escape, "No results," "Searching...".
 * 4) Tracks clicks and navigates to the chosen URL.
 * 5) Even includes the '/' key global focus logic.
 */
interface NewTabSearchBarProps {
  onSearchStateChange?: (isSearchActive: boolean) => void;
}

const NewTabSearchBar: React.FC<NewTabSearchBarProps> = ({ onSearchStateChange }) => {
  // ------------------------------
  // 1. Use the refactored search hook
  // ------------------------------
  const {
    inputValue,
    setInputValue,
    isSearching,          // Local search loading state
    localResults,         // Local search results
    performSemanticSearch,// Function to trigger semantic search
    isSemanticSearching,  // Semantic search loading state
    semanticSearchResults,// Semantic search results
    semanticError,        // Available if we want to display semantic errors
  } = useHybridSearch();

  // ------------------------------
  // 2. Local state for keyboard highlight, AND scrolling
  // ------------------------------
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [startIndex, setStartIndex] = useState(0); // State for visible window start
  const [displayMode, setDisplayMode] = useState<'local' | 'semantic'>('local');

  // ------------------------------
  // 3. Ref for focusing the input
  // ------------------------------
  const searchInputRef = useRef<HTMLInputElement>(null);

  // ------------------------------
  // 4. Debounce logic helper state
  // ------------------------------
  const [lastKeystrokeTime, setLastKeystrokeTime] = useState(Date.now());

  // Detect OS for keyboard shortcut hint
  const [isMac, setIsMac] = useState(false);
  
  useEffect(() => {
    // Check if user is on macOS
    setIsMac(navigator.platform.includes('Mac'));
  }, []);

  // Update keystroke time and reset display mode when user types
  useEffect(() => {
    setLastKeystrokeTime(Date.now());
    // Reset display mode to local when user starts typing a new query
    if (displayMode === 'semantic') {
        setDisplayMode('local');
    }
  }, [inputValue]); // Removed displayMode dependency to avoid loop

  // Decide which results and loading state to use based on displayMode
  const currentResults = displayMode === 'semantic' ? semanticSearchResults : localResults;
  const currentLoading = displayMode === 'semantic' ? isSemanticSearching : isSearching;

  // Calculate visible results based on startIndex
  const visibleResults = currentResults.slice(startIndex, startIndex + 3);
  const maxStartIndex = Math.max(0, currentResults.length - 3);

  // Reset selected index and startIndex when the displayed results change
  useEffect(() => {
    // Set selectedIndex to 0 if there are results, otherwise -1
    setSelectedIndex(currentResults.length > 0 ? 0 : -1);
    setStartIndex(0); // Reset scroll window too
  }, [currentResults]);

  // ------------------------------
  // 5. Global '/' key to focus the bar
  // ------------------------------
  useEffect(() => {
    const handleGlobalKeyDown = (event: globalThis.KeyboardEvent) => {
      // If '/' is pressed and we're not inside an input/textarea, focus search
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

  // ------------------------------
  // 6. Handle text input
  // ------------------------------
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
    // Ensure display reverts to local on new input typed by user
    setDisplayMode('local');
  };

  // ------------------------------
  // 7. Keyboard events (arrows, Enter, Escape) - Updated for scrolling
  // ------------------------------
  const onInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const resultsLength = currentResults.length;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (resultsLength > 0) {
        const newSelectedIndex = selectedIndex < resultsLength - 1 ? selectedIndex + 1 : 0;
        setSelectedIndex(newSelectedIndex);
        // Adjust scroll window if needed
        if (newSelectedIndex >= startIndex + 3) {
          setStartIndex(Math.min(newSelectedIndex - 2, maxStartIndex));
        } else if (newSelectedIndex < startIndex) { // Handle wrapping around to top
           setStartIndex(0);
        }
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (resultsLength > 0) {
        const newSelectedIndex = selectedIndex > 0 ? selectedIndex - 1 : resultsLength - 1;
        setSelectedIndex(newSelectedIndex);
        // Adjust scroll window if needed
        if (newSelectedIndex < startIndex) {
          setStartIndex(newSelectedIndex);
        } else if (newSelectedIndex === resultsLength - 1) { // Handle wrapping around to bottom
           setStartIndex(maxStartIndex);
        }
      }
    } else if (e.key === 'Escape') {
      setSelectedIndex(-1);
    } else if (e.key === 'Enter') {
      // Check if Ctrl/Cmd key is pressed for semantic search
      if ((e.ctrlKey || e.metaKey) && inputValue.trim()) {
        console.log('[SearchBar] Ctrl/Cmd+Enter detected - performing semantic search.');
        performSemanticSearch(inputValue); // Trigger semantic search
        setDisplayMode('semantic');
        return;
      }
      
      // Navigate if an item is selected
      if (selectedIndex >= 0 && selectedIndex < resultsLength) {
        e.preventDefault();
        navigateToResult(currentResults[selectedIndex]);
      } else if (inputValue.trim()) {
        // Local search is now triggered automatically by useLocalSearch via useHybridSearch
        console.log('[SearchBar] Enter pressed with no selection - local search active.');
      }
    }
  };

  // ------------------------------
  // NEW: Handle Scroll Wheel for results list
  // ------------------------------
  const handleScroll = (event: WheelEvent<HTMLUListElement>) => {
    event.preventDefault(); // Prevent native scrolling
    if (event.deltaY > 0 && startIndex < maxStartIndex) {
      // Scrolling down
      setStartIndex(prev => Math.min(prev + 1, maxStartIndex));
    } else if (event.deltaY < 0 && startIndex > 0) {
      // Scrolling up
      setStartIndex(prev => Math.max(prev - 1, 0));
    }
  };

  // ------------------------------
  // 8. Navigate to a result - Updated
  // ------------------------------
  const navigateToResult = (result: UnifiedLocalSearchResult) => {
    const indexInCurrentList = currentResults.findIndex((r) => r.id === result.id);
    trackSearchClick(
      // Use different session IDs based on source if desired, or keep simple
      result.source === 'semantic' ? 'semantic-session' : 'local-session',
      result.id || result.pageId || '',
      indexInCurrentList,
      result.url,
      inputValue
    );
    window.open(result.url, '_blank');
  };

  // ------------------------------
  // 9. Click on a result item - Unchanged logic, Updated type
  // ------------------------------
  const handleResultClick = (result: UnifiedLocalSearchResult) => {
    navigateToResult(result);
  };

  // ------------------------------
  // 10. Conditionals for UI states - Updated
  // ------------------------------
  const timeSinceLastKeystroke = Date.now() - lastKeystrokeTime;
  const debounceElapsed = timeSinceLastKeystroke > 1000;

  const isSearchPotentiallyActive = inputValue.length >= 2; // Search UI appears if input >= 2 chars

  // Determine whether to show the results list, "Searching...", or "No Results"
  const showResultsList = isSearchPotentiallyActive && currentResults.length > 0 && !currentLoading;
  const showSearching = isSearchPotentiallyActive && currentLoading;
  const showNoResults = isSearchPotentiallyActive && currentResults.length === 0 && !currentLoading && debounceElapsed;

  // Spinner is shown if the current mode is loading
  const showSpinner = currentLoading;

  // Notify parent component if search UI might be visible
  useEffect(() => {
    onSearchStateChange?.(isSearchPotentiallyActive);
  }, [isSearchPotentiallyActive, onSearchStateChange]);

  return (
    <div 
      className={`search-container ${inputValue ? 'has-input' : ''}`}
    >
      <div className="search-bar-inner-container">
        <div className={`icon-wrapper`}>
          <DoryLogo />
        </div>
        <input
          ref={searchInputRef}
          className="search-input"
          type="text"
          placeholder="Search for links, people, content..."
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={onInputKeyDown}
        />
        {showSpinner && (
          <div className="spinner-wrapper">
            <div className="spinner"></div>
          </div>
        )}
      </div>

      {/* NEW: Keyboard shortcut hint */}
      <div className="keyboard-shortcut-hint">
        Press <kbd>{isMac ? 'Cmd+Shift+Space' : 'Ctrl+Shift+Space'}</kbd> to search from any webpage
      </div>
      
      {/* Search results header */}
      {showResultsList && (
        <>
          <div className="results-header">
            {displayMode === 'semantic' ? 'Semantic Engine Results' : 'Quick Launch Results'}
          </div>
          <ul className="results-list" onWheel={handleScroll}>
            {/* Map over the sliced visible results */}
            {visibleResults.map((item: UnifiedLocalSearchResult, idx) => {
              // Calculate the actual index in the full list for selection check
              const actualIndex = startIndex + idx;
              return (
                <li
                  key={item.id} // Use item.id as key
                  className={`result-item ${selectedIndex === actualIndex ? 'selected' : ''}`}
                  // Pass the item from visibleResults, click handler is fine
                  onClick={() => handleResultClick(item)}
                  // Set selectedIndex to the actual index in the full list
                  onMouseEnter={() => setSelectedIndex(actualIndex)}
                >
                  <img 
                    src={getFaviconUrl(item.url)} 
                    alt="" 
                    className="result-favicon" 
                    onError={(e) => (e.currentTarget.style.visibility = 'hidden')}
                  />
                  <div className="result-content">
                    <div className="result-title">{item.title}</div>
                    <div className="result-url">{item.url}</div>
                    {/* Show explanation only for semantic results */}
                    {item.explanation && item.source === 'semantic' && (
                      <div className="result-explanation">
                        <span className="explanation-label">Why: </span>
                        {item.explanation}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {/* Searching message - Indicate current mode */}
      {showSearching && (
        <div className="status-message searching">
          {displayMode === 'semantic' ? 'Searching semantic engine...' : 'Searching quick launcher...'}
        </div>
      )}

      {/* No results fallback - Indicate current mode */}
      {showNoResults && (
        <div className="status-message no-results">
          {displayMode === 'semantic' ? 'No results found in semantic engine' : 'No results found in quick launcher'}
        </div>
      )}
       {/* Can add semanticError display here if desired */}
    </div>
  );
};

export default NewTabSearchBar;