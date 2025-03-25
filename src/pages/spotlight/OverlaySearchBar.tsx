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
  // 1. Use overlay search hook that uses messaging
  // ------------------------------
  const {
    inputValue,
    setInputValue,
    handleEnterKey,
    isSearching,
    results,
    semanticEnabled,
    toggleSemanticSearch
  } = useOverlaySearch();

  // ------------------------------
  // 2. Local state for keyboard highlight
  // ------------------------------
  const [selectedIndex, setSelectedIndex] = useState(-1);

  // ------------------------------
  // 3. Ref for focusing the input
  // ------------------------------
  const searchInputRef = useRef<HTMLInputElement>(null);

  // ------------------------------
  // 4. Debounce logic for "searching..." vs. "no results"
  // ------------------------------
  const [lastKeystrokeTime, setLastKeystrokeTime] = useState(Date.now());
  const timeSinceLastKeystroke = Date.now() - lastKeystrokeTime;
  const debounceElapsed = timeSinceLastKeystroke > 1000;

  // Update keystroke time whenever input changes
  useEffect(() => {
    setLastKeystrokeTime(Date.now());
  }, [inputValue]);

  // Reset selected index on new results
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
  // 7. Keyboard events (arrows, Enter, Escape)
  // ------------------------------
  const onInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (results.length > 0) {
        setSelectedIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0));
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (results.length > 0) {
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1));
      }
    } else if (e.key === 'Escape') {
      if (onClose) {
        onClose();
      }
    } else if (e.key === 'Enter') {
      if (selectedIndex >= 0 && selectedIndex < results.length) {
        e.preventDefault();
        navigateToResult(results[selectedIndex]);
      } else if (inputValue.trim()) {
        // fallback: normal search
        handleEnterKey(inputValue);
      }
    }
  };

  // ------------------------------
  // 8. Navigate to a result
  // ------------------------------
  const navigateToResult = (result: SearchResult) => {
    // Open in a new tab instead of navigating current page
    window.open(result.url, '_blank');
  };

  // ------------------------------
  // 9. Click on a result item
  // ------------------------------
  const handleResultClick = (result: SearchResult) => {
    navigateToResult(result);
  };

  // ------------------------------
  // 10. Conditionals for UI states - Matching NewTabSearchBar exactly
  // ------------------------------
  const showResults = inputValue.length >= 2 && (results.length > 0 || !debounceElapsed);
  const showNoResults =
    inputValue.length >= 2 &&
    results.length === 0 &&
    !isSearching &&
    debounceElapsed;
  const showSearching =
    inputValue.length >= 2 &&
    results.length === 0 &&
    (!debounceElapsed || isSearching);
  const showSearchModeIndicator = inputValue.length >= 2;

  // Show spinner when searching or during debounce period (for both modes)
  const showSpinner = isSearching || (inputValue.length >= 2 && !debounceElapsed);

  return (
    <div className="search-container">
      {/* Top row: Dory icon + input + spinner */}
      <div className="search-bar-inner-container">
        {/* Icon can toggle semantic mode */}
        <div
          className={[
            'icon-wrapper',
            semanticEnabled ? 'active' : '',
            'clickable' // because we always want it clickable
          ].join(' ').trim()}
          onClick={toggleSemanticSearch}
          title={semanticEnabled ? 'Disable semantic search' : 'Enable semantic search'}
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

      {/* Search mode indicator (semantic vs. quick launch) */}
      <div className={`search-mode-indicator ${showSearchModeIndicator ? '' : 'hidden'}`}>
        {semanticEnabled ? 'Semantic Search Mode' : 'Quick Launch Mode'}
      </div>

      {/* Show the results list */}
      {showResults && (
        <ul className="results-list">
          {results.map((item: SearchResult, idx) => (
            <li
              key={item.id || idx}
              className={`result-item ${idx === selectedIndex ? 'selected' : ''}`}
              onClick={() => handleResultClick(item)}
              onMouseEnter={() => setSelectedIndex(idx)}
            >
              <div className="result-title">{item.title}</div>
              <div className="result-url">{item.url}</div>
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

      {/* Searching message (if no results yet and within the "debounce" or actively searching) */}
      {showSearching && (
        <div className="status-message searching">
          Searching...
        </div>
      )}

      {/* No results fallback */}
      {showNoResults && (
        <div className="status-message no-results">
          No results found. Try refining your search.
        </div>
      )}
    </div>
  );
};

export default OverlaySearchBar; 