import React, { useState, ChangeEvent, KeyboardEvent } from 'react';
import SearchIcon from '@/components/searchIcon';
import { RefinementIcon } from './icons';

interface SearchBarProps {
  onSearch: (query: string) => Promise<void>;
  isLoading?: boolean;
  variant?: 'search' | 'refinement';
}

const SearchBar: React.FC<SearchBarProps> = ({ onSearch, isLoading = false, variant = 'search' }) => {
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
      {variant === 'search' ? <SearchIcon /> : <RefinementIcon />}
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
          fontWeight: 400,
          opacity: 0.9,
          fontFamily: 'Cabinet Grotesk, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
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
          marginRight: '8px',
          display: 'flex',
          alignItems: 'flex-end'
        }}>
          <style>
            {`
              @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
              }
              .spinner {
                box-sizing: border-box;
                width: 16px;
                height: 16px;
                border-radius: 50%;
                border: 2px solid transparent;
                border-top-color: white;
                border-left-color: white;
                border-right-color: white;
                animation: spin 0.8s linear infinite;
              }
            `}
          </style>
          <div className="spinner" />
        </div>
      )}
    </div>
  );
};

export default SearchBar; 