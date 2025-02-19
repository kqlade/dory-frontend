// src/components/content.tsx
import React, { useState } from 'react';
import DoryMessage from './DoryMessage';
import SearchBar from './searchBar';
import SearchSection from './SearchSection';
import { semanticSearch } from '../api/client';
import type { SearchResult } from '../api/types';

interface ContentProps {
  searchResults: SearchResult[] | null;
  isLoading: boolean;
  error: string | null;
  hasSearched?: boolean;
  query: string;
}

interface SearchSectionData {
  query: string;
  results: SearchResult[];
  showSearchBar?: boolean;
}

const Content: React.FC<ContentProps> = ({ 
  searchResults, 
  isLoading, 
  error, 
  hasSearched = false,
  query = ''
}) => {
  const [searchSections, setSearchSections] = useState<SearchSectionData[]>([]);
  const [refinementCount, setRefinementCount] = useState(0);
  const [isRefinementLoading, setIsRefinementLoading] = useState(false);
  const [currentFullQuery, setCurrentFullQuery] = useState('');

  // Handle initial search results
  React.useEffect(() => {
    if (searchResults && hasSearched) {
      setCurrentFullQuery(query);
      setSearchSections([{ query, results: searchResults }]);
    }
  }, [searchResults, hasSearched, query]);

  const handleRefinementSearch = async (refinementQuery: string) => {
    setIsRefinementLoading(true);
    try {
      const newFullQuery = `${currentFullQuery} ${refinementQuery}`;
      const response = await semanticSearch(newFullQuery);
      
      setCurrentFullQuery(newFullQuery);
      setSearchSections(prev => {
        const updated = [...prev];
        if (updated.length > 0) {
          updated[updated.length - 1].showSearchBar = true;
          updated[updated.length - 1].query = refinementQuery;
        }
        return [...updated, { query: '', results: response.results }];
      });
      setRefinementCount(prev => prev + 1);
    } catch (err) {
      console.error('Refinement search error:', err);
    } finally {
      setIsRefinementLoading(false);
    }
  };

  // Initial loading state (no sections yet)
  if (isLoading && !searchSections.length) {
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

  if (!searchSections.length) {
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

  return (
    <main style={{ 
      flex: 1,
      backgroundColor: '#1E1E1E',
      position: 'relative',
      paddingLeft: '16px',
      paddingRight: '16px',
      paddingTop: '18px',
    }}>
      {searchSections.map((section, index) => (
        <div key={index} style={{ marginBottom: '24px' }}>
          <SearchSection
            results={section.results}
            onAddDetails={() => {
              setSearchSections(prev => {
                const updated = [...prev];
                // Toggle the showSearchBar value
                updated[index].showSearchBar = !updated[index].showSearchBar;
                return updated;
              });
            }}
            canAddDetails={index === searchSections.length - 1 && refinementCount < 2}
          />
          
          {section.showSearchBar && (
            <div style={{ paddingBottom: '6px', position: 'relative', marginTop: '12px' }}>
              <SearchBar 
                variant="refinement"
                onSearch={handleRefinementSearch}
                isLoading={isRefinementLoading && index === searchSections.length - 1}
                initialValue={index !== searchSections.length - 1 ? section.query : ''}
                readOnly={index !== searchSections.length - 1}
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
          )}
        </div>
      ))}
      
      {/* Show loading message for refinement searches */}
      {isRefinementLoading && (
        <div style={{ marginTop: '24px' }}>
          <DoryMessage type="suggestion">Searching...</DoryMessage>
        </div>
      )}
    </main>
  );
};

export default Content;