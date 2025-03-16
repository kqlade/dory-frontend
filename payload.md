# Dory API Payload Structures

This document outlines all data structures sent to the Dory backend API, both in real-time and via cold storage sync.

## Real-time Events

These events are sent immediately when they occur.

### Content Event

**Endpoint:** `${API_BASE_URL}${ENDPOINTS.CONTENT}`  
**Purpose:** Sends extracted page content in real-time when browsing

```typescript
{
  contentId: string,        // Dynamically generated as `content_{pageId}_{visitId}_{timestamp}`
  sessionId: string,        // Current browsing session ID (converted to string)
  userId: string,           // User ID from authentication
  timestamp: number,        // Current timestamp in milliseconds
  data: {
    pageId: string,         // ID of the page being viewed
    visitId: string,        // ID of the current visit
    userId: string,         // Same user ID (duplicated in nested object)
    url: string,            // URL of the page
    content: {
      title: string,        // Page title
      markdown: string,     // Page content in markdown format
      metadata: {           // Optional metadata
        language: string,   // Defaults to 'en' if not provided
        // Can contain other arbitrary key-value pairs
      }
    }
  }
}
```

## Cold Storage Events

All events except Content Events are stored locally in IndexedDB first and then synced in batches to the backend periodically by the `ColdStorageSync` class.

### Events Stored Locally

The following event types are stored in the local Dexie database:

1. **Session Events**: Browser session start/end events
2. **Visit Events**: Page visit start/end and active time update events
3. **Search Click Events**: User interactions with search results

These events are then synced in batches using the following payload structures:

### Sessions Batch (Cold Storage Sync)

**Endpoint:** `${API_BASE_URL}${ENDPOINTS.COLD_STORAGE.SESSIONS}`  
**Purpose:** Batch syncs cached session data

```typescript
[
  {
    sessionId: string,         // String ID of the session
    userId: string,            // User ID
    startTime: number,         // When session started
    endTime: number | null,    // When session ended, or null if still active
    totalActiveTime: number,   // Total active time in the session
    isActive: boolean          // Whether the session is still active
  },
  // More session objects...
]
```

### Visits Batch (Cold Storage Sync)

**Endpoint:** `${API_BASE_URL}${ENDPOINTS.COLD_STORAGE.VISITS}`  
**Purpose:** Batch syncs cached visit data

```typescript
[
  {
    visitId: string,           // String ID of the visit
    userId: string,            // User ID
    pageId: string,            // ID of the page visited
    sessionId: string,         // ID of the session
    startTime: number,         // When visit started
    endTime: number | null,    // When visit ended, or null if still active
    totalActiveTime: number,   // Total active time during visit
    fromPageId: string | null, // ID of the page navigated from, if any
    isBackNavigation: boolean  // Whether this was a back navigation
  },
  // More visit objects...
]
```

### Pages Batch (Cold Storage Sync)

**Endpoint:** `${API_BASE_URL}${ENDPOINTS.COLD_STORAGE.PAGES}`  
**Purpose:** Batch syncs cached page data

```typescript
[
  {
    pageId: string,         // String ID of the page
    userId: string,         // User ID
    url: string,            // Page URL
    title: string,          // Page title
    domain: string,         // Domain of the URL
    firstVisit: number,     // Timestamp of first visit
    lastVisit: number,      // Timestamp of most recent visit
    visitCount: number,     // Number of times visited
    totalActiveTime: number // Total time spent active on the page
  },
  // More page objects...
]
```

### Search Click Events (Cold Storage Sync)

**Endpoint:** `${API_BASE_URL}${ENDPOINTS.COLD_STORAGE.SEARCH_CLICKS}`  
**Purpose:** Batch syncs cached search click interactions

```typescript
[
  {
    clickId: string,          // Generated as `click_{searchSessionId}_{pageId}_{timestamp}`
    userId: string,           // User ID
    pageId: string,           // ID of the page clicked
    query: string,            // Search query that led to this click
    position: number,         // Position in search results
    timestamp: number         // When the click occurred
  },
  // More search click objects...
]
```

## Authentication Structure

All API requests include the following authorization header if an auth token is available:

```
Authorization: Bearer ${authToken}
```

Additionally, all requests include:
- Method: `POST`
- Headers: 
  - `Content-Type: application/json`
- Credentials: `include` (sends cookies with cross-origin requests) 