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

1. When the extension initializes, it checks for valid authentication using Chrome Identity API
2. If not authenticated, the extension shows a gray icon and disables functionality
3. If authenticated, normal extension functionality is enabled
4. Changes in authentication state are monitored via `chrome.identity.onSignInChanged`

### Authentication Implementation

Authentication is primarily managed in the background service worker:

```typescript
// In src/background/serviceWorker.ts
async function initialize(): Promise<void> {
  // Check authentication first - gate all functionality behind auth
  try {
    const userInfo = await getUserInfo();
    if (!userInfo?.id) {
      isAuthenticated = false;
      // Gray out icon
      chrome.action.setIcon({
        path: {
          16: '/icons/dory_logo_gray_16x16.png',
          48: '/icons/dory_logo_gray_48x48.png',
          128: '/icons/dory_logo_gray_128x128.png'
        }
      });
      // Let user click icon to authenticate
      chrome.action.onClicked.addListener(handleUnauthenticatedClick);
      return; // Exit early
    }
    // User is authenticated - proceed with initialization
    isAuthenticated = true;
    
    // Initialize the rest of the extension...
    // 1. Initialize Dexie database
    // 2. Setup message routing
    // 3. Start a new session
    // 4. Initialize event streaming
  } catch (error) {
    console.error('[DORY] AUTH ERROR:', error);
    isAuthenticated = false;
  }
}
```

The `getUserInfo` function uses Chrome's Identity API:

```typescript
// In src/auth/googleAuth.ts
export async function getUserInfo(interactive = true): Promise<UserInfo | null> {
  try {
    const result = await chrome.identity.getAuthToken({ interactive });
    if (!result || !result.token) {
      throw new Error('No auth token retrieved');
    }

    const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${result.token}` },
    });

    if (!response.ok) {
      throw new Error(`Failed to get user info: ${response.status}`);
    }

    const data = await response.json();
    return {
      id: data.id,
      email: data.email,
    };
  } catch (error) {
    console.error('[DORY] Auth error:', error);
    return null;
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
    
    // Stop idle check timer
    if (idleCheckInterval) {
      clearInterval(idleCheckInterval);
      idleCheckInterval = null;
    }
    
    // End active session if any
    if (isSessionActive) {
      endCurrentSession();
      isSessionActive = false;
    }
    
    // Update icon and click handler
    chrome.action.setIcon({
      path: {
        16: '/icons/dory_logo_gray_16x16.png',
        48: '/icons/dory_logo_gray_48x48.png',
        128: '/icons/dory_logo_gray_128x128.png'
      }
    });
    chrome.action.onClicked.removeListener(handleExtensionIconClick);
    chrome.action.onClicked.addListener(handleUnauthenticatedClick);
  }
});
```

---

## Background Service Worker

The background service worker (`src/background/serviceWorker.ts`) is the central coordination component and authentication gatekeeper of the extension.

### Key Responsibilities

1. **Authentication**: Verifies user authentication and gates all functionality
2. **Session Management**: Tracks user sessions and maintains session state
3. **Navigation Tracking**: Monitors page visits and user navigation
4. **Content Extraction Coordination**: Sets up extraction context and triggers content extraction
5. **Event Coordination**: Routes messages between content scripts and the backend
6. **Lifecycle Management**: Initializes and cleans up the extension state

### Core Features

#### Session Management

- Sessions automatically start when the authenticated extension is initialized
- Inactivity timer ends sessions after 15 minutes of inactivity
- Sessions are ended cleanly when the extension is suspended

```typescript
// Session idle check every minute
async function checkSessionInactivity(): Promise<void> {
  const ended = await checkSessionIdle(SESSION_IDLE_THRESHOLD);
  if (ended) {
    isSessionActive = false;
    console.log('[DORY] INFO: Session ended due to inactivity.');
  }
}

// Ensure session is active before operations
async function ensureActiveSession(): Promise<void> {
  if (!isSessionActive) {
    const sessionId = await startNewSession();
    isSessionActive = true;
    console.log('[DORY] INFO: New session started (was idle):', sessionId);
  }
}
```

#### Navigation Tracking

The service worker tracks navigation using two main Chrome API events:

1. `chrome.webNavigation.onCommitted`: Fired when navigation to a new page has been committed
2. `chrome.webNavigation.onCreatedNavigationTarget`: Fired when a new tab/window is created from a link

```typescript
// Track page visits when navigation is committed
chrome.webNavigation.onCommitted.addListener(async (details) => {
  // Only handle main frame
  if (details.frameId !== 0) return;

  try {
    await ensureActiveSession();
    
    // Get page details and track the visit
    const pageTitle = (await getTabTitle(tabId)) || url;
    const pageId = await createOrGetPage(url, pageTitle, timeStamp);
    
    // Start a new visit => get a visitId
    const visitId = await startNewVisit(tabId, pageId, fromPageId, isBackNav);
    
    // Set up content extraction (only for actual web pages)
    if (isWebPage(url)) {
      // Send extraction context to content script
      chrome.tabs.sendMessage(
        tabId,
        createMessage(MessageType.SET_EXTRACTION_CONTEXT, { pageId, visitId }, 'background')
      );
      
      // Set fallback timer for extraction if onCompleted doesn't fire
      // ...
    }
  } catch (err) {
    console.error('[DORY] handleOnCommitted error =>', err);
  }
});
```

#### Content Extraction Coordination

The service worker coordinates content extraction by:
1. Setting extraction context (pageId, visitId) via message to content scripts
2. Triggering extraction after page load completes via `onCompleted` event
3. Using a fallback timer to ensure extraction happens even if `onCompleted` doesn't fire
4. Only extracting content from actual web pages (filtered with `isWebPage` utility)

```typescript
// Trigger extraction when page load completes
chrome.webNavigation.onCompleted.addListener(async (details) => {
  // Only handle main frame
  if (details.frameId !== 0) return;

  const { tabId, url } = details;
  
  try {
    // Clear fallback timer since onCompleted fired
    delete tabToFallbackTimerActive[tabId];
    
    // Only extract web pages with a valid visit
    if (tabToVisitId[tabId] && isWebPage(url)) {
      chrome.tabs.sendMessage(
        tabId,
        createMessage(MessageType.TRIGGER_EXTRACTION, {}, 'background')
      );
    }
  } catch (err) {
    console.error('[DORY] handleOnCompleted error =>', err);
  }
});
```

#### Tab Management

The service worker tracks tab lifecycle events to properly handle navigation and cleanup:

```typescript
// Clean up when tabs are closed
chrome.tabs.onRemoved.addListener(async (tabId) => {
  await endCurrentVisit(tabId);
  delete tabToCurrentUrl[tabId];
  delete tabToPageId[tabId];
  delete tabToVisitId[tabId];
  delete tabToFallbackTimerActive[tabId];
});
```

### Message Routing

The service worker uses a message router to handle messages from content scripts:

```typescript
// Register message handlers
function registerMessageHandlers(): void {
  // ACTIVITY_EVENT: Update active time for page and session
  messageRouter.registerHandler(MessageType.ACTIVITY_EVENT, async (msg, sender) => {
    const { isActive, pageUrl, duration } = msg.data;
    
    if (isActive) {
      await ensureActiveSession();
    }
    
    if (pageUrl && duration > 0) {
      await updateActiveTimeForPage(pageUrl, duration);
      await updateSessionActivityTime();
      
      // Also update visit active time if we know the visit
      const tabId = sender.tab?.id;
      if (tabId !== undefined && tabToVisitId[tabId]) {
        const visitId = tabToVisitId[tabId];
        await updateVisitActiveTime(visitId, duration);
        
        // Log activity event
        // ...
      }
    }
    return true;
  });
  
  // EXTRACTION_COMPLETE: Record that content extraction finished
  messageRouter.registerHandler(MessageType.EXTRACTION_COMPLETE, async (msg) => {
    const { title, url, timestamp } = msg.data;
    
    await ensureActiveSession();
    const pageId = await createOrGetPage(url, title, timestamp);
    
    // Log success
    console.log('[DORY] ✅ Extraction finished for', title, url);
    return true;
  });
  
  // EXTRACTION_ERROR: Handle extraction failures
  messageRouter.registerHandler(MessageType.EXTRACTION_ERROR, async (msg) => {
    console.error('[DORY] ❌ EXTRACTION FAILED =>', msg.data);
    return true;
  });
}
```

---

## Event System

The event system tracks user behavior and page interactions, sending structured events to the backend through dedicated endpoints.

### Event Types and Endpoints

The extension handles these primary event types:

1. **Session Events**: Track session start/end (`SESSION_STARTED`, `SESSION_ENDED`)
2. **Visit Events**: Track page visits (`PAGE_VISIT_STARTED`, `PAGE_VISIT_ENDED`, `ACTIVE_TIME_UPDATED`) 
3. **Content Events**: Send extracted page content with metadata
4. **Search Events**: Track search interactions and clicks
5. **User Activity**: Monitor user presence and active time

### Implementation

The event service (`src/services/eventService.ts`) provides a centralized way to send different event types:

```typescript
// For content extraction events
export async function sendContentEvent(event: ContentEvent): Promise<void> {
  const user = await getCurrentUser();
  try {
    // Load session ID
    const { getCurrentSessionId } = await import('../utils/dexieSessionManager');
    const sessionId = await getCurrentSessionId();

    if (!sessionId) {
      console.warn('[EventService] No active session, skipping content event');
      return;
    }

    const payload = {
      contentId: `content_${event.pageId}_${event.visitId}_${Date.now()}`,
      sessionId: String(sessionId),
      userId: user?.id,
      timestamp: Date.now(),
      data: {
        pageId: event.pageId,
        visitId: event.visitId,
        userId: user?.id,
        url: event.url,
        content: {
          title: event.title,
          markdown: event.markdown,
          metadata: event.metadata || { language: 'en' }
        }
      }
    };

    await sendToAPI(ENDPOINTS.CONTENT, payload);
    console.log('[EventService] Content event sent successfully');
  } catch (err) {
    console.error('[EventService] Failed to send content event:', err);
  }
}
```

Events are sent to the backend using the centralized API_BASE_URL configuration:

```typescript
async function sendToAPI(endpoint: string, body: any, attempt = 0): Promise<Response> {
  const maxAttempts = 3;
  try {
    const resp = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
    }
    return resp;
  } catch (error) {
    console.error(`[EventService] sendToAPI error (attempt ${attempt + 1}):`, error);
    if (attempt < maxAttempts - 1) {
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      return sendToAPI(endpoint, body, attempt + 1);
    }
    throw error;
  }
}
```

### Cold Storage Event Sync

Long-term browsing data is periodically sent to cold storage endpoints, handled by the `ColdStorageSync` service:

```typescript
// In src/services/coldStorageSync.ts
export class ColdStorageSync {
  // ...
  private async syncData(): Promise<void> {
    const db = await getDB();
    const lastSyncTime: number = store[LAST_SYNC_KEY] ?? 0;
    const userId = await this.getCurrentUserId();

    // Sync pages, visits, sessions, and events
    // Each collection is sent to its dedicated endpoint
    const pages = await db.pages.where('updatedAt').above(lastSyncTime).toArray();
    await this.syncCollection('pages', pages, userId);

    const visits = await db.visits.where('startTime').above(lastSyncTime).toArray();
    await this.syncCollection('visits', visits, userId);
    
    const sessions = await db.sessions.where('startTime').above(lastSyncTime).toArray();
    await this.syncCollection('sessions', sessions, userId);
    
    // Sync search click events separately
    const clickEvents = await db.events
      .where('operation')
      .equals(EventType.SEARCH_CLICK)
      .and(e => e.timestamp > lastSyncTime)
      .toArray();
    await this.syncEvents(EventType.SEARCH_CLICK, clickEvents, userId);
  }
  
  private async sendBatch(collectionName: string, batch: any[]): Promise<void> {
    // API endpoint based on collection type
    let endpoint: string;
    
    switch (collectionName) {
      case 'sessions':
        endpoint = ENDPOINTS.COLD_STORAGE.SESSIONS;
        break;
      case 'visits':
        endpoint = ENDPOINTS.COLD_STORAGE.VISITS;
        break;
      case 'pages':
        endpoint = ENDPOINTS.COLD_STORAGE.PAGES;
        break;
      default:
        endpoint = `${ENDPOINTS.COLD_STORAGE.BASE}/${collectionName}`;
    }
    
    // Send data to backend
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(transformed)
    });
  }
}
```

---

## Content Extraction

Content extraction converts visited web pages into structured, searchable content.

### Extraction Process

1. **Page Load Detection**: The background service worker detects page loads via navigation events
2. **Context Setting**: The service worker sends page context (pageId, visitId) to the content script
3. **DOM Processing**: Content script waits for DOM to be fully loaded and idle
4. **HTML Parsing**: HTML content is extracted and filtered to remove irrelevant content
5. **Markdown Conversion**: HTML is converted to searchable markdown format
6. **Storage and Notification**: Content is sent to the backend and the success is reported

### Extraction Implementation

The content extraction process is implemented in `src/services/contentExtractor.ts`:

```typescript
async function extractAndSendContent(retryCount = 0): Promise<void> {
  const currentUrl = window.location.href;
  
  try {
    // 1. Wait for DOM to be idle after loading
    await waitForDomIdle();
    
    // 2. Extract HTML from the page
    const rawHTMLString = document.body?.innerHTML || "";
    if (!rawHTMLString) throw new Error("Empty document body");

    // 3. Generate markdown using content filter and markdown generator
    const filter = new PruningContentFilter(
      undefined,
      CONTENT_FILTER_MIN_BLOCKS,
      CONTENT_FILTER_STRATEGY,
      CONTENT_FILTER_THRESHOLD,
      CONTENT_FILTER_LANGUAGE
    );
    const mdGenerator = new DefaultMarkdownGenerator(filter, { body_width: MARKDOWN_BODY_WIDTH });

    const result = mdGenerator.generateMarkdown(rawHTMLString, currentUrl, { body_width: MARKDOWN_BODY_WIDTH }, undefined, true);
    const sourceMarkdown = USE_FIT_MARKDOWN
      ? result.fitMarkdown
      : (result.markdownWithCitations || result.rawMarkdown);

    if (!sourceMarkdown) throw new Error("Markdown generation failed");
    const timestamp = Date.now();
    const title = document.title || DEFAULT_TITLE;

    // 4. Notify background service worker that extraction is complete
    sendExtractionComplete(title, currentUrl, timestamp);

    // 5. Wait for context (pageId, visitId) if not already set
    if (!currentPageId || !currentVisitId) {
      await Promise.race([
        contextReadyPromise,
        new Promise<void>((_, reject) => setTimeout(() => reject(new Error("Context Timeout")), 30000))
      ]);
    }

    // 6. Send content to backend API
    const sessionId = await getCurrentSessionId();
    if (sessionId && currentPageId && currentVisitId) {
      try {
        const userInfo = await getUserInfo(false);
        await sendContentEvent({
          pageId: currentPageId,
          visitId: currentVisitId,
          url: currentUrl,
          title,
          markdown: sourceMarkdown,
          metadata: { language: 'en' },
        });
        console.log("[ContentExtractor] Content sent to backend successfully.");
      } catch (err) {
        console.error("[ContentExtractor] sendContentEvent error:", err);
      }
    }
  } catch (err) {
    // Handle errors and retry if needed
    if (retryCount < MAX_RETRIES) {
      console.log(`[ContentExtractor] Retrying... attempt ${retryCount + 1}`);
      setTimeout(() => extractAndSendContent(retryCount + 1), RETRY_DELAY_MS);
    } else {
      sendExtractionError("EXTRACTION_FAILED", String(err?.message || err), currentUrl, err?.stack);
    }
  }
}
```

### Filtering Non-Web Pages

The extension now filters content extraction to only process actual web pages:

```typescript
// In src/utils/urlUtils.ts
export function isWebPage(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://');
}
```

This prevents the extension from attempting to extract content from browser-internal pages, extension pages, devtools, and other non-extractable sources.

---

## Search Implementation

The search functionality uses a hybrid approach combining local and backend search for optimal performance.

### Search Components

1. **Local QuickLaunch**: Fast searching with IndexedDB via `src/services/localQuickLauncher.ts`
2. **Backend Search**: Server-side search via SSE streaming from the backend
3. **Hybrid Search Hook**: React hook that combines both search methods (`useHybridSearch`)

### Search Implementation

The search functionality is implemented with custom React hooks in `src/utils/useSearch.ts`:

```typescript
// 1. Local search hook - immediate results from IndexedDB
export function useLocalSearch(query: string) {
  return useQuery({
    queryKey: ['local-search', query],
    queryFn: async () => {
      if (!query || query.length < 2) return [];
      const results = await quickLaunch.search(query);
      return results.map(r => ({
        id: r.pageId,
        title: r.title,
        url: r.url,
        score: r.score,
        source: 'local'
      }));
    },
    enabled: query.length >= 2,
  });
}

// 2. Backend streaming search via SSE
export function useBackendStreamingSearch(query: string) {
  const [quickResults, setQuickResults] = useState<SearchResult[]>([]);
  const [semanticResults, setSemanticResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    if (!query || query.length < 2) return;
    
    // Use API_BASE_URL instead of window.location.origin
    // This ensures proper connection in extension context
    const url = new URL('/api/unified-search/stream', API_BASE_URL);
    url.searchParams.append('query', query);
    url.searchParams.append('userId', 'current-user-id');
    url.searchParams.append('timestamp', Date.now().toString());
    url.searchParams.append('triggerSemantic', 'true');

    const source = new EventSource(url.toString());
    
    // Handle streaming results as they arrive
    source.addEventListener('message', (evt) => {
      const data = JSON.parse(evt.data);
      
      // Handle different result types: quicklaunch, semantic, complete
      switch (data.type) {
        case 'quicklaunch':
          // Process quick results
          break;
        case 'semantic':
          // Process semantic results
          break;
        case 'complete':
          // Search complete
          break;
      }
    });
    
    // Proper cleanup
    return () => {
      if (source) source.close();
    };
  }, [query]);

  return { quickResults, semanticResults, isLoading, isComplete };
}

// 3. Combined hybrid search hook
export function useHybridSearch() {
  const [inputValue, setInputValue] = useState('');
  // Debounce backend search to avoid excessive requests
  const [debouncedQuery] = useDebounce(inputValue, 300);
  const [immediateQuery, setImmediateQuery] = useState('');

  // Local search - immediate on each keystroke
  const { data: localResults = [] } = useLocalSearch(inputValue);

  // Backend search - debounced or immediate on Enter
  const backendQuery = immediateQuery || debouncedQuery;
  const { quickResults, semanticResults } = useBackendStreamingSearch(backendQuery);

  // Combine and deduplicate results
  const results = useMemo(() => {
    const combined = [...localResults, ...quickResults, ...semanticResults];
    return combined.filter((r, idx, self) =>
      idx === self.findIndex(x => x.id === r.id)
    );
  }, [localResults, quickResults, semanticResults]);

  // Allow bypassing debounce by pressing Enter
  const handleEnterKey = useCallback((value: string) => {
    setImmediateQuery(value);
  }, []);

  return {
    inputValue,
    setInputValue,
    handleEnterKey,
    results,
    localResults,
    quickResults,
    semanticResults
  };
}
```

### Search Optimization

The search experience is optimized by:

1. **Instant Local Results**: Local search provides immediate feedback with each keystroke
2. **Debounced Backend Search**: Backend search only triggers after typing pauses (300ms)
3. **Immediate Backend Search**: Enter key bypasses debounce for immediate backend search
4. **Streaming Results**: Backend results stream in progressively via Server-Sent Events
5. **Result Deduplication**: All result sources are deduplicated based on unique IDs
6. **Browser Extension Compatibility**: Using `API_BASE_URL` instead of `window.location.origin` ensures the search works in extension contexts

---

## Browser Storage

The extension uses IndexedDB (via Dexie.js) for local storage of browsing data:

### Storage Components

1. **IndexedDB Tables**:
   - `pages`: Stores metadata about visited pages
   - `visits`: Records individual page visits with timestamps
   - `sessions`: Tracks browsing sessions
   - `edges`: Stores navigation relationships between pages
   - `events`: Logs various events for later cold storage sync

2. **Chrome Extension Storage**:
   - `chrome.storage.local`: For extension settings and state

3. **In-Memory State**:
   - Used in the background service worker for tracking the current session

### Dexie Implementation

The database is defined in `src/db/dexieDB.ts` and accessed through utility modules:

```typescript
// Database schema
export class DoryDatabase extends Dexie {
  pages!: Table<PageRecord>;
  visits!: Table<VisitRecord>;
  sessions!: Table<SessionRecord>;
  edges!: Table<EdgeRecord>;
  events!: Table<EventRecord>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      pages: 'pageId, url, domain, lastVisit',
      visits: 'visitId, pageId, sessionId, startTime, endTime',
      sessions: 'sessionId, startTime, endTime',
      edges: '++id, [fromPageId+toPageId], sessionId, timestamp',
      events: '++id, operation, timestamp, sessionId'
    });
  }
}
```

### Page and Visit Tracking

Pages and visits are tracked using the `dexieBrowsingStore.ts` utility:

```typescript
// Create or get page record
export async function createOrGetPage(
  url: string,
  title: string,
  timestamp: number
): Promise<string> {
  const db = dexieDb.getDB();

  // Try to find an existing page with this URL
  const existingPage = await db.pages.where('url').equals(url).first();
  if (existingPage) {
    // Update existing page
    await db.pages.update(existingPage.pageId, {
      title: title || existingPage.title,
      lastVisit: timestamp,
      visitCount: (existingPage.visitCount || 0) + 1,
      updatedAt: timestamp
    });
    return existingPage.pageId;
  }

  // Create new page record
  const pageId = generateUUID();
  const domain = extractDomain(url);
  
  await db.pages.add({
    pageId,
    url,
    title,
    domain,
    firstVisit: timestamp,
    lastVisit: timestamp,
    visitCount: 1,
    totalActiveTime: 0,
    updatedAt: timestamp
  });
  
  return pageId;
}

// Start tracking a visit
export async function startVisit(
  pageId: string,
  sessionId: number,
  fromPageId?: string,
  isBackNav?: boolean
): Promise<string> {
  const visitId = generateUUID();
  const now = Date.now();
  
  await db.visits.add({
    visitId,
    pageId,
    sessionId,
    fromPageId,
    startTime: now,
    endTime: null,
    totalActiveTime: 0,
    isBackNavigation: !!isBackNav,
    updatedAt: now
  });
  
  return visitId;
}
```

### Cold Storage Sync

Data is periodically synced to the backend using the `ColdStorageSync` service:

```typescript
export class ColdStorageSync {
  // Initialize daily alarm-based scheduling for MV3
  public static initializeScheduling(): void {
    chrome.alarms.clear('doryColdStorageSync');
    chrome.alarms.create('doryColdStorageSync', {
      periodInMinutes: SYNC_INTERVAL_MINUTES,
      when: Date.now() + 60_000 // start ~1 min from now
    });
  }
  
  // Sync data to backend cold storage
  public async performSync(): Promise<void> {
    // Sync pages, visits, sessions, and events that have
    // been updated since the last sync
    await this.syncData();
    
    // Update last sync time
    await chrome.storage.local.set({ [LAST_SYNC_KEY]: Date.now() });
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
  // Use the hybrid search hook
  const {
    inputValue,
    setInputValue,
    handleEnterKey,
    results,
    isSearching
  } = useHybridSearch();
  
  // Handle input changes
  const handleQueryChange = (newQuery: string) => {
    setInputValue(newQuery);
  };
  
  // Handle key events (e.g., Enter)
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleEnterKey(inputValue);
    }
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
        <SearchBar
          value={inputValue}
          onChange={handleQueryChange}
          onKeyDown={handleKeyDown}
          placeholder="Search your history..."
          isLoading={isSearching}
        />
        
        {results.length > 0 && (
          <ResultsList>
            {results.map((result, index) => (
              <ResultItem
                key={result.id}
                onClick={() => handleResultClick(result)}
                // ...other props
              />
            ))}
          </ResultsList>
        )}
      </SearchContainer>
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

---

## Data Flow

### Authentication Flow

```
Extension Load → Check Auth → If Authenticated → Initialize Extension Components → Normal Operation
                           → If Not Authenticated → Disable Functionality → Wait for Auth
```

### Navigation Tracking Flow

```
Page Navigation (onCommitted) → Create/Update Page Record → Start Visit
                              → Set Extraction Context → Wait for Complete Page Load (onCompleted)
                              → Trigger Content Extraction
```

### Content Extraction Flow

```
Extraction Trigger → Wait for DOM Idle → Extract HTML → Convert to Markdown
                   → Send Context to Background → Send Content to Backend API
```

### Search Flow

```
User Types → Immediate Local Search → Debounced Backend Search → Results Stream In
          → User Sees Combined Results → User Clicks Result → Click Is Tracked
```

### Cold Storage Sync Flow

```
Daily Alarm → Check Last Sync Time → Fetch Changed Records → Batch Send to Backend
```

---

## Development Guidelines

### Configuration

All configuration is centralized in `src/config.ts`:

```typescript
// API base URL for backend communication
export const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000/api';

// Available backend endpoints
export const ENDPOINTS = {
  HEALTH: '/health',
  UNIFIED_SEARCH: '/unified-search',
  CONTENT: '/content',
  COLD_STORAGE: {
    BASE: '/cold-storage',
    PAGES: '/cold-storage/pages',
    VISITS: '/cold-storage/visits',
    SESSIONS: '/cold-storage/sessions',
    SEARCH_CLICKS: '/cold-storage/search-clicks'
  }
} as const;

// API request settings
export const REQUEST_TIMEOUT = 60000; // 60 seconds
export const RETRY_ATTEMPTS = 3;
export const RETRY_DELAY = 5000; // 5 seconds between retries

// Processing options
export const USE_FIT_MARKDOWN = true; // Whether to use fitMarkdown or regular markdown

// Event streaming config
export const EVENT_BATCH_SIZE = 50; // Maximum number of events to send in a batch
export const EVENT_FLUSH_INTERVAL = 30000; // Flush events every 30 seconds

// Queue processing configuration
export const QUEUE_CONFIG = {
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 3000,
  PROCESSING_TIMEOUT_MS: 60000,
  DOM_IDLE_TIMEOUT_MS: 7000,
  DOM_IDLE_CHECK_DELAY_MS: 500
} as const;
```

### Best Practices

1. **Authentication**: Gate all functionality at the extension level via service worker
2. **API Communication**: Always use `API_BASE_URL` from config instead of `window.location.origin`
3. **URL Handling**: Use `isWebPage()` to filter processing for actual web pages only
4. **Error Handling**: Implement proper retry logic for all API calls
5. **Resource Cleanup**: Always clean up resources like EventSource connections
6. **Performance**: Use hybrid search approach for optimal UX
7. **Type Safety**: Use TypeScript interfaces for all data structures
