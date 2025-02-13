import React, { useState, ChangeEvent, KeyboardEvent } from 'react';
import SearchIcon from '@/components/searchIcon';

interface SearchBarProps {
  onSearch: (query: string) => void;
}

const SearchBar: React.FC<SearchBarProps> = ({ onSearch }) => {
  const [searchQuery, setSearchQuery] = useState<string>('');

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  const handleKeyPress = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      onSearch(searchQuery);
    }
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-end',
      gap: '8px',
      width: '100%',
    }}>
      <SearchIcon />
      <input
        type="text"
        value={searchQuery}
        onChange={handleInputChange}
        onKeyPress={handleKeyPress}
        placeholder="I remember it! It's like a picture in my head..."
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
          outline: 'none'
        }}
      />
    </div>
  );
};

export default SearchBar; 