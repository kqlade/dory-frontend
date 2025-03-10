# DORY Backend API Documentation

This document provides comprehensive details on the DORY backend API endpoints, expected payloads, and response structures. It serves as a reference for frontend developers integrating with the DORY backend services.

## Table of Contents

1. [Authentication](#authentication)
2. [Cold Storage API](#cold-storage-api)
   - [Pages API](#pages-api)
   - [Visits API](#visits-api)
   - [Sessions API](#sessions-api)
   - [Implementation Notes](#cold-storage-implementation-notes)
3. [Content API](#content-api)
   - [Content Extraction](#content-extraction)
4. [Unified Search API](#unified-search-api)
   - [Search API](#search)
   - [Click Tracking API](#click-tracking)
   - [Result Ranking](#result-ranking)
5. [Error Handling](#error-handling)

## Authentication

Authentication details should be included in all requests. The specific authentication mechanism used depends on your deployment configuration.

---

## Cold Storage API

The Cold Storage API allows the frontend to sync browsing history data once per day, including pages, visits, and sessions.

### Pages API

```
POST /api/cold-storage/pages
```

#### Request Payload

```json
[
  {
    "pageId": "12345",
    "userId": "user123",
    "title": "Example Website Title",
    "url": "https://example.com/path",
    "firstVisit": 1647823456789,
    "lastVisit": 1648023456789,
    "visitCount": 5,
    "totalActiveTime": 450,
    "totalDuration": 580,
    "lastModified": 1648023456789
  },
  {
    // Additional page records...
  }
]
```

Fields:
- `pageId`: (Required) Unique identifier for the page
- `userId`: (Required) Identifier for the user who visited the page
- `title`: (Required) Page title
- `url`: (Required) Full URL
- `firstVisit`: (Required) First visit timestamp (ms)
- `lastVisit`: (Required) Most recent visit timestamp (ms)
- `visitCount`: (Required) Number of times visited
- `totalActiveTime`: (Required) Total time spent active on page (seconds)
- `totalDuration`: (Required) Total time page was open (seconds)
- `lastModified`: (Required) Last modified timestamp (ms)

#### Response

```json
{
  "success": true,
  "syncedCount": 5,
  "serverTimestamp": 1648023456789,
  "nextSyncAfter": 1648109856789
}
```

### Visits API

```
POST /api/cold-storage/visits
```

#### Request Payload

```json
[
  {
    "visitId": "visit_12345abc",
    "userId": "user123",
    "pageId": "12345",
    "sessionId": "session_67890xyz",
    "startTime": 1647823456789,
    "endTime": 1647823556789,
    "duration": 100.0,
    "fromPageId": "12344",
    "totalActiveTime": 98.5,
    "isBackNavigation": false
  },
  {
    // Additional visit records...
  }
]
```

Fields:
- `visitId`: (Required) Unique identifier for the visit
- `userId`: (Required) Identifier for the user who made the visit
- `pageId`: (Required) Reference to the page
- `sessionId`: (Required) Reference to the browsing session
- `startTime`: (Required) Visit start timestamp (ms)
- `endTime`: (Required/Null) Visit end timestamp (ms), null if ongoing
- `duration`: (Required) Total time page was open (seconds)
- `fromPageId`: (Optional) Reference to the referrer page, if any
- `totalActiveTime`: (Required) Time actively engaged with the page (seconds)
- `isBackNavigation`: (Required) Whether this was a back navigation

#### Response

```json
{
  "success": true,
  "syncedCount": 12,
  "serverTimestamp": 1648023456789,
  "nextSyncAfter": 1648109856789
}
```

### Sessions API

```
POST /api/cold-storage/sessions
```

#### Request Payload

```json
[
  {
    "sessionId": "session_67890xyz",
    "userId": "user123",
    "startTime": 1647823456000,
    "endTime": 1647833456000,
    "totalActiveTime": 3540,
    "totalDuration": 3600,
    "deviceInfo": {
      "browser": "Chrome",
      "browserVersion": "98.0.4758.102",
      "os": "Windows",
      "osVersion": "10"
    }
  },
  {
    // Additional session records...
  }
]
```

Fields:
- `sessionId`: (Required) Unique identifier for the session
- `userId`: (Required) Identifier for the user who created the session
- `startTime`: (Required) Session start timestamp (ms)
- `endTime`: (Required/Null) Session end timestamp (ms), null if ongoing
- `totalActiveTime`: (Required) Total active time across all pages (seconds)
- `totalDuration`: (Required) Total session duration (seconds)
- `deviceInfo`: (Required) Object containing device information
  - `browser`: (Required) Browser name
  - `browserVersion`: (Required) Browser version
  - `os`: (Required) Operating system
  - `osVersion`: (Required) Operating system version

#### Response

```json
{
  "success": true,
  "syncedCount": 3,
  "serverTimestamp": 1648023456789,
  "nextSyncAfter": 1648109856789
}
```

### Cold Storage Implementation Notes

#### Sync Frequency

- Cold storage data should be synced once per day, typically during browser idle time
- Only records modified since the last successful sync should be transmitted
- The `nextSyncAfter` field in responses indicates when the next sync should occur

#### Batching

- Data should be sent in batches of up to 500 records at a time
- If more records need to be synced, send multiple batches

#### Error Handling

- If a sync fails, the client should retry during the next sync window
- Failed records remain eligible for future syncs since the last sync timestamp is only updated after successful syncs

---

## Content API

The Content API handles real-time content extraction events that need immediate processing for search functionality.

### Content Extraction

```
POST /api/content
```

#### Request Payload

```json
{
  "contentId": "content_12345abc",
  "sessionId": "session_67890xyz",
  "userId": "user123",
  "timestamp": 1647823456789,
  "data": {
    "pageId": "12345",
    "visitId": "visit_67890xyz",
    "userId": "user123",
    "url": "https://example.com/path",
    "content": {
      "title": "Example Page Title",
      "markdown": "# Heading\n\nThis is the extracted content...",
      "metadata": {
        "language": "en"
      }
    }
  }
}
```

Fields:
- `contentId`: (Required) Unique identifier for the content
- `sessionId`: (Required) Session when content was extracted
- `userId`: (Required) Identifier for the user who visited the page
- `timestamp`: (Required) When the event occurred (ms)
- `data`: (Required) Object containing content data
  - `pageId`: (Required) Reference to the page
  - `visitId`: (Required) Reference to the visit
  - `userId`: (Required) User ID (duplicated for data consistency)
  - `url`: (Required) URL of the page
  - `content`: (Required) Object containing the extracted content
    - `title`: (Required) Page title
    - `markdown`: (Required) Page content in markdown format
    - `metadata`: (Optional) Additional metadata
      - `language`: (Optional) Detected language of the content

#### Response

```json
{
  "success": true,
  "contentId": "content_12345abc",
  "result": {
    "stored": true
  }
}
```

#### Content Extraction Behavior

Unlike cold storage data, content extraction events:
- Are sent immediately when content is extracted, not in daily batch syncs
- Trigger immediate processing for search indexing and embeddings
- Are processed in real-time to make content searchable as quickly as possible

---

## Unified Search API

The Unified Search API provides a single endpoint that combines history-based, title/URL, and content-based search capabilities. It returns results as a stream using Server-Sent Events (SSE) for a responsive user experience.

### Search

```
POST /api/unified-search
```

#### Request Payload

```json
{
  "query": "search query",
  "userId": "user-id",
  "timestamp": 1682541285123,
  "triggerSemantic": false
}
```

Fields:
- `query`: (Required) The search text to find
- `userId`: (Required) User identifier for personalized results
- `timestamp`: (Optional) When the query was entered (milliseconds since epoch)
- `triggerSemantic`: (Optional, default: false) Whether to run the more expensive semantic search

#### Search Behavior

The search functionality checks against both title and URL fields of pages, matching your query against either field without duplicating results. If a page matches both in title and URL, the best match score is used.

#### Analytics & Logging

For analytics purposes, **only final queries** (`triggerSemantic: true`) and their timestamps are stored in the backend. Intermediate queries during typing are processed but not logged, to avoid polluting analytics data with partial searches.

The `timestamp` you provide with final queries is particularly important as it represents when the user finished typing or pressed Enter, giving accurate timing data for analytics.

#### Performance Optimization

The `triggerSemantic` parameter controls when the more expensive semantic search is performed:

- `triggerSemantic: false`: Only fast history/title-based results are returned (QuickLaunch). Use this for live suggestions as the user types.
- `triggerSemantic: true`: Both fast results AND deeper content-based semantic search is performed. Use this when the user has paused typing or pressed Enter.

This optimization avoids running computationally expensive semantic search on partial queries while the user is still typing, significantly improving performance and resource usage.

#### Usage Pattern

Typical usage follows this pattern:

1. **As the user types**: Send requests with `triggerSemantic: false` (after a short debounce, e.g., 100-200ms)
2. **When typing pauses or Enter pressed**: Send request with `triggerSemantic: true` (after longer idle time, e.g., 500ms or on Enter key)
3. **Always cancel previous SSE connections** when starting a new search to avoid stale results

#### Response

The response is a Server-Sent Events (SSE) stream. Each event has a `type` field and associated data. The events arrive in sequence, with faster results delivered first:

##### Event: Initial Results (Fast)

These results come first, typically within milliseconds, and are based on browsing history and page titles/URLs:

```
event: message
data: {
  "type": "quicklaunch",
  "results": [
    {
      "pageId": "page-id-1",
      "title": "Page Title 1",
      "url": "https://example.com/page1",
      "score": 0.95,
      "searchSessionId": "user-id-1682541285123-xyz"
    },
    {
      "pageId": "page-id-2",
      "title": "Page Title 2",
      "url": "https://example.com/page2",
      "score": 0.82,
      "searchSessionId": "user-id-1682541285123-xyz"
    }
  ],
  "complete": true,
  "semanticPending": true
}
```

##### Event: Deep Content Results

These results arrive next, after semantic analysis of page content (only if `triggerSemantic: true`):

```
event: message
data: {
  "type": "semantic",
  "results": [
    {
      "pageId": "page-id-3",
      "title": "Page Title 3",
      "url": "https://example.com/page3",
      "score": 0.87,
      "searchSessionId": "user-id-1682541285123-xyz"
    }
  ],
  "complete": true
}
```

##### Event: Completion

The final event indicating all results have been sent:

```
event: message
data: {
  "type": "complete",
  "message": "Search complete",
  "searchSessionId": "user-id-1682541285123-xyz"
}
```

##### Event: Error

Error events can occur at any point in the stream:

```
event: message
data: {
  "type": "error",
  "message": "Error message",
  "source": "quicklaunch|semantic"
}
```

### Result Schema

Each search result contains:

```json
{
  "pageId": "unique-page-id",      // Unique identifier for the page
  "title": "Page Title",           // Human-readable title of the page
  "url": "https://example.com",    // URL of the page
  "score": 0.95,                   // Relevance score (0-1, higher is better)
  "searchSessionId": "user-id-1682541285123-xyz" // Session ID for click tracking
}
```

### Result Ranking

Both types of search results include ranking information through the `score` property:

#### QuickLaunch Results Ranking

1. **Score Range**: Values between 0.0 and 1.0, with higher values indicating greater relevance.
2. **Score Calculation**: QuickLaunch results are returned in order of relevance, with scores calculated based on:
   - Browsing history frequency and recency
   - String similarity between query and page title/URL
   - The highest-ranked result has a score close to 1.0
3. **Result Limit**: Up to 10 QuickLaunch results are returned.

#### Semantic Search Results Ranking

1. **Score Range**: Values between 0.0 and 1.0, with higher values indicating greater relevance.
2. **Score Calculation**: Semantic search scores are based on:
   - Vector similarity between query and page content
   - LLM-based relevance assessments when reranking is enabled
3. **Result Limit**: Up to 10 semantic search results are returned.

#### Combined Results

When both QuickLaunch and semantic search results are returned (`triggerSemantic: true`), they're deduplicated so the same page doesn't appear twice. The frontend may choose to:
  - Display them as separate sections (QuickLaunch vs. Content)
  - Merge and resort by score
  - Apply custom UI treatments based on score ranges

### Click Tracking

When a user clicks on a search result, send a click tracking event to help analyze which results are most useful.

```
POST /api/unified-search/click
```

#### Request Payload

```json
{
  "searchSessionId": "user-id-1682541285123-xyz", // Required: Session ID from the search result
  "pageId": "page-id-3",                          // Required: ID of the clicked result
  "position": 2,                                  // Optional: Position in results (0-based index)
  "timestamp": 1682541290456                      // Optional: When the click occurred
}
```

Fields:
- `searchSessionId`: (Required) The session ID received with the search results
- `pageId`: (Required) The ID of the clicked result
- `position`: (Optional) The position/index of the result in the list (0-based)
- `timestamp`: (Optional) When the click occurred (if not provided, current time is used)

#### Response

```json
{
  "success": true
}
```

#### Frontend Implementation

When a user clicks on a search result, send a request to the click tracking endpoint:

```javascript
function handleResultClick(result, position) {
  // First, navigate to the result URL
  window.location.href = result.url;
  
  // Then log the click (can run in the background)
  fetch('/api/unified-search/click', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      searchSessionId: result.searchSessionId,
      pageId: result.pageId,
      position: position,
      timestamp: Date.now()
    })
  }).catch(error => {
    // Non-critical, so just log errors
    console.error('Error logging click:', error);
  });
}
```

#### Implementation Notes

- Click tracking is independent of page navigation - the request should be sent as the user clicks, but doesn't need to complete before navigation
- The `searchSessionId` correlates clicks with specific search queries and results
- Click data is stored separately from search events for analytics purposes
- Sessions expire after 24 hours, so clicks should be tracked promptly

### Frontend Integration Example

```javascript
// Track the current SSE connection
let currentSearch = null;

// For live suggestions while typing (after short debounce)
const quickSearch = (query, userId) => {
  // Cancel any existing search
  if (currentSearch) {
    currentSearch.close();
  }

  // Create new search
  currentSearch = searchWithSSE(query, userId, false);
};

// For final query (when user pauses or presses Enter)
const deepSearch = (query, userId) => {
  // Cancel any existing search
  if (currentSearch) {
    currentSearch.close();
  }

  // Create new search with semantic results
  currentSearch = searchWithSSE(query, userId, true);
};

// Main SSE search function
const searchWithSSE = (query, userId, triggerSemantic = false) => {
  // Create a controller to allow cancellation
  const controller = new AbortController();
  
  // First, create the payload
  const payload = JSON.stringify({
    query,
    userId,
    timestamp: Date.now(),
    triggerSemantic
  });

  // Then, set up the fetch request
  fetch('/api/unified-search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
    },
    body: payload,
    signal: controller.signal
  }).then(response => {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    // Function to process chunks of data
    function processChunk({ done, value }) {
      if (done) return;
      
      // Decode the chunk and add to buffer
      buffer += decoder.decode(value, { stream: true });
      
      // Process complete events in buffer
      const events = buffer.split('\n\n');
      buffer = events.pop(); // Keep the last potentially incomplete event
      
      for (const event of events) {
        if (!event.trim()) continue;
        
        // Extract data payload
        const dataMatch = event.match(/^data: (.+)$/m);
        if (!dataMatch) continue;
        
        try {
          const data = JSON.parse(dataMatch[1]);
          
          // Handle different event types
          if (data.type === 'quicklaunch') {
            // Update UI with fast results
            updateSearchResults(data.results, 'quicklaunch');
          } 
          else if (data.type === 'semantic') {
            // Add or update UI with semantic results
            updateSearchResults(data.results, 'semantic');
          }
          else if (data.type === 'error') {
            // Handle error
            showError(data.message);
          }
          else if (data.type === 'complete') {
            // Search complete
            showSearchComplete();
            return;
          }
        } catch (e) {
          console.error('Error parsing SSE data:', e);
        }
      }
      
      // Continue reading
      reader.read().then(processChunk);
    }
    
    // Start reading
    reader.read().then(processChunk);
  })
  .catch(error => {
    // Ignore abort errors (from closing)
    if (error.name !== 'AbortError') {
      console.error('SSE Error:', error);
      showError('Connection error. Please try again.');
    }
  });
  
  // Return an object with close method
  return {
    close: () => controller.abort()
  };
};

// Example usage with debounce
let quickSearchDebounce = null;
let deepSearchDebounce = null;

searchInput.addEventListener('input', (e) => {
  const query = e.target.value;
  const userId = getCurrentUserId();
  
  // Clear existing timeouts
  clearTimeout(quickSearchDebounce);
  clearTimeout(deepSearchDebounce);
  
  // Quick search after short delay (live suggestions)
  quickSearchDebounce = setTimeout(() => {
    quickSearch(query, userId);
  }, 150);
  
  // Deep search after longer delay (when user likely finished typing)
  deepSearchDebounce = setTimeout(() => {
    deepSearch(query, userId);
  }, 500);
});

// Handle Enter key for immediate deep search
searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    clearTimeout(quickSearchDebounce);
    clearTimeout(deepSearchDebounce);
    
    const query = e.target.value;
    const userId = getCurrentUserId();
    deepSearch(query, userId);
  }
});
```

## Working with Server-Sent Events

The Unified Search API uses Server-Sent Events (SSE) to provide a streaming response. This allows the frontend to:

1. Display initial results immediately (typically within milliseconds)
2. Then enhance the results with deeper content-based results as they become available
3. Provide a responsive UX without waiting for the slower semantic search to complete

### Key Advantages

- **Progressive Enhancement**: Users see relevant results immediately
- **Perceived Performance**: The interface feels faster and more responsive
- **Optimized Resource Usage**: Expensive semantic search only runs when needed (final queries)
- **Deduplication**: The backend handles deduplication of results automatically
- **Error Handling**: Each phase of the search can report errors independently

## Key Implementation Details

1. **Two-Phase Search**:
   - Fast results always run on every query (when typing)
   - Semantic search only runs on final queries (controlled by `triggerSemantic`)

2. **Enhanced Matching**:
   - Search checks both page titles and URLs for matches
   - Returns the best match without duplicating results

3. **Results Ordering**:
   - Initial results are always delivered first
   - Deep content results follow, already deduplicated against initial results
   - All results include their relevance score for custom sorting if needed

4. **Analytics Storage**:
   - Only final queries with `triggerSemantic: true` are stored for analytics
   - The timestamp of these final queries represents when the user completed their search
   - Intermediate typing queries (`triggerSemantic: false`) are processed but not logged
   - This prevents analytics pollution with partial search queries
   - Click tracking provides insights into which results users interact with

---

## Error Handling

All API endpoints return standard HTTP status codes:

- `200` - Success
- `400` - Bad request (invalid parameters)
- `401` - Unauthorized
- `404` - Resource not found
- `500` - Server error

Error responses include a JSON object with details:

```json
{
  "error": "Error message"
}
```

For the SSE-based Unified Search, errors are sent as events with type "error". 