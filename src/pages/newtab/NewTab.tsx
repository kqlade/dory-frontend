import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { searchWithSSE, trackSearchClick } from '../../api/client';
import { SearchResult } from '../../api/types';
import NewTabSearchBar from '../../components/NewTabSearchBar';
import ThemeToggle from './ThemeToggle';
import styled from 'styled-components';
import { getUserInfo } from '../../services/auth';
import debounce from 'lodash/debounce';

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
  padding: 12px 8px;
  cursor: pointer;
  border-bottom: 1px solid var(--border-color);

  &:hover {
    background-color: var(--hover-color);
  }
`;

const ResultTitle = styled.div`
  font-weight: 500;
  margin-bottom: 4px;
`;

const ResultUrl = styled.div`
  font-size: 12px;
  color: var(--text-secondary-color);
`;

const NewTab: React.FC = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Debounced search function to avoid excessive API calls as the user types.
  const debouncedSearch = useMemo(
    () =>
      debounce((searchText: string) => {
        if (!searchText || !userId) return;
        setIsSearching(true);
        searchWithSSE(
          searchText,
          userId,
          false, // Quick search while typing
          (data, type) => {
            if (type === 'quicklaunch') {
              setResults(data.results);
              setIsSearching(false);
            } else if (type === 'error') {
              console.error('Search error:', data.message);
              setIsSearching(false);
            }
          }
        );
      }, 150),
    [userId]
  );

  // Manage focus on mount and ensure that keystrokes are directed to the search input.
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
        event.preventDefault();
        event.stopPropagation();
      }
    };

    document.addEventListener('keydown', handleGlobalKeyDown, true);
    return () => {
      clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleGlobalKeyDown, true);
    };
  }, []);

  // Fetch the user info on component mount.
  useEffect(() => {
    const fetchUserId = async () => {
      try {
        const userInfo = await getUserInfo();
        if (userInfo) {
          setUserId(userInfo.id);
        }
      } catch (error) {
        console.error('Error fetching user info:', error);
      }
    };
    fetchUserId();
  }, []);

  // Trigger debounced search whenever the query changes.
  useEffect(() => {
    if (query) {
      debouncedSearch(query);
    }
    return () => {
      debouncedSearch.cancel();
    };
  }, [query, debouncedSearch]);

  // Final deep search when the user submits the query.
  const handleSearch = async (finalQuery: string) => {
    if (!finalQuery.trim() || !userId) return;
    setIsSearching(true);
    searchWithSSE(
      finalQuery,
      userId,
      true, // Deep search on submit
      (data, type) => {
        if (type === 'quicklaunch' || type === 'semantic') {
          setResults(data.results);
        } else if (type === 'complete') {
          setIsSearching(false);
        } else if (type === 'error') {
          console.error('Search error:', data.message);
          setIsSearching(false);
        }
      }
    );
  };

  // Handle clicks on search results with tracking.
  const handleResultClick = (result: SearchResult, index: number) => {
    if (result.searchSessionId && result.pageId) {
      trackSearchClick(result.searchSessionId, result.pageId, index);
    }
    window.open(result.metadata.url, '_self');
  };

  // Memoized handler for query changes.
  const handleQueryChange = useCallback((newQuery: string) => {
    setQuery(newQuery);
  }, []);

  return (
    <Container>
      <SearchContainer>
        <NewTabSearchBar
          onSearch={handleSearch}
          isLoading={isSearching}
          inputRef={searchInputRef}
          query={query}
          onQueryChange={handleQueryChange}
        />
        {results.length > 0 && (
          <ResultsList>
            {results.map((result, index) => (
              <ResultItem key={result.docId} onClick={() => handleResultClick(result, index)}>
                <ResultTitle>{result.metadata.title}</ResultTitle>
                <ResultUrl>{result.metadata.url}</ResultUrl>
              </ResultItem>
            ))}
          </ResultsList>
        )}
      </SearchContainer>
      <ThemeToggle />
    </Container>
  );
};

export default NewTab;