// src/components/App.tsx
import React, { useState } from 'react';
import Header from '@/components/header';
import Content from '@/components/content';
import type { SearchResult } from '../types/search';

const App: React.FC = () => {
  const [searchState, setSearchState] = useState<{
    results: SearchResult[] | null;
    isLoading: boolean;
    error: string | null;
    hasSearched: boolean;
  }>({
    results: null,
    isLoading: false,
    error: null,
    hasSearched: false
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
      />
    </div>
  );
};

export default App;