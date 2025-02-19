import React, { useState } from 'react';
import DoryMessage from './DoryMessage';
import SearchResultCard from './SearchResultCard';
import { ChevronIcon } from './icons';
import type { SearchResult } from '../api/types';

interface SearchSectionProps {
  results: SearchResult[];
  onAddDetails?: () => void;
  canAddDetails: boolean;
}

const SearchSection: React.FC<SearchSectionProps> = ({ 
  results,
  onAddDetails,
  canAddDetails
}) => {
  const [activeSection, setActiveSection] = useState<'results' | null>(null);
  
  const bestResult = results.find(result => result.isHighlighted) || results[0];
  const alternativeResults = results.filter(result => !result.isHighlighted);

  return (
    <div>
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
        {canAddDetails && (
          <div style={{ flex: 1, marginRight: '16px' }}>
            <button
              onClick={onAddDetails}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: 'transparent',
                border: 'none',
                padding: '0 0 8px 0',
                color: 'white',
                opacity: 0.7,
                cursor: 'pointer',
                width: '100%',
                textAlign: 'left',
                fontFamily: 'Cabinet Grotesk, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
                fontSize: '13px',
                fontWeight: 400,
                transition: 'opacity 0.1s ease',
              }}
              onMouseEnter={(e) => e.currentTarget.style.opacity = '0.9'}
              onMouseLeave={(e) => e.currentTarget.style.opacity = '0.7'}
            >
              <ChevronIcon direction="down" />
              Add search details
            </button>
          </div>
        )}

        {alternativeResults.length > 0 && (
          <div style={{ flex: 1 }}>
            <button
              onClick={() => setActiveSection(activeSection === 'results' ? null : 'results')}
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

      {/* Other Results */}
      {activeSection === 'results' && (
        <div style={{ marginTop: '8px' }}>
          {alternativeResults.map((result, index) => (
            <SearchResultCard key={index} result={result} />
          ))}
        </div>
      )}
    </div>
  );
};

export default SearchSection; 