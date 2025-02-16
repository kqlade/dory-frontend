import React from 'react';
import { ExternalLinkIcon } from './icons';
import type { SearchResultCardProps } from '../types/search';

const SearchResultCard: React.FC<SearchResultCardProps> = ({ result }) => {
  return (
    <div style={{
      marginLeft: '25px',
      marginRight: '25px',
      marginBottom: '18px',
    }}>
      <a
        href={result.metadata.url || '#'}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          textDecoration: 'none',
          color: 'white',
          display: 'block',
        }}
      >
        <div style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '8px',
          marginBottom: '6px',
        }}>
          <span style={{
            fontSize: '13px',
            fontWeight: 700,
            opacity: 0.9,
            fontFamily: 'Cabinet Grotesk, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
            minWidth: 0,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {result.metadata.title || 'Untitled Document'}
          </span>
          <ExternalLinkIcon />
        </div>
        <span style={{
          fontSize: '13px',
          fontWeight: 400,
          opacity: 0.5,
          fontFamily: 'Cabinet Grotesk, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {result.metadata.url || 'No URL available'}
        </span>
      </a>
    </div>
  );
};

export default SearchResultCard; 