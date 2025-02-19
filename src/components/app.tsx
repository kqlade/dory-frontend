// src/components/App.tsx
import React, { useState } from 'react';
import Header from '@/components/header';
import Content from '@/components/content';
import type { SearchResult } from '../api/types';

interface SearchState {
  results: SearchResult[] | null;
  isLoading: boolean;
  error: string | null;
  hasSearched: boolean;
  query: string;
}

const App: React.FC = () => {
  const [searchState, setSearchState] = useState<SearchState>({
    results: null,
    isLoading: false,
    error: null,
    hasSearched: false,
    query: ''
  });

  return (
    <div style={{
      backgroundColor: '#1E1E1E',
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      overflowX: 'hidden',
      boxSizing: 'border-box',
      borderRadius: '12px',
      overflow: 'hidden'
    }}>
      <Header onSearchStateChange={setSearchState} />
      <Content
        searchResults={searchState.results}
        isLoading={searchState.isLoading}
        error={searchState.error}
        hasSearched={searchState.hasSearched}
        query={searchState.query}
      />
    </div>
  );
};

export default App;