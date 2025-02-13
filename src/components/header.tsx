// src/components/header.tsx
import React from 'react';
import SearchBar from '@/components/searchBar';

const Header: React.FC = () => {
  const handleSearch = (query: string) => {
    // Handle search here
    console.log('Searching for:', query);
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
        <SearchBar onSearch={handleSearch} />
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