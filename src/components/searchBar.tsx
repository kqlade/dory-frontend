import React, { useState, ChangeEvent, KeyboardEvent } from 'react';
import SearchIcon from '@/components/searchIcon';

interface SearchBarProps {
  onSearch: (query: string) => Promise<void>;
  isLoading?: boolean;
}

const SearchBar: React.FC<SearchBarProps> = ({ onSearch, isLoading = false }) => {
  const [searchQuery, setSearchQuery] = useState<string>('');

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  const handleKeyPress = async (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !isLoading && searchQuery.trim()) {
      await onSearch(searchQuery);
    }
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-end',
      gap: '8px',
      width: '100%',
      opacity: isLoading ? 0.7 : 1,
    }}>
      <SearchIcon />
      <input
        type="text"
        value={searchQuery}
        onChange={handleInputChange}
        onKeyPress={handleKeyPress}
        placeholder="I remember it! It's like a picture in my head..."
        disabled={isLoading}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'white',
          fontSize: '14px',
          fontWeight: 'normal',
          opacity: 0.9,
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
          lineHeight: '18px',
          width: '100%',
          padding: 0,
          margin: 0,
          outline: 'none',
          cursor: isLoading ? 'not-allowed' : 'text',
        }}
      />
      {isLoading && (
        <div style={{
          width: '16px',
          height: '16px',
          border: '2px solid rgba(255, 255, 255, 0.3)',
          borderTop: '2px solid white',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
          marginRight: '8px',
        }} />
      )}
    </div>
  );
};

export default SearchBar; 