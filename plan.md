# Simplified Search Implementation Plan

This document outlines a straightforward approach to implement the backend's Unified Search API in our frontend, following KISS and DRY principles while leveraging existing libraries.

## Goals

1. Implement two-phase search (quick results while typing, deep semantic search on Enter)
2. Handle streaming Server-Sent Events (SSE) responses
3. Display and track search result interactions
4. Maintain clean, maintainable code

## Implementation Plan

### 1. Update API Client (1-2 days)

```typescript
// src/api/client.ts
import { EventSourcePolyfill } from 'event-source-polyfill'; // For SSE with additional features

// Existing libraries to leverage
import { debounce } from 'lodash-es'; // Already in node_modules

// Single source of search state with abort controller
let currentSearchController: AbortController | null = null;

export function searchWithSSE(
  query: string, 
  userId: string, 
  triggerSemantic = false, 
  onResults: (results: any, type: string) => void
) {
  // Cancel previous search if exists
  if (currentSearchController) {
    currentSearchController.abort();
  }
  
  // Create new controller
  currentSearchController = new AbortController();
  
  // Create EventSource for SSE
  const source = new EventSourcePolyfill(`${API_BASE}/api/unified-search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      query, 
      userId, 
      timestamp: Date.now(),
      triggerSemantic 
    }),
    signal: currentSearchController.signal
  });
  
  // Handle events
  source.addEventListener('message', (event) => {
    const data = JSON.parse(event.data);
    onResults(data, data.type);
    
    // Close connection when complete
    if (data.type === 'complete') {
      source.close();
    }
  });
  
  source.onerror = (error) => {
    console.error('SSE error:', error);
    source.close();
  };
  
  // Return function to close/abort
  return () => {
    source.close();
    if (currentSearchController) {
      currentSearchController.abort();
      currentSearchController = null;
    }
  };
}

// Simple click tracking function
export function trackSearchClick(searchSessionId: string, pageId: string, position: number) {
  // Use navigator.sendBeacon for non-critical tracking that works even during page navigation
  const data = JSON.stringify({
    searchSessionId,
    pageId,
    position,
    timestamp: Date.now()
  });
  
  if (navigator.sendBeacon) {
    navigator.sendBeacon(`${API_BASE}/api/unified-search/click`, data);
  } else {
    // Fallback to fetch for older browsers
    fetch(`${API_BASE}/api/unified-search/click`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: data,
      // Keep-alive to allow completion after navigation
      keepalive: true
    }).catch(e => console.error('Click tracking error:', e));
  }
}
```

### 2. Update NewTab.tsx (1-2 days)

```typescript
// Leveraging usehooks-ts library we already have
import { useDebounce } from 'usehooks-ts';

const NewTab: React.FC = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const debouncedQuery = useDebounce(query, 150); // Quick search debounce
  const searchInputRef = useRef<HTMLInputElement>(null);
  
  // Get user ID on mount - unchanged
  useEffect(() => {
    async function fetchUserId() {
      const userInfo = await getUserInfo();
      if (userInfo) {
        setUserId(userInfo.id);
      }
    }
    fetchUserId();
  }, []);

  // Handle search as user types (quick search)
  useEffect(() => {
    if (!debouncedQuery || !userId) return;
    
    setIsSearching(true);
    const closeSearch = searchWithSSE(
      debouncedQuery,
      userId,
      false, // Quick search while typing
      (data, type) => {
        if (type === 'quicklaunch') {
          setResults(data.results);
          setIsSearching(false);
        } else if (type === 'error') {
          console.error('Search error:', data.message);
          setIsSearching(false);
        }
      }
    );
    
    // Clean up search when component unmounts or query changes
    return closeSearch;
  }, [debouncedQuery, userId]);
  
  // Handle final search (deep search)
  const handleSearch = async (finalQuery: string) => {
    if (!finalQuery.trim() || !userId) return;
    
    setIsSearching(true);
    searchWithSSE(
      finalQuery,
      userId,
      true, // Deep search on submit
      (data, type) => {
        if (type === 'quicklaunch' || type === 'semantic') {
          setResults(data.results);
          // Don't hide spinner yet - wait for completion
        } else if (type === 'complete') {
          // Only hide spinner when all results are complete
          setIsSearching(false);
        } else if (type === 'error') {
          console.error('Search error:', data.message);
          setIsSearching(false);
        }
      }
    );
  };
  
  // Handle result click with tracking
  const handleResultClick = (result: SearchResult, index: number) => {
    if (result.searchSessionId) {
      trackSearchClick(result.searchSessionId, result.pageId, index);
    }
    window.open(result.url, '_self');
  };

  return (
    <Container>
      <SearchContainer>
        <NewTabSearchBar 
          value={query}
          onChange={setQuery}
          onSearch={handleSearch}
          isLoading={isSearching}
          inputRef={searchInputRef}
        />
        
        {/* Simple results list - no need for separate component */}
        {results.length > 0 && (
          <ResultsList>
            {results.map((result, index) => (
              <ResultItem 
                key={result.pageId}
                onClick={() => handleResultClick(result, index)}
              >
                <ResultTitle>{result.title}</ResultTitle>
                <ResultUrl>{result.url}</ResultUrl>
              </ResultItem>
            ))}
          </ResultsList>
        )}
      </SearchContainer>
      
      <ThemeToggle />
    </Container>
  );
};
```

### 3. Update NewTabSearchBar.tsx (0.5 day)

```typescript
// Only needs minor modifications to accept value and onChange props
interface NewTabSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onSearch: (query: string) => void;
  isLoading?: boolean;
  inputRef?: RefObject<HTMLInputElement>;
}

const NewTabSearchBar: React.FC<NewTabSearchBarProps> = ({ 
  value,
  onChange,
  onSearch, 
  isLoading = false,
  inputRef
}) => {
  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
  };
  
  const handleKeyPress = async (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && value.trim()) {
      await onSearch(value);
    }
  };

  return (
    <SearchContainer>
      <IconWrapper>
        <DoryLogo size={22} />
      </IconWrapper>
      <SearchInput
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleInputChange}
        onKeyDown={handleKeyPress}
        placeholder="Find what you forgot..."
        autoFocus
      />
      {isLoading && (
        <SpinnerWrapper>
          <Spinner />
        </SpinnerWrapper>
      )}
    </SearchContainer>
  );
};
```

### 4. Add Minimal Styling for Results (0.5 day)

```typescript
// Using styled-components we already have
const ResultsList = styled.ul`
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  max-height: 60vh;
  overflow-y: auto;
  border-top: 1px solid var(--border-color);
`;

const ResultItem = styled.li`
  padding: 12px 8px;
  cursor: pointer;
  border-bottom: 1px solid var(--border-color);
  
  &:hover {
    background-color: var(--hover-color);
  }
`;

const ResultTitle = styled.div`
  font-weight: 500;
  margin-bottom: 4px;
`;

const ResultUrl = styled.div`
  font-size: 12px;
  color: var(--text-secondary-color);
`;
```

## Why This Approach is Better

1. **Simpler Structure**:
   - No new component files created
   - Minimal changes to existing files
   - Focused on the essentials

2. **Leverages Existing Libraries**:
   - Uses EventSourcePolyfill for SSE (widely used, handles reconnection, etc.)
   - Uses useDebounce from usehooks-ts (already in our dependencies)
   - Uses navigator.sendBeacon for tracking (browser standard API)

3. **DRY Principles**:
   - Single search function that handles both quick and deep search
   - Unified result handling
   - Centralized search cancellation

4. **KISS Approach**:
   - Inline result rendering rather than complex component hierarchy
   - Simple state management with useState instead of complex patterns
   - Minimal styling focused on functionality

5. **Best Practices**:
   - Proper cleanup of resources (SSE connections, etc.)
   - Use of AbortController for cancellation
   - Non-blocking tracking with sendBeacon

**Total Estimated Time**: 3-4 days

---

# User Journey: Typing "exam"

Here's exactly what happens as the user types "exam" under this implementation plan:

## 1. As User Types Each Character

**User types "e":**
- `onChange` in NewTabSearchBar updates the `query` state in NewTab component
- The debounce timer starts (150ms)
- UI shows just the single character "e" with no search happening yet

**User quickly types "x":**
- `query` updates to "ex"
- Debounce timer resets to 150ms
- Still no search, just "ex" visible in the search box

**User continues with "a":**
- `query` updates to "exa"
- Debounce timer resets again to 150ms
- No search yet

**User finishes with "m":**
- `query` updates to "exam"
- Debounce timer resets to 150ms
- UI still just shows the input "exam" with no results yet

## 2. After Debounce Period (150ms after last keystroke)

- `debouncedQuery` state updates to "exam"
- The effect hook that watches `debouncedQuery` triggers
- `isSearching` state is set to true (spinner appears)
- `searchWithSSE("exam", userId, false)` is called with `triggerSemantic: false`
- This is the "quick search" while typing

## 3. Quick Search Execution

- Any previous search is automatically cancelled
- A new SSE (Server-Sent Event) connection opens to `/api/unified-search`
- The payload sent is:
  ```json
  {
    "query": "exam", 
    "userId": "[user's ID]", 
    "timestamp": 1234567890123,
    "triggerSemantic": false
  }
  ```

## 4. Quick Search Results Return (typically within ~100ms)

- SSE connection receives "quicklaunch" event with initial results
- The callback function receives data with URLs and titles matching "exam"
- `results` state is updated with these matches
- `isSearching` is set to false (spinner disappears)
- Results appear in a dropdown below the search bar, showing titles and URLs

## 5. If User Continues Typing

- The process starts over - existing search is cancelled
- New debounce period begins
- Previous results remain visible until new ones arrive

## 6. If User Pauses Typing (more than 150ms)

- Quick search results remain visible
- User can navigate these results with mouse/keyboard
- No deep semantic search triggered automatically (saving server resources)

## 7. If User Presses Enter

- `handleKeyPress` detects Enter key and calls `onSearch("exam")`
- A new search with `triggerSemantic: true` is initiated
- Any previous search is cancelled
- `isSearching` is set to true again (spinner reappears)
- A new SSE connection sends:
  ```json
  {
    "query": "exam", 
    "userId": "[user's ID]", 
    "timestamp": 1234567890123,
    "triggerSemantic": true
  }
  ```

## 8. Complete Search Results Return

- First "quicklaunch" results arrive and update the UI
  - The spinner continues to show since semantic processing is still happening
- Then "semantic" results arrive with deeper content matches and update the UI
  - The spinner continues to show until all processing is complete
- Finally, "complete" event signals the end of all results
  - Now the spinner disappears (setIsSearching(false) is called)
- Result list displays all matches sorted by relevance score

## 9. User Clicks a Result

- `handleResultClick` is called with the selected result and its position
- Click tracking data is sent to the backend using `navigator.sendBeacon`:
  ```json
  {
    "searchSessionId": "[session ID from result]",
    "pageId": "[page ID from result]",
    "position": 2, // Example position in list
    "timestamp": 1234567890123
  }
  ```
- The user is navigated to the result URL

This implementation provides a responsive search experience with immediate feedback while typing, conserves server resources by only running expensive semantic searches when needed, and tracks user interactions for analytics.