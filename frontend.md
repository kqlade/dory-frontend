# DORY Frontend Documentation

This document provides comprehensive details on the DORY browser extension frontend, including architecture, components, event tracking, API integration, and implementation patterns. It serves as a reference for developers maintaining or extending the frontend codebase.

## Table of Contents

1. [Architecture](#architecture)
2. [Authentication System](#authentication-system)
3. [Background Service Worker](#background-service-worker)
4. [Event System](#event-system)
5. [Content Extraction](#content-extraction)
6. [Search Implementation](#search-implementation)
7. [Browser Storage](#browser-storage)
8. [UI Components](#ui-components)
9. [Data Flow](#data-flow)
10. [Development Guidelines](#development-guidelines)

---

## Architecture

The DORY extension follows a standard browser extension architecture with these key components:

1. **Background Service Worker**: Persistent script that manages sessions, page visits, coordination, and authentication
2. **Content Scripts**: Injected into web pages to extract content and track user interaction
3. **New Tab Page**: Custom page providing search interface to the user
4. **Configuration**: Centralized settings in a shared config file
5. **API Client**: Communication layer with the backend server

### Execution Context

The extension operates in several execution contexts:

- **Background Context**: Long-running service worker with global authentication gating
- **Content Script Context**: Executes in the context of visited web pages (only when authenticated)
- **Extension Page Context**: Runs in extension-specific pages (e.g., new tab)

### Communication Patterns

Components communicate using these mechanisms:

1. **Message Passing**: `chrome.runtime.sendMessage` and `chrome.runtime.onMessage`
2. **Storage Events**: Chrome storage for sharing state between contexts
3. **Direct Function Calls**: Within the same execution context

---

## Authentication System

Authentication is handled at the extension level in the background service worker, creating a global gate for all functionality.

### Authentication Flow

1. When the extension initializes, it checks for valid authentication
2. If not authenticated, the extension shows a gray icon and disables functionality
3. If authenticated, normal extension functionality is enabled

### Authentication Implementation

Authentication is primarily managed in the background service worker:

```typescript
// In src/background/serviceWorker.ts
async function initialize(): Promise<void> {
  // Check authentication first - gate all functionality behind auth
  try {
    const userInfo = await getUserInfo();
    if (!userInfo || !userInfo.id) {
      isAuthenticated = false;
      // Update UI to indicate unauthenticated state
      chrome.action.setIcon({ path: { /* Gray icons */ } });
      chrome.action.onClicked.addListener(handleUnauthenticatedClick);
      return; // Exit early - don't initialize other functionality
    }
    
    // User is authenticated - proceed with initialization
    isAuthenticated = true;
    // Initialize extension components...
  } catch (error) {
    // Handle authentication error
  }
}
```

### Auth State Change Handling

The extension listens for authentication state changes:

```typescript
chrome.identity.onSignInChanged.addListener((account, signedIn) => {
  if (signedIn && !isAuthenticated) {
    // User just signed in, initialize the extension
    initialize();
  } else if (!signedIn && isAuthenticated) {
    // User signed out, disable functionality
    isAuthenticated = false;
    // Clean up and update UI...
  }
});
```

### Component Auth Behavior

All components assume authentication is already verified at the extension level:

- Background service worker acts as gatekeeper for all functionality
- Content scripts and UI components operate under the assumption that authentication is valid
- Components still fetch user info when needed, but don't check if auth is valid

---

## Background Service Worker

The background service worker (`src/background/serviceWorker.ts`) is the central coordination component and authentication gatekeeper of the extension.

### Key Responsibilities

1. **Authentication**: Verifies user authentication and gates all functionality
2. **Session Management**: Tracks user sessions and maintains session state
3. **Navigation Tracking**: Monitors page visits and user navigation
4. **Event Coordination**: Triggers event tracking to the backend
5. **Lifecycle Management**: Initializes and cleans up the extension state

### Core Functions

```typescript
// Initialize the service worker with authentication check
async function initialize() {
  // Check authentication first
  const userInfo = await getUserInfo();
  if (!userInfo || !userInfo.id) {
    // Handle unauthenticated state
    return;
  }
  
  // Proceed with normal initialization
  await initDexieSystem();
  messageRouter.initialize();
  registerMessageHandlers();
  await initEventStreaming();
  await startNewSession();
}

// Ensure there's an active session
async function ensureActiveSession() {
  if (!(await getCurrentSessionId())) {
    await startNewSession();
  }
}

// Track user navigation
async function startNewVisit(tabId, pageId, fromPageId, isBackNav) {
  // Create visit record and send event
}

// Handle tab/window closure
async function endCurrentVisit(tabId) {
  // End visit record and send event
}
```

### Event Listeners

The service worker sets up these Chrome API event listeners:

1. **Tab events**: `chrome.tabs.onCreated`, `chrome.tabs.onUpdated`, `chrome.tabs.onRemoved`
2. **Window events**: `chrome.windows.onCreated`, `chrome.windows.onRemoved`
3. **Extension events**: `chrome.runtime.onMessage`, `chrome.runtime.onInstalled`, `chrome.runtime.onSuspend`
4. **Auth events**: `chrome.identity.onSignInChanged`

### Activation

```javascript
// Bootstrap the extension
initialize();

// Cleanup on service worker unload
self.addEventListener('activate', () => {
  console.log('[DORY] Service worker activated');
});

chrome.runtime.onSuspend.addListener(async () => {
  console.log('[DORY] Service worker is suspending => end session');
  await endCurrentSession();
  if (idleCheckInterval) clearInterval(idleCheckInterval);
});
```

---

## Event System

The event system tracks user behavior and page interactions, sending structured events to the backend through dedicated endpoints.

### Event Types and Endpoints

The extension sends these event types to their corresponding dedicated endpoints:

1. `SESSION_STARTED` and `SESSION_ENDED`: Sent to `/api/cold-storage/sessions`
2. `PAGE_VISIT_STARTED` and `PAGE_VISIT_ENDED`: Sent to `/api/cold-storage/visits`
3. `CONTENT_EXTRACTED`: Sent to `/api/content`
4. `ACTIVE_TIME_UPDATED`: Sent to `/api/cold-storage/visits`
5. Search interactions: Sent to `/api/unified-search` and `/api/unified-search/click`

The original generic `/api/events` endpoint has been deprecated in favor of these purpose-specific endpoints.

### Event Flow

1. Extension detects an action (navigation, content loaded, etc.)
2. Creates a structured event with proper payload
3. Event streamer adds user info from cached authentication
4. Sends event to the appropriate dedicated backend endpoint based on event type
5. Backend processes and stores the event according to its specific handling requirements

### Implementation

Events are defined in `src/api/types.ts` and sent using the appropriate service based on event type:

```typescript
// Send content extraction event
export async function sendContentEvent(content: ExtractedContent): Promise<void> {
  // Get current user if not already cached
  if (!currentUser) {
    try {
      currentUser = await getUserInfo();
    } catch (error) {
      console.error('[ContentService] Failed to get user info:', error);
    }
  }
  
  // Send to content API endpoint
  await fetch('/api/content', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: currentUser?.id,
      pageId: content.pageId,
      visitId: content.visitId,
      title: content.title,
      markdown: content.markdown,
      url: content.url
    })
  });
}

// Send session event to cold storage
export async function sendSessionEvent(sessionEvent: SessionEvent): Promise<void> {
  // Implementation for session events using cold storage endpoint
  // ...
}

// Send visit event to cold storage
export async function sendVisitEvent(visitEvent: VisitEvent): Promise<void> {
  // Implementation for visit events using cold storage endpoint
  // ...
}
```

Each event follows a specific data structure as defined in the `types.ts` file, ensuring the backend receives properly formatted events for its specific endpoint.

### Error Handling

If an event fails to send, the API client will retry with exponential backoff (up to the configured retry limit). Different retry strategies may be employed based on the event type and priority.

---

## Content Extraction

Content extraction converts visited web pages into structured, searchable content.

### Extraction Process

1. **Wait for DOM idle**: Ensures the page has fully loaded
2. **HTML Parsing**: Extract relevant content from the DOM
3. **Markdown Conversion**: Convert HTML to searchable markdown
4. **Storage**: Send content to backend for indexing via dedicated content API endpoint

### Key Components

- **Content Filter**: `src/html2text/content_filter_strategy.ts` - Filters irrelevant content
- **Markdown Generator**: `src/html2text/markdownGenerator.ts` - Converts HTML to markdown
- **Content Extractor**: `src/services/contentExtractor.ts` - Coordinates the extraction process

### Extraction Function

```typescript
async function extractAndSendContent(retryCount = 0): Promise<void> {
  try {
    // 1) Wait for DOM to be idle
    await waitForDomIdle();
    
    // 2) Extract content using HTML2Text
    const { title, sourceMarkdown } = extractContent();
    
    // 3) Send the content message
    const extractionMessage = createExtractionMessage({
      pageId: currentPageId,
      visitId: currentVisitId,
      title,
      markdown: sourceMarkdown,
      url: window.location.href
    });
    
    // 4) Send event to backend
    sendDoryEvent({
      operation: EventTypes.CONTENT_EXTRACTED,
      sessionId: sessionId.toString(),
      timestamp: Date.now(),
      data: {
        pageId: currentPageId,
        visitId: currentVisitId,
        url: currentUrl,
        content: {
          title: title,
          markdown: sourceMarkdown,
          metadata: {
            language: CONTENT_FILTER_LANGUAGE
          }
        }
      }
    });

    // 5) Send content to dedicated content API endpoint
    await fetch('/api/content', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pageId: currentPageId,
        visitId: currentVisitId,
        url: currentUrl,
        title: title,
        content: sourceMarkdown
      })
    });
  } catch (error) {
    // Handle errors and retry if needed
    if (retryCount < MAX_RETRIES) {
      setTimeout(() => extractAndSendContent(retryCount + 1), RETRY_DELAY_MS);
    }
  }
}
```

### Configuration

Extraction behavior is controlled via the `QUEUE_CONFIG` in the central configuration file:

```typescript
export const QUEUE_CONFIG = {
  // Maximum number of retries for processing a URL
  MAX_RETRIES: 3,
  
  // Delay between retries (in milliseconds)
  RETRY_DELAY_MS: 3000,
  
  // Maximum time to process a single URL (in milliseconds)
  PROCESSING_TIMEOUT_MS: 60000,

  // Maximum time to wait for DOM to settle (in milliseconds)
  DOM_IDLE_TIMEOUT_MS: 7000,

  // How long to wait after last mutation to declare DOM "idle" (in milliseconds)
  DOM_IDLE_CHECK_DELAY_MS: 500
}
```

---

## Search Implementation

The search functionality uses a hybrid approach combining local and backend search for optimal performance and user experience, implemented with TanStack Query for efficient request management, caching, and cancellation.

### Search Components

1. **Local QuickLaunch**: `src/services/localQuickLauncher.ts` - Instant local search from IndexedDB
2. **Backend Search**: Server-side search with streaming results via Server-Sent Events (SSE)
3. **Search Hooks**: `src/hooks/useSearch.ts` - Custom React hooks that manage the search state
4. **Search UI**: `src/pages/newtab/NewTab.tsx` - Search interface with unified result display

### Hybrid Search Flow

1. **Instant Local Search**:
   - Local quickLaunch results appear immediately with each keystroke
   - No debouncing for local search to provide real-time feedback
   - Uses `useLocalSearch` hook which leverages TanStack Query for efficient caching

2. **Debounced Backend Search**:
   - Backend search is triggered only after typing pauses (300ms debounce)
   - Backend search is triggered immediately when Enter is pressed
   - Properly cancels previous in-flight requests when query changes
   - Uses `useBackendStreamingSearch` hook to manage SSE connections
   - A POST request is made to `/api/unified-search` with a JSON body containing query, userId, timestamp, and triggerSemantic

3. **Streaming Result Processing**:
   - Backend streams both quicklaunch and semantic results through SSE
   - Results are processed in real-time as they arrive
   - Three event types are handled: 'quicklaunch', 'semantic', and 'complete'
   - Results are stored separately and then combined for display

4. **Result Deduplication and Display**:
   - **IMPORTANT**: The frontend is solely responsible for all deduplication between all result sources
   - Backend does not perform any deduplication between quicklaunch and semantic results
   - All results (local, backend quicklaunch, semantic) are combined
   - Duplicates are removed based on unique page/document IDs
   - Results are sorted first by source type, then by relevance score
   - Semantic results can be displayed in a separate section with a header

### Implementation

The search functionality is implemented using custom hooks in `src/hooks/useSearch.ts`:

```typescript
// Custom hooks for different search types
export function useLocalSearch(query: string) {
  return useQuery({
    queryKey: ['local-search', query],
    queryFn: async () => {
      if (!query || query.length < 2) return [];
      
      // Search local IndexedDB with each keystroke (no debounce)
      const results = await quickLaunch.search(query);
      return results.map(result => ({
        id: result.pageId,
        title: result.title,
        url: result.url,
        score: result.score
      }));
    },
    enabled: query.length >= 2,
  });
}

export function useBackendStreamingSearch(query: string) {
  // Manages SSE connection to backend search API
  // Handles events for 'quicklaunch', 'semantic', and 'complete'
  // Properly cancels previous connections when query changes
  // ...
}

export function useHybridSearch() {
  // Main hook that combines local and backend search
  const [inputValue, setInputValue] = useState('');
  const [debouncedQuery] = useDebounce(inputValue, 300);
  const [immediateQuery, setImmediateQuery] = useState('');
  
  // For local search: Use raw inputValue for instant results
  const localSearchQuery = inputValue;
  
  // For backend search: Use debounced query (or immediate when Enter pressed)
  const backendSearchQuery = immediateQuery || debouncedQuery;
  
  // Get local and backend results
  const { data: localResults } = useLocalSearch(localSearchQuery);
  const { quickResults, semanticResults } = useBackendStreamingSearch(backendSearchQuery);
  
  // Combine, deduplicate, and sort results
  // ...
}
```

### Search UI Integration

The search UI in `NewTab.tsx` uses the hybrid search hook:

```typescript
function NewTab() {
  const searchInputRef = useRef<HTMLInputElement>(null);
  
  // Use our custom hybrid search hook
  const {
    inputValue,
    setInputValue,
    handleEnterKey,
    results,
    isSearching
  } = useHybridSearch();

  // Handle input change - updates with each keystroke
  const handleQueryChange = (newQuery: string) => {
    setInputValue(newQuery);
  };

  // Handle result click with tracking
  const handleResultClick = (result: any) => {
    const searchSessionId = result.searchSessionId || 'local-session';
    trackSearchClick(searchSessionId, result.id || result.pageId, 0);
    window.location.href = result.url;
  };

  return (
    <Container>
      <SearchContainer>
        <NewTabSearchBar
          ref={searchInputRef}
          value={inputValue}
          onChange={handleQueryChange}
          onKeyDown={handleKeyDown}
          placeholder="Search your history..."
        />
        
        {/* Display unified result list with separate semantic section */}
      </SearchContainer>
    </Container>
  );
}
```

### Search Result Tracking

When a user clicks on a result, a tracking event is sent for analytics:

```typescript
// Track click and navigate
const handleResultClick = (result) => {
  // Track the click with searchSessionId, pageId, and position
  const searchSessionId = result.searchSessionId || 'local-session';
  trackSearchClick(searchSessionId, result.id || result.pageId, 0);
  
  // Navigate to the result URL
  window.location.href = result.url;
};
```

### Search Optimization

The search experience is optimized by:

1. **Instant Local Feedback**: Local searches execute with each keystroke for immediate results
2. **Efficient Backend Calls**: Backend searches only trigger after typing pauses or Enter press
3. **Proper Cancellation**: Stale requests are cancelled when the user continues typing
4. **Progressive Enhancement**: Results appear in stages (local → backend quick → semantic)
5. **TanStack Query Caching**: Repeated searches benefit from caching for improved performance
6. **Unified Deduplication**: All result sources are deduplicated in a single place
7. **Clean Component Separation**: Each search type has its own focused hook for better maintainability

---

## Browser Storage

The extension uses several storage mechanisms:

### 1. IndexedDB

Used for storing structured browsing data:

- **Sessions**: Tracks browsing sessions
- **Pages**: Stores visited page metadata
- **Visits**: Records individual page visits

Key functions in `src/services/dexieDB.ts`:

```typescript
// Get a reference to the database
export async function getDB(): Promise<DexieDBType> {
  return db;
}

// Store a new page or get an existing one
export async function createOrGetPage(url: string, title: string): Promise<number> {
  // Implementation
}

// Start a new visit
export async function startVisit(
  pageId: number, 
  sessionId: number, 
  fromPageId?: number,
  isBackNavigation?: boolean
): Promise<string> {
  // Implementation
}
```

### 2. Chrome Storage

Used for persisting extension settings and state between contexts:

```typescript
// Save a setting
chrome.storage.local.set({ key: value });

// Retrieve a setting
chrome.storage.local.get(['key'], (result) => {
  // Use result.key
});
```

### 3. Memory Storage

Temporary in-memory storage for the current session:

```typescript
// In background service worker
const tabToPageId: Record<number, number> = {};
const tabToVisitId: Record<number, string> = {};
const tabToCurrentUrl: Record<number, string> = {};
```

### Cold Storage Sync

Long-term data is periodically synced to backend cold storage using dedicated endpoints:

```typescript
// In src/services/coldStorageSync.ts
export class ColdStorageSync {
  public async performSync(): Promise<void> {
    // Sync data updated since last sync
    const lastSyncTime = localStorage.getItem(LAST_SYNC_KEY);
    const userId = await this.getCurrentUserId();
    
    // Sync pages collection using dedicated endpoint
    await this.syncPages(
      await db.pages.where('lastModified').above(lastSyncTime).toArray(),
      userId
    );
    
    // Sync visits using dedicated endpoint
    await this.syncVisits(
      await db.visits.where('lastModified').above(lastSyncTime).toArray(),
      userId
    );
    
    // Sync sessions using dedicated endpoint
    await this.syncSessions(
      await db.sessions.where('lastModified').above(lastSyncTime).toArray(),
      userId
    );
  }
  
  private async syncPages(pages: Page[], userId: string): Promise<void> {
    if (pages.length === 0) return;
    
    try {
      const response = await fetch('/api/cold-storage/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, pages })
      });
      
      // Handle response...
    } catch (error) {
      console.error('Failed to sync pages:', error);
    }
  }
  
  private async syncVisits(visits: Visit[], userId: string): Promise<void> {
    if (visits.length === 0) return;
    
    try {
      const response = await fetch('/api/cold-storage/visits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, visits })
      });
      
      // Handle response...
    } catch (error) {
      console.error('Failed to sync visits:', error);
    }
  }
  
  private async syncSessions(sessions: Session[], userId: string): Promise<void> {
    if (sessions.length === 0) return;
    
    try {
      const response = await fetch('/api/cold-storage/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, sessions })
      });
      
      // Handle response...
    } catch (error) {
      console.error('Failed to sync sessions:', error);
    }
  }
}
```

---

## UI Components

The extension's UI is built with React and styled-components.

### New Tab Page

The new tab page (`src/pages/newtab/NewTab.tsx`) provides the main search interface:

```typescript
const NewTab: React.FC = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [semanticResults, setSemanticResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  
  // Search handling
  const handleSearch = async (finalQuery: string) => {
    // Trigger backend search
    triggerBackendSearch(finalQuery);
  };
  
  // Result click handling
  const handleResultClick = (result: SearchResult, index: number) => {
    // Track click and navigate
  };
  
  return (
    <Container>
      <SearchContainer>
        <NewTabSearchBar
          onSearch={handleSearch}
          isLoading={isSearching}
          inputRef={searchInputRef}
          query={query}
          onQueryChange={handleQueryChange}
        />
        {allResults.length > 0 && (
          <ResultsList>
            {allResults.map((result, index) => {
              // Render results with special handling for semantic section
            })}
          </ResultsList>
        )}
      </SearchContainer>
      <ThemeToggle />
    </Container>
  );
};
```

### Styled Components

UI components use styled-components for styling:

```typescript
const Container = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background-color: ${props => props.theme.background};
  color: ${props => props.theme.text};
  transition: background-color 0.3s, color 0.3s;
`;

const SearchContainer = styled.div`
  width: 100%;
  max-width: 640px;
  margin: 0 auto;
`;
```

### Theme Support

The extension supports light and dark themes:

```typescript
export function useDarkMode() {
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    return saved !== null ? JSON.parse(saved) : window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    localStorage.setItem('darkMode', JSON.stringify(isDarkMode));
  }, [isDarkMode]);

  return [isDarkMode, setIsDarkMode] as const;
}
```

---

## Data Flow

Data flows through the extension in these key paths:

### 1. Authentication Flow

```
Extension Load → Check Auth → If Authenticated → Initialize Extension Components → Normal Operation
                           → If Not Authenticated → Disable Functionality → Wait for Auth
```

### 2. Content Extraction Flow

```
Page Load → DOM Idle → Extract Content → Send to Background → Send to Backend
```

### 3. Search Flow

```
User Types → Local Search → Show Results → User Pauses/Presses Enter → Backend Search → Deduplicate Results
```

### 4. Navigation Flow

```
Tab Navigation → Track Visit Start → Process Page → Track Visit End
```

### 5. Session Flow

```
Extension Load → Authenticated → Start Session → Track Activity → End Session on Unload
```

---

## Development Guidelines

### Configuration

All configuration is centralized in `src/config.ts`:

```typescript
export const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000/api';

export const ENDPOINTS = {
  HEALTH: '/health',
  ADVANCED_SEARCH: '/unified-search',
  EVENTS: '/events'
} as const;

export const QUEUE_CONFIG = {
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 3000,
  PROCESSING_TIMEOUT_MS: 60000,
  DOM_IDLE_TIMEOUT_MS: 7000,
  DOM_IDLE_CHECK_DELAY_MS: 500
} as const;
```

### Authentication Principles

- **Global Gating**: All functionality is gated at the extension level via background service worker
- **Component Assumption**: UI components assume authentication is already verified
- **User Info Access**: Components still fetch user info when needed, but don't re-check authentication
- **Clean Separation**: Auth state management is centralized in the background service worker

### Search Implementation Principles

- **Hybrid Approach**: Combine local and backend search for optimal UX
- **Progressive Results**: Show local results immediately, enhance with backend results
- **Deduplication**: Prevent duplicate results from different sources
- **Pause Detection**: Auto-trigger backend search automatically after typing pauses
- **Cancellation**: Prevent stale results when query changes

### Build Process

The extension is built using Vite:

```bash
# Development build
npm run dev

# Production build
npm run build
```

### Debugging

For debugging:

1. **Background Service Worker**: Inspect via chrome://extensions
2. **Content Scripts**: Inspect via the page's developer tools
3. **Extension UI**: Inspect like a regular web page

### Testing

Testing uses Jest for unit tests and Chrome's extension testing APIs for integration tests:

```bash
# Run unit tests
npm test

# Run integration tests
npm run test:integration
```

### Best Practices

1. **Authentication**: Gate all functionality at the extension level
2. **Modular Design**: Keep components small and focused
3. **Error Handling**: Implement robust error handling for all API calls
4. **Type Safety**: Use TypeScript interfaces for all data structures
5. **Performance**: Use hybrid search approach for optimal UX
6. **Security**: Validate all data and follow Chrome's security best practices
