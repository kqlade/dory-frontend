// src/components/header.tsx
import React, { useState } from 'react';
import SearchBar from '@/components/searchBar';
import { semanticSearch } from '@/api/client';

const Header: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async (query: string) => {
    if (!query.trim()) return;
    
    setIsLoading(true);
    setError(null);

    try {
      const results = await semanticSearch(query);
      // TODO: Handle search results
      console.log('Search results:', results);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred while searching');
      console.error('Search error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <header
      style={{ 
        paddingTop: '12px',
        paddingBottom: '12px',
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