// src/components/header.tsx
import React, { useState } from 'react';
import SearchBar from '@/components/searchBar';
import { semanticSearch } from '@/api/client';
import type { SearchResult } from '../types/search';

interface HeaderProps {
  onSearchStateChange: (state: {
    results: SearchResult[] | null;
    isLoading: boolean;
    error: string | null;
  }) => void;
}

const Header: React.FC<HeaderProps> = ({ onSearchStateChange }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async (query: string) => {
    if (!query.trim()) return;
    
    setIsLoading(true);
    setError(null);
    onSearchStateChange({ results: null, isLoading: true, error: null });

    try {
      const results = await semanticSearch(query);
      onSearchStateChange({ results, isLoading: false, error: null });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred while searching';
      setError(errorMessage);
      onSearchStateChange({ results: null, isLoading: false, error: errorMessage });
      console.error('Search error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <header
      style={{ 
        paddingTop: '12px',
        paddingBottom: '6px',
        boxSizing: 'border-box',
        position: 'relative'
      }}
    >
      <div style={{
        paddingLeft: '16px',
        paddingRight: '16px',
      }}>
        <SearchBar onSearch={handleSearch} isLoading={isLoading} />
        {error && (
          <div style={{
            color: '#ff6b6b',
            fontSize: '12px',
            marginTop: '8px',
            paddingLeft: '32px',
          }}>
            {error}
          </div>
        )}
      </div>
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: '16px',
          right: '16px',
          height: '1px',
          backgroundColor: 'rgba(255, 255, 255, 0.1)'
        }}
      />
    </header>
  );
};

export default Header;