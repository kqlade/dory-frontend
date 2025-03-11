import React, { useRef, useEffect } from 'react';
import NewTabSearchBar from '../../components/NewTabSearchBar';
import ThemeToggle from './ThemeToggle';
import styled from 'styled-components';
import { trackSearchClick } from '../../services/eventService';
import { useHybridSearch } from '../../utils/useSearch';

const Container = styled.div`
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
`;

const SearchContainer = styled.div`
  width: 600px;
  max-width: 90%;
  background-color: transparent;
  border-radius: 12px;
  padding: 16px 20px;
  border: 1px solid var(--border-color);
  transition: all 0.3s ease;
  margin-bottom: 10vh;

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
  max-height: 60vh;
  overflow-y: auto;
  border-top: 1px solid var(--border-color);
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

const LoadingIndicator = styled.div`
  text-align: center;
  padding: 10px;
  color: var(--text-secondary);
  font-style: italic;
`;

const SemanticResultsHeader = styled.div`
  font-size: 14px;
  font-weight: 500;
  color: var(--text-secondary);
  margin-top: 16px;
  margin-bottom: 8px;
  padding: 0 12px;
  border-top: 1px solid var(--border-color);
  padding-top: 12px;
`;

const NoResultsMessage = styled.div`
  text-align: center;
  padding: 20px;
  color: var(--text-secondary);
`;

const Footer = styled.footer`
  position: fixed;
  bottom: 0;
  width: 100%;
  display: flex;
  justify-content: center;
  padding: 16px;
`;

const NewTab: React.FC = () => {
  const searchInputRef = useRef<HTMLInputElement>(null);
  
  // Use our custom hybrid search hook
  const {
    inputValue,
    setInputValue,
    handleEnterKey,
    results,
    isSearching,
    localResults,
    quickResults,
    semanticResults
  } = useHybridSearch();

  // Handle input change
  const handleQueryChange = (newQuery: string) => {
    setInputValue(newQuery);
  };

  // Handle result click
  const handleResultClick = (result: any) => {
    // Track the click for analytics
    // Log the search click locally for later sync via cold storage
    const searchSessionId = result.searchSessionId || 'local-session';
    const pageId = result.id || result.pageId;
    const position = result.position || 0;
    const url = result.url;
    const query = inputValue; // Use the current search query
    
    trackSearchClick(searchSessionId, pageId, position, url, query);
    
    // Navigate to the URL
    window.location.href = url;
  };

  // Handle key events
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleEnterKey(e.currentTarget.value);
    }
  };

  // Focus input on mount and ensure that keystrokes are directed to the search input
  useEffect(() => {
    window.focus();
    if (document.body) {
      document.body.tabIndex = -1;
      document.body.focus();
    }
    
    const focusTimer = setTimeout(() => {
      searchInputRef.current?.focus();
    }, 50);

    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      if (document.activeElement !== searchInputRef.current) {
        searchInputRef.current?.focus();
      }
    };

    document.addEventListener('keydown', handleGlobalKeyDown, true);
    
    return () => {
      clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleGlobalKeyDown, true);
    };
  }, []);

  // Determine if we have any results to show
  const hasAnyResults = results.length > 0;
  const hasSemanticResults = semanticResults.length > 0;
  
  // Split results into main (local + backend quick) and semantic for display
  const mainResults = results.filter(r => r.source !== 'semantic');
  const displaySemanticResults = results.filter(r => r.source === 'semantic');

  return (
    <Container>
      <SearchContainer>
        <NewTabSearchBar
          ref={searchInputRef}
          value={inputValue}
          onChange={handleQueryChange}
          onKeyDown={handleKeyDown}
          placeholder="Find what you forgot..."
        />
        
        {inputValue.trim() && (
          <ResultsList>
            {isSearching && <LoadingIndicator>Searching...</LoadingIndicator>}
            
            {mainResults.map((result) => (
              <ResultItem key={result.id} onClick={() => handleResultClick(result)}>
                <ResultTitle>{result.title}</ResultTitle>
                <ResultUrl>{result.url}</ResultUrl>
              </ResultItem>
            ))}
            
            {/* Show semantic results with a header if we have any */}
            {displaySemanticResults.length > 0 && (
              <>
                <SemanticResultsHeader>Semantic Results</SemanticResultsHeader>
                {displaySemanticResults.map((result) => (
                  <ResultItem key={result.id} onClick={() => handleResultClick(result)}>
                    <ResultTitle>{result.title}</ResultTitle>
                    <ResultUrl>{result.url}</ResultUrl>
                  </ResultItem>
                ))}
              </>
            )}
            
            {!isSearching && !hasAnyResults && (
              <NoResultsMessage>No results found</NoResultsMessage>
            )}
          </ResultsList>
        )}
      </SearchContainer>
      
      <Footer>
        <ThemeToggle />
      </Footer>
    </Container>
  );
};

export default NewTab;