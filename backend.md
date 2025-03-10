# DORY Backend API Documentation

This document provides comprehensive details on the DORY backend API endpoints, expected payloads, and response structures. It serves as a reference for frontend developers integrating with the DORY backend services.

## Table of Contents

1. [Authentication](#authentication)
2. [Event API](#event-api)
3. [Unified Search API](#unified-search-api)
4. [Error Handling](#error-handling)

## Authentication

Authentication details should be included in all requests. The specific authentication mechanism used depends on your deployment configuration.

---

## Event API

The Event API allows the frontend to report user activities and document interactions.

### Send Event

```
POST /api/events
```

#### Request Payload

```json
{
  "operation": "EVENT_TYPE",
  "sessionId": "unique-session-id",
  "userId": "user-id",
  "userEmail": "user@example.com",
  "timestamp": 1682541285123,
  "data": {
    // Event-specific data
  }
}
```

The `operation` field must be one of the following event types:

- `SESSION_STARTED` - When a new browsing session begins
- `PAGE_VISIT_STARTED` - When a user navigates to a page
- `PAGE_VISIT_ENDED` - When a user leaves a page
- `CONTENT_EXTRACTED` - When page content has been extracted
- `ACTIVE_TIME_UPDATED` - When tracking active time on a page
- `SESSION_ENDED` - When a browsing session ends

#### Event-Specific Data Structures

##### SESSION_STARTED

```json
{
  "operation": "SESSION_STARTED",
  "data": {
    "userAgent": "Mozilla/5.0...",
    "platform": "MacOS",
    "language": "en-US"
  }
}
```

##### PAGE_VISIT_STARTED

```json
{
  "operation": "PAGE_VISIT_STARTED",
  "data": {
    "pageId": "unique-page-id",
    "visitId": "unique-visit-id",
    "url": "https://example.com/page",
    "title": "Example Page Title",
    "isBackNavigation": false,
    "fromPageId": "previous-page-id"
  }
}
```

##### CONTENT_EXTRACTED

```json
{
  "operation": "CONTENT_EXTRACTED",
  "data": {
    "pageId": "unique-page-id",
    "visitId": "unique-visit-id",
    "url": "https://example.com/page",
    "content": {
      "title": "Example Page Title",
      "markdown": "# Content in markdown format\n\nPage content here...",
      "metadata": {
        "language": "en"
      }
    }
  }
}
```

##### PAGE_VISIT_ENDED

```json
{
  "operation": "PAGE_VISIT_ENDED",
  "data": {
    "pageId": "unique-page-id",
    "visitId": "unique-visit-id",
    "toPageId": "next-page-id",
    "timeSpent": 120
  }
}
```

##### ACTIVE_TIME_UPDATED

```json
{
  "operation": "ACTIVE_TIME_UPDATED",
  "data": {
    "pageId": "unique-page-id",
    "visitId": "unique-visit-id",
    "duration": 45.5,
    "isActive": false
  }
}
```

##### SESSION_ENDED

```json
{
  "operation": "SESSION_ENDED",
  "data": {
    "totalDuration": 3600,
    "pagesVisited": 12
  }
}
```

#### Response

```json
{
  "success": true,
  "eventId": "stored-event-id",
  "result": {
    "acknowledged": true,
    "operation": "EVENT_TYPE"
  }
}
```

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

### Click Tracking

The Unified Search API includes click tracking to help analyze which search results users interact with. Each result returned by the API includes a `searchSessionId` that should be used when reporting clicks.

#### Search Click Endpoint

```
POST /api/unified-search/click
```

#### Request Payload

```json
{
  "searchSessionId": "user-id-1682541285123-xyz", // Required: Session ID from the search result
  "pageId": "page-id-3",                          // Required: ID of the clicked page
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