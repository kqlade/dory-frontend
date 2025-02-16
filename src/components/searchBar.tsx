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
          width: '16px',
          height: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: '8px',
          position: 'relative'
        }}>
          <style>
            {`
              @keyframes dotRotate {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
              }
              .loading-dots {
                width: 16px;
                height: 16px;
                position: relative;
                animation: dotRotate 1s linear infinite;
              }
              .loading-dots::before {
                content: '';
                width: 3px;
                height: 3px;
                border-radius: 50%;
                background-color: white;
                position: absolute;
                left: 50%;
                top: 0;
                transform: translateX(-50%);
                box-shadow: 
                  0px 7px 0 white,
                  0px 14px 0 white,
                  7px 7px 0 rgba(255,255,255,0.75),
                  -7px 7px 0 rgba(255,255,255,0.75),
                  7px 0 0 rgba(255,255,255,0.5),
                  -7px 0 0 rgba(255,255,255,0.5),
                  7px 14px 0 rgba(255,255,255,0.25),
                  -7px 14px 0 rgba(255,255,255,0.25);
              }
            `}
          </style>
          <div className="loading-dots" />
        </div>
      )}
    </div>
  );
};

export default SearchBar; 