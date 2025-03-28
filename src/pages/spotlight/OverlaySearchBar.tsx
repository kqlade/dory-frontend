import React, { useRef, useState, useEffect, KeyboardEvent } from 'react';
import { useOverlaySearch } from '../../utils/useOverlaySearch';
import '../../components/NewTabSearchBar.css';

/**
 * Shape of each search result (customize fields as needed).
 */
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
 * Simple Dory logo for toggling semantic mode.
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
 * Version of SearchBar specifically for the overlay that uses messaging
 */
interface OverlaySearchBarProps {
  onClose?: () => void;
}

const OverlaySearchBar: React.FC<OverlaySearchBarProps> = ({ onClose }) => {
  // ------------------------------
  // 1. Use the refactored overlay search hook
  // ------------------------------
  const {
    inputValue,
    setInputValue,
    handleEnterKey,       // For local search trigger
    isSearching,          // Unified loading state (local or semantic)
    results,              // Unified results (local or semantic)
    performSemanticSearch // Function to trigger semantic search
  } = useOverlaySearch();

  // ------------------------------
  // 2. Local state for keyboard highlight & double-enter
  // ------------------------------
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [lastEnterPressTime, setLastEnterPressTime] = useState(0);
  // No displayMode needed here as hook manages unified results

  // ------------------------------
  // 3. Ref for focusing the input
  // ------------------------------
  const searchInputRef = useRef<HTMLInputElement>(null);

  // ------------------------------
  // 4. Debounce logic helper state
  // ------------------------------
  const [lastKeystrokeTime, setLastKeystrokeTime] = useState(Date.now());

  // Update keystroke time
  useEffect(() => {
    setLastKeystrokeTime(Date.now());
  }, [inputValue]);

  // Reset selected index when results change
  useEffect(() => {
    setSelectedIndex(-1);
  }, [results]);

  // Focus the input when the component mounts
  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  // ------------------------------
  // 6. Handle text input
  // ------------------------------
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  };

  // ------------------------------
  // 7. Keyboard events (arrows, Enter, Escape) - Updated
  // ------------------------------
  const onInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const resultsLength = results.length; // Use unified results

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (resultsLength > 0) {
        setSelectedIndex((prev) => (prev < resultsLength - 1 ? prev + 1 : 0));
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (resultsLength > 0) {
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : resultsLength - 1));
      }
    } else if (e.key === 'Escape') {
      if (onClose) {
        onClose();
      }
      setLastEnterPressTime(0); // Reset timer on escape
    } else if (e.key === 'Enter') {
      // Navigate if an item is selected
      if (selectedIndex >= 0 && selectedIndex < resultsLength) {
        e.preventDefault();
        navigateToResult(results[selectedIndex]); // Use unified results
        setLastEnterPressTime(0);
      } else if (inputValue.trim()) {
        // Handle single vs double enter
        const currentTime = Date.now();
        if (currentTime - lastEnterPressTime < 500) { // Double press
          console.log('[OverlaySearchBar] Double Enter detected - performing semantic search.');
          performSemanticSearch(inputValue); // Trigger semantic search via messaging
          setLastEnterPressTime(0);         // Reset time
        } else { // Single press
          console.log('[OverlaySearchBar] Single Enter detected - performing local search.');
          handleEnterKey(inputValue);       // Trigger local search via messaging
          setLastEnterPressTime(currentTime); // Store time of this press
        }
      } else { // Input is empty
        setLastEnterPressTime(0);
      }
    } else { // Any other key press
      // Reset enter timing if user types something else
      setLastEnterPressTime(0);
    }
  };

  // ------------------------------
  // 8. Navigate to a result - Unchanged (uses window.open)
  // ------------------------------
  const navigateToResult = (result: SearchResult) => {
    window.open(result.url, '_blank');
  };

  // ------------------------------
  // 9. Click on a result item - Unchanged
  // ------------------------------
  const handleResultClick = (result: SearchResult) => {
    navigateToResult(result);
  };

  // ------------------------------
  // 10. Conditionals for UI states - Simplified
  // ------------------------------
  const timeSinceLastKeystroke = Date.now() - lastKeystrokeTime;
  const debounceElapsed = timeSinceLastKeystroke > 1000; // Used for "No results" timing

  const isSearchPotentiallyActive = inputValue.length >= 2;

  // Show results if available and not searching
  const showResultsList = isSearchPotentiallyActive && results.length > 0 && !isSearching;
  // Show "Searching..." if loading
  const showSearching = isSearchPotentiallyActive && isSearching;
  // Show "No Results" if not loading, no results, and debounce time elapsed
  const showNoResults = isSearchPotentiallyActive && results.length === 0 && !isSearching && debounceElapsed;
  // Spinner shown when searching
  const showSpinner = isSearching;

  return (
    <div className="search-container">
      {/* Top row: Dory icon + input + spinner */}
      <div className="search-bar-inner-container">
        {/* Icon - No click handler, no active class */}
        <div
          className={'icon-wrapper'} // Base class only
          title="Dory" // Static title
        >
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
        />

        {showSpinner && (
          <div className="spinner-wrapper">
            <div className="spinner"></div>
          </div>
        )}
      </div>

      {/* REMOVED Search mode indicator */}

      {/* Show the results list - Use unified results */}
      {showResultsList && (
        <ul className="results-list">
          {results.map((item: SearchResult, idx) => (
            <li
              key={item.id || idx} // Add fallback key for safety if ID missing
              className={`result-item ${idx === selectedIndex ? 'selected' : ''}`}
              onClick={() => handleResultClick(item)}
              onMouseEnter={() => setSelectedIndex(idx)}
            >
              <div className="result-title">{item.title}</div>
              <div className="result-url">{item.url}</div>
              {/* Show explanation only for semantic results */}
              {item.explanation && item.source === 'semantic' && (
                <div className="result-explanation">
                  <span className="explanation-label">Why: </span>
                  {item.explanation}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Searching message */}
      {showSearching && (
        <div className="status-message searching">
          Searching...
        </div>
      )}

      {/* No results fallback */}
      {showNoResults && (
        <div className="status-message no-results">
          No results found.
        </div>
      )}
      {/* Can add error display here if desired */}
    </div>
  );
};

export default OverlaySearchBar; 