# DORY Frontend Documentation

This document provides comprehensive details on the DORY browser extension frontend, including architecture, components, event tracking, API integration, and implementation patterns. It serves as a reference for developers maintaining or extending the frontend codebase.

## Table of Contents

1. [Architecture](#architecture)
2. [Background Service Worker](#background-service-worker)
3. [Event System](#event-system)
4. [Content Extraction](#content-extraction)
5. [Search Implementation](#search-implementation)
6. [Browser Storage](#browser-storage)
7. [UI Components](#ui-components)
8. [Data Flow](#data-flow)
9. [Development Guidelines](#development-guidelines)

---

## Architecture

The DORY extension follows a standard browser extension architecture with these key components:

1. **Background Service Worker**: Persistent script that manages sessions, page visits, and coordination
2. **Content Scripts**: Injected into web pages to extract content and track user interaction
3. **New Tab Page**: Custom page providing search interface to the user
4. **Configuration**: Centralized settings in a shared config file
5. **API Client**: Communication layer with the backend server

### Execution Context

The extension operates in several execution contexts:

- **Background Context**: Long-running service worker
- **Content Script Context**: Executes in the context of visited web pages
- **Extension Page Context**: Runs in extension-specific pages (e.g., new tab)

### Communication Patterns

Components communicate using these mechanisms:

1. **Message Passing**: `chrome.runtime.sendMessage` and `chrome.runtime.onMessage`
2. **Storage Events**: Chrome storage for sharing state between contexts
3. **Direct Function Calls**: Within the same execution context

---

## Background Service Worker

The background service worker (`src/background/serviceWorker.ts`) is the central coordination component of the extension.

### Key Responsibilities

1. **Session Management**: Tracks user sessions and maintains session state
2. **Navigation Tracking**: Monitors page visits and user navigation
3. **Event Coordination**: Triggers event tracking to the backend
4. **Lifecycle Management**: Initializes and cleans up the extension state

### Core Functions

```typescript
// Initialize the service worker
async function initialize() {
  await ensureActiveSession();
  registerMessageHandlers();
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

### Activation

```javascript
// This can help if the extension's service worker is reloaded
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

The event system tracks user behavior and page interactions, sending structured events to the backend.

### Event Types

The extension sends these event types to the backend:

1. `SESSION_STARTED`: When a new browsing session begins
2. `PAGE_VISIT_STARTED`: When navigating to a page
3. `CONTENT_EXTRACTED`: When page content is processed
4. `PAGE_VISIT_ENDED`: When leaving a page
5. `ACTIVE_TIME_UPDATED`: Periodic updates about active time
6. `SESSION_ENDED`: When a session ends

### Event Flow

1. Extension detects an action (navigation, content loaded, etc.)
2. Creates a structured event with proper payload
3. Sends event to the backend via the API client
4. Backend processes and stores the event

### Implementation

Events are defined in `src/api/types.ts` and sent using the `sendDoryEvent` function from `src/services/eventStreamer.ts`:

```typescript
// Send event to backend
export async function sendDoryEvent(event: DoryEvent): Promise<void> {
  // Add user info if available
  if (currentUser) {
    event.userId = currentUser.id;
    event.userEmail = currentUser.email;
  }
  
  await sendEvent(event);
}
```

Each event follows a specific data structure as defined in the `types.ts` file, ensuring the backend receives properly formatted events.

### Error Handling

If an event fails to send, the API client will retry with exponential backoff (up to the configured retry limit).

---

## Content Extraction

Content extraction converts visited web pages into structured, searchable content.

### Extraction Process

1. **Wait for DOM idle**: Ensures the page has fully loaded
2. **HTML Parsing**: Extract relevant content from the DOM
3. **Markdown Conversion**: Convert HTML to searchable markdown
4. **Storage**: Send content to backend for indexing

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

The search functionality allows users to find content from their browsing history.

### Search Components

1. **Search UI**: `src/pages/newtab/NewTab.tsx` - Search interface shown on new tabs
2. **Search API Integration**: `src/api/client.ts` - Communication with backend search API
3. **Result Handling**: Process and display search results

### Search Flow

1. User types a query in the search box
2. Frontend debounces input to avoid excessive API calls
3. Frontend sends search request to backend
4. Backend returns results via Server-Sent Events (SSE)
5. UI updates as results arrive

### SSE Search Implementation

The search uses Server-Sent Events for streaming results:

```typescript
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

  fetch(`${API_BASE_URL}${ENDPOINTS.ADVANCED_SEARCH}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream'
    },
    body: JSON.stringify({
      query,
      userId,
      timestamp: Date.now(),
      triggerSemantic
    }),
    signal: currentSearchController.signal
  })
    .then(response => {
      // Process the SSE stream
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const processStream = async (): Promise<void> => {
        // Process chunks and call the onResults callback with data
      };

      return processStream();
    })
    .catch(error => {
      // Handle errors
    });

  // Return function to cancel the search
  return () => {
    if (currentSearchController) {
      currentSearchController.abort();
      currentSearchController = null;
    }
  };
}
```

### Result Click Tracking

When a user clicks on a result, we track this for analytics:

```typescript
export function trackSearchClick(searchSessionId: string, pageId: string, position: number) {
  const data = JSON.stringify({
    searchSessionId,
    pageId,
    position,
    timestamp: Date.now()
  });

  const endpoint = `${API_BASE_URL}${ENDPOINTS.ADVANCED_SEARCH}/click`;

  if (navigator.sendBeacon) {
    navigator.sendBeacon(endpoint, data);
  } else {
    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: data,
      keepalive: true
    }).catch(e => console.error('Click tracking error:', e));
  }
}
```

### Search Experience Optimization

The search experience is optimized by:

1. **Debouncing**: Limiting API calls while typing
2. **Progressive Searching**: Quick search while typing, deep search on submit
3. **Background Processing**: Non-blocking UI during search
4. **Immediate Feedback**: Results appear as they become available

---

## Browser Storage

The extension uses several storage mechanisms:

### 1. IndexedDB

Used for storing structured browsing data:

- **Sessions**: Tracks browsing sessions
- **Pages**: Stores visited page metadata
- **Visits**: Records individual page visits

Key functions in `src/services/browsingStore.ts`:

```typescript
// Get a reference to the database
export async function getDB(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, newVersion) {
      // Define schema
    }
  });
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

---

## UI Components

The extension's UI is built with React and styled-components.

### New Tab Page

The new tab page (`src/pages/newtab/NewTab.tsx`) provides the main search interface:

```typescript
const NewTab: React.FC = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  
  // Search handling
  const handleSearch = async (finalQuery: string) => {
    // Implementation
  };
  
  // Result click handling
  const handleResultClick = (result: SearchResult, index: number) => {
    // Implementation
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
        {results.length > 0 && (
          <ResultsList>
            {results.map((result, index) => (
              <ResultItem key={`result-${index}-${result.pageId}`} onClick={() => handleResultClick(result, index)}>
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

### 1. Content Extraction Flow

```
Page Load → DOM Idle → Extract Content → Send to Background → Send to Backend
```

### 2. Search Flow

```
User Input → API Request → SSE Stream → UI Update → Result Click → Tracking
```

### 3. Navigation Flow

```
Tab Navigation → Track Visit Start → Process Page → Track Visit End
```

### 4. Session Flow

```
Extension Load → Start Session → Track Activity → End Session on Unload
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

1. **Modular Design**: Keep components small and focused
2. **Error Handling**: Implement robust error handling for all API calls
3. **Type Safety**: Use TypeScript interfaces for all data structures
4. **Performance**: Minimize DOM operations and background processing
5. **Security**: Validate all data and follow Chrome's security best practices
