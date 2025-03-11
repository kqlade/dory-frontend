# Dory Frontend-Backend Payload Documentation

This document outlines the required structure for each type of data the frontend sends to the backend. It serves as a reference for frontend developers to ensure proper data formatting and communication between the frontend and backend systems.

## Table of Contents

1. [Cold Storage API](#cold-storage-api)
   - [Pages](#pages)
   - [Visits](#visits)
   - [Sessions](#sessions)
   - [Search Clicks](#search-clicks)
2. [Content API](#content-api)
   - [Content Extraction](#content-extraction)
3. [Unified Search API](#unified-search-api)
   - [Search Query](#search-query)
   - [Search Click (Deprecated)](#search-click-deprecated)

---

## Cold Storage API

The Cold Storage API is used for batch synchronization of browsing history data. The frontend should collect data locally and sync it periodically (typically once per day) to the backend.

### Pages

**Endpoint:** `POST /api/cold-storage/pages`

**Payload Structure:**
```json
[
  {
    "pageId": "unique-page-identifier",
    "userId": "user-identifier",
    "title": "Page Title",
    "url": "https://example.com/page",
    "firstVisit": 1647823456789,
    "lastVisit": 1648023456789,
    "visitCount": 5,
    "totalActiveTime": 450,
    "totalDuration": 580,
    "lastModified": 1648023456789
  },
  // Additional page records...
]
```

**Field Descriptions:**
- `pageId` (Required): Unique identifier for the page
- `userId` (Required): Identifier for the user who visited the page
- `title` (Required): Page title
- `url` (Required): Full URL
- `firstVisit` (Required): First visit timestamp (ms since epoch)
- `lastVisit` (Required): Most recent visit timestamp (ms since epoch)
- `visitCount` (Required): Number of times visited
- `totalActiveTime` (Required): Total time spent active on page (seconds)
- `totalDuration` (Required): Total time page was open (seconds)
- `lastModified` (Required): Last modified timestamp (ms since epoch)

### Visits

**Endpoint:** `POST /api/cold-storage/visits`

**Payload Structure:**
```json
[
  {
    "visitId": "unique-visit-identifier",
    "userId": "user-identifier",
    "pageId": "page-identifier",
    "sessionId": "session-identifier",
    "startTime": 1647823456789,
    "endTime": 1647823556789,
    "duration": 100.0,
    "fromPageId": "previous-page-id",
    "totalActiveTime": 98.5,
    "isBackNavigation": false
  },
  // Additional visit records...
]
```

**Field Descriptions:**
- `visitId` (Required): Unique identifier for the visit
- `userId` (Required): Identifier for the user who made the visit
- `pageId` (Required): Reference to the page
- `sessionId` (Required): Reference to the browsing session
- `startTime` (Required): Visit start timestamp (ms since epoch)
- `endTime` (Required/Null): Visit end timestamp (ms since epoch), null if ongoing
- `duration` (Required): Total time page was open (seconds)
- `fromPageId` (Optional): Reference to the referrer page, if any
- `totalActiveTime` (Required): Time actively engaged with the page (seconds)
- `isBackNavigation` (Required): Whether this was a back navigation

### Sessions

**Endpoint:** `POST /api/cold-storage/sessions`

**Payload Structure:**
```json
[
  {
    "sessionId": "unique-session-identifier",
    "userId": "user-identifier",
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
  // Additional session records...
]
```

**Field Descriptions:**
- `sessionId` (Required): Unique identifier for the session
- `userId` (Required): Identifier for the user who created the session
- `startTime` (Required): Session start timestamp (ms since epoch)
- `endTime` (Required/Null): Session end timestamp (ms since epoch), null if ongoing
- `totalActiveTime` (Required): Total active time across all pages (seconds)
- `totalDuration` (Required): Total session duration (seconds)
- `deviceInfo` (Required): Object containing device information
  - `browser` (Required): Browser name
  - `browserVersion` (Required): Browser version
  - `os` (Required): Operating system
  - `osVersion` (Required): Operating system version

### Search Clicks

**Endpoint:** `POST /api/cold-storage/search-clicks`

**Payload Structure:**
```json
[
  {
    "clickId": "unique-click-identifier",
    "userId": "user-identifier",
    "searchSessionId": "search-session-identifier",
    "pageId": "page-identifier",
    "position": 2,
    "url": "https://example.com/page",
    "query": "search query text",
    "timestamp": 1647823456789
  },
  // Additional search click records...
]
```

**Field Descriptions:**
- `clickId` (Required): Unique identifier for the click
- `userId` (Required): Identifier for the user who clicked the result
- `searchSessionId` (Required): Search session ID from the search results
- `pageId` (Required): ID of the clicked page
- `position` (Required): Position in results (0-based index)
- `url` (Required): URL of the clicked result
- `query` (Required): Search query that produced this result
- `timestamp` (Required): When the click occurred (ms since epoch)

---

## Content API

The Content API is used for real-time content extraction events that need immediate processing for search functionality.

### Content Extraction

**Endpoint:** `POST /api/content`

**Payload Structure:**
```json
{
  "contentId": "unique-content-identifier",
  "sessionId": "session-identifier",
  "userId": "user-identifier",
  "timestamp": 1647823456789,
  "data": {
    "pageId": "page-identifier",
    "visitId": "visit-identifier",
    "userId": "user-identifier",
    "url": "https://example.com/page",
    "content": {
      "title": "Page Title",
      "markdown": "# Heading\n\nThis is the extracted content...",
      "metadata": {
        "language": "en"
      }
    }
  }
}
```

**Field Descriptions:**
- `contentId` (Required): Unique identifier for the content
- `sessionId` (Required): Session when content was extracted
- `userId` (Required): Identifier for the user who visited the page
- `timestamp` (Required): When the event occurred (ms since epoch)
- `data` (Required): Object containing content data
  - `pageId` (Required): Reference to the page
  - `visitId` (Required): Reference to the visit
  - `userId` (Required): User ID (duplicated for data consistency)
  - `url` (Required): URL of the page
  - `content` (Required): Object containing the extracted content
    - `title` (Required): Page title
    - `markdown` (Required): Page content in markdown format
    - `metadata` (Optional): Additional metadata
      - `language` (Optional): Detected language of the content

---

## Unified Search API

The Unified Search API provides search functionality across browsing history and content.

### Search Query

**Endpoint:** `POST /api/unified-search`

**Payload Structure:**
```json
{
  "query": "search query text",
  "userId": "user-identifier",
  "timestamp": 1682541285123,
  "triggerSemantic": false
}
```

**Field Descriptions:**
- `query` (Required): The search text to find
- `userId` (Required): User identifier for personalized results
- `timestamp` (Optional): When the query was entered (ms since epoch)
- `triggerSemantic` (Optional, default: false): Whether to run the more expensive semantic search

**Usage Notes:**
- Use `triggerSemantic: false` for live suggestions as the user types (after a short debounce)
- Use `triggerSemantic: true` when typing pauses or the user presses Enter (after longer idle time)
- Always cancel previous SSE connections when starting a new search

### Search Click (Deprecated)

> **DEPRECATED**: This endpoint is maintained for backward compatibility only and will be removed in a future version. Please use the [Search Clicks](#search-clicks) Cold Storage API for all new implementations.

**Endpoint:** `POST /api/unified-search/click`

**Payload Structure:**
```json
{
  "searchSessionId": "search-session-identifier",
  "pageId": "page-identifier",
  "position": 2,
  "timestamp": 1682541290456
}
```

**Field Descriptions:**
- `searchSessionId` (Required): The session ID received with the search results
- `pageId` (Required): The ID of the clicked result
- `position` (Optional): The position/index of the result in the list (0-based)
- `timestamp` (Optional): When the click occurred (ms since epoch)

---

## Implementation Notes

### Cold Storage Sync Frequency

- Cold storage data should be synced once per day, typically during browser idle time
- Only records modified since the last successful sync should be transmitted
- The `nextSyncAfter` field in responses indicates when the next sync should occur

### Batching

- Data should be sent in batches of up to 500 records at a time
- If more records need to be synced, send multiple batches

### Error Handling

- If a sync fails, the client should retry during the next sync window
- Failed records remain eligible for future syncs since the last sync timestamp is only updated after successful syncs

### Content Extraction Behavior

Unlike cold storage data, content extraction events:
- Are sent immediately when content is extracted, not in daily batch syncs
- Trigger immediate processing for search indexing and embeddings
- Are processed in real-time to make content searchable as quickly as possible 