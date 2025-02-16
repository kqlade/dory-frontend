// src/components/content.tsx
import React, { useState } from 'react';
import DoryMessage from './DoryMessage';
import SearchResultCard from './SearchResultCard';
import SearchBar from './searchBar';
import { ChevronIcon } from './icons';
import type { SearchResult } from '../types/search';

interface ContentProps {
  searchResults: SearchResult[] | null;
  isLoading: boolean;
  error: string | null;
  hasSearched?: boolean;  // New prop to track if a search has been performed
}

type ActiveSection = 'search' | 'results' | null;

const Content: React.FC<ContentProps> = ({ searchResults, isLoading, error, hasSearched = false }) => {
  const [activeSection, setActiveSection] = useState<ActiveSection>(null);

  if (isLoading) {
    return (
      <main style={{ 
        flex: 1,
        backgroundColor: '#1E1E1E',
        position: 'relative',
        paddingLeft: '16px',
        paddingRight: '16px',
        paddingTop: '18px',
      }}>
        <DoryMessage type="suggestion">Searching...</DoryMessage>
      </main>
    );
  }

  if (error) {
    return (
      <main style={{ 
        flex: 1,
        backgroundColor: '#1E1E1E',
        position: 'relative',
        paddingLeft: '16px',
        paddingRight: '16px',
        paddingTop: '18px',
      }}>
        <DoryMessage type="error">{error}</DoryMessage>
      </main>
    );
  }

  if (!searchResults || searchResults.length === 0) {
    return (
      <main style={{ 
        flex: 1,
        backgroundColor: '#1E1E1E',
        position: 'relative',
        paddingLeft: '16px',
        paddingRight: '16px',
        paddingTop: '18px',
      }}>
        {hasSearched && (
          <DoryMessage type="suggestion">
            Hmm, I'm having trouble finding what you're looking for, what else do you remember about it?
          </DoryMessage>
        )}
      </main>
    );
  }

  const bestResult = searchResults.find(result => result.isHighlighted) || searchResults[0];
  
  // Only show non-highlighted results as alternatives
  const alternativeResults = searchResults.filter(result => !result.isHighlighted);

  const handleSectionToggle = (section: ActiveSection) => {
    setActiveSection(current => current === section ? null : section);
  };

  return (
    <main style={{ 
      flex: 1,
      backgroundColor: '#1E1E1E',
      position: 'relative',
      paddingLeft: '16px',
      paddingRight: '16px',
      paddingTop: '18px',
    }}>
      <DoryMessage type="suggestion">
        I think this is what you're looking for:
      </DoryMessage>

      <SearchResultCard result={bestResult} />

      <DoryMessage type="alternative">
        Not what you remember seeing?
      </DoryMessage>

      {/* Button Row */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        paddingLeft: '25px',
        paddingRight: '25px',
      }}>
        <div style={{ flex: 1, marginRight: '16px' }}>
          <button
            onClick={() => handleSectionToggle('search')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: 'transparent',
              border: 'none',
              padding: '0 0 8px 0',
              color: 'white',
              opacity: activeSection === 'search' ? 0.9 : 0.7,
              cursor: 'pointer',
              width: '100%',
              textAlign: 'left',
              fontFamily: 'Cabinet Grotesk, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
              fontSize: '13px',
              fontWeight: 400,
              transition: 'opacity 0.1s ease',
            }}
            onMouseEnter={(e) => e.currentTarget.style.opacity = '0.9'}
            onMouseLeave={(e) => e.currentTarget.style.opacity = activeSection === 'search' ? '0.9' : '0.7'}
          >
            <ChevronIcon direction={activeSection === 'search' ? 'up' : 'down'} />
            Add search details
          </button>
        </div>

        {alternativeResults.length > 0 && (
          <div style={{ flex: 1 }}>
            <button
              onClick={() => handleSectionToggle('results')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: 'transparent',
                border: 'none',
                padding: '0 0 8px 0',
                color: 'white',
                opacity: activeSection === 'results' ? 0.9 : 0.7,
                cursor: 'pointer',
                width: '100%',
                textAlign: 'left',
                fontFamily: 'Cabinet Grotesk, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
                fontSize: '13px',
                fontWeight: 400,
                transition: 'opacity 0.1s ease',
              }}
              onMouseEnter={(e) => e.currentTarget.style.opacity = '0.9'}
              onMouseLeave={(e) => e.currentTarget.style.opacity = activeSection === 'results' ? '0.9' : '0.7'}
            >
              <ChevronIcon direction={activeSection === 'results' ? 'up' : 'down'} />
              See other results
            </button>
          </div>
        )}
      </div>

      {/* Expanded Content */}
      {activeSection && (
        <div style={{
          marginTop: '8px',
          position: 'relative',
        }}>
          {activeSection === 'search' ? (
            <>
              <div style={{ paddingBottom: '6px', position: 'relative' }}>
                <SearchBar 
                  variant="refinement"
                  onSearch={async (query) => {
                    // TODO: Implement search functionality
                    console.log('Search query:', query);
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: '1px',
                    backgroundColor: 'rgba(255, 255, 255, 0.1)'
                  }}
                />
              </div>
            </>
          ) : (
            alternativeResults.map((result, index) => (
              <SearchResultCard key={index} result={result} />
            ))
          )}
        </div>
      )}
    </main>
  );
};

export default Content;