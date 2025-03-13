import React, { useRef, useEffect } from 'react';
import NewTabSearchBar from '../../components/NewTabSearchBar';
import ThemeToggle from './ThemeToggle';
import styled from 'styled-components';
import { trackSearchClick } from '../../services/eventService';
import { useHybridSearch } from '../../utils/useSearch';

const Container = styled.div`
  width: 100%;
  height: 100vh;
  position: relative;
`;

const SearchContainer = styled.div`
  width: 600px;
  max-width: 90%;
  background-color: transparent;
  border-radius: 12px;
  padding: 16px 20px;
  border: 1px solid var(--border-color);
  transition: all 0.3s ease;
  
  position: absolute;
  left: 50%;
  top: 40vh;
  transform: translateX(-50%);
  
  &:hover {
    border-color: var(--border-hover-color);
    box-shadow: 0 0 20px var(--shadow-color);
  }

  &:focus-within {
    border-color: var(--border-focus-color);
    box-shadow: 0 0 25px var(--shadow-focus-color);
  }
`;

const ResultsList = styled.ul`
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  max-height: 50vh;
  overflow-y: auto;
  border-top: 1px solid var(--border-color);
  transition: max-height 0.3s ease, opacity 0.3s ease;
  opacity: 1;
`;

const ResultItem = styled.li`
  padding: 10px 12px;
  cursor: pointer;
  transition: background-color 0.2s;
  border-radius: 8px;
  margin: 4px 0;

  &:hover {
    background-color: var(--item-hover-bg);
  }
`;

const ResultTitle = styled.div`
  font-size: 16px;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const ResultUrl = styled.div`
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

// Replace separate message components with a unified StatusMessage
const StatusMessage = styled.div<{ isVisible: boolean }>`
  text-align: center;
  padding: 10px 12px; /* Match ResultItem padding */
  color: var(--text-secondary);
  min-height: 24px; /* Ensure consistent height */
  display: ${props => props.isVisible ? 'flex' : 'none'}; /* Remove from layout when invisible */
  align-items: center;
  justify-content: center;
  transition: opacity 0.2s ease; /* Only transition opacity, not display */
  font-size: ${props => props.children === 'No results found' ? '18px' : '14px'};
  font-style: ${props => props.children === 'Searching...' ? 'italic' : 'normal'};
  border-radius: 8px; /* Match ResultItem */
  margin: 4px 0; /* Match ResultItem */
`;

const SearchModeIndicator = styled.div<{ isVisible: boolean }>`
  margin-top: 8px;
  text-align: center;
  color: var(--text-secondary);
  font-size: 12px;
  font-style: italic;
  opacity: ${props => props.isVisible ? 0.7 : 0};
  transition: opacity 0.3s ease;
`;

const Footer = styled.footer`
  position: fixed;
  bottom: 0;
  left: 0;
  width: 100%;
  display: flex;
  justify-content: center;
  padding: 16px;
`;

const NewTab: React.FC = () => {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const {
    inputValue,
    setInputValue,
    handleEnterKey,
    isSearching,
    results,
    semanticEnabled,
    toggleSemanticSearch
  } = useHybridSearch();

  // Handle input changes
  const handleQueryChange = (newQuery: string) => {
    setInputValue(newQuery);
  };

  // Handle result clicks
  const handleResultClick = (result: any) => {
    // Track the click for learning
    trackSearchClick(
      result.searchSessionId || 'local-session',
      result.id || result.pageId,
      results.findIndex(r => r.id === result.id),
      result.url,
      inputValue // current search query
    );

    // Navigate to the result
    window.location.href = result.url;
  };

  // Handle special keys
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && inputValue.trim()) {
      handleEnterKey(inputValue);
    }
  };

  // Focus the search input on mount and when pressing '/'
  useEffect(() => {
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }

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

  // Determine if we show the results list
  const showResults = inputValue.length >= 2 && results.length > 0;
  const showNoResults = inputValue.length >= 2 && results.length === 0 && !isSearching;
  const showSearchMode = inputValue.length >= 2;

  return (
    <Container>
      <SearchContainer>
        <NewTabSearchBar
          value={inputValue}
          onChange={handleQueryChange}
          onKeyDown={handleKeyDown}
          isLoading={isSearching}
          inputRef={searchInputRef}
          semanticEnabled={semanticEnabled}
          onToggleSemantic={toggleSemanticSearch}
        />

        <SearchModeIndicator isVisible={showSearchMode}>
          {semanticEnabled ? 'Semantic Search Mode' : 'Quick Results Mode'}
        </SearchModeIndicator>

        {showResults && (
          <ResultsList>
            {results.map(result => (
              <ResultItem 
                key={result.id} 
                onClick={() => handleResultClick(result)}
              >
                <ResultTitle>{result.title}</ResultTitle>
                <ResultUrl>{result.url}</ResultUrl>
              </ResultItem>
            ))}
          </ResultsList>
        )}

        <StatusMessage isVisible={showNoResults}>
          No results found. Try refining your search.
        </StatusMessage>

      </SearchContainer>
      <ThemeToggle />
    </Container>
  );
};

export default NewTab;