import React, { useState, ChangeEvent, KeyboardEvent } from 'react';
import SearchIcon from '@/components/searchIcon';
import { RefinementIcon } from './icons';

interface SearchBarProps {
  onSearch: (query: string) => void;
  isLoading?: boolean;
  variant?: 'default' | 'refinement';
  initialValue?: string;
  readOnly?: boolean;
}

const SearchBar: React.FC<SearchBarProps> = ({ 
  onSearch, 
  isLoading = false, 
  variant = 'default',
  initialValue = '',
  readOnly = false
}) => {
  const [query, setQuery] = useState(initialValue);

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
  };

  const handleKeyPress = async (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !isLoading && query.trim()) {
      await onSearch(query);
    }
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      width: '100%',
      position: 'relative',
    }}>
      {variant === 'default' ? <SearchIcon /> : <RefinementIcon />}
      <input
        type="text"
        value={query}
        onChange={handleInputChange}
        onKeyDown={handleKeyPress}
        placeholder={variant === 'refinement' ? "I remember it's like a picture in my head..." : "Search your memory..."}
        readOnly={readOnly}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'white',
          fontSize: '14px',
          fontWeight: 400,
          opacity: readOnly ? 0.7 : 1,
          fontFamily: 'Cabinet Grotesk, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
          lineHeight: '18px',
          width: '100%',
          padding: 0,
          margin: 0,
          outline: 'none',
          cursor: readOnly ? 'default' : 'text',
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