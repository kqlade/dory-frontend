# Cold Storage Sync Payload Documentation

This document describes the data payloads that are sent from the DORY browser extension to the backend cold storage service on a daily basis, as well as real-time content extraction events.

## Overview

The DORY extension sends data to the backend through two primary channels:

1. **Cold Storage Sync**: Browsing history data synced once per day, including:
   - **Pages** - Information about web pages visited
   - **Visits** - Individual page visit events and session information
   - **Sessions** - Browsing session metadata

2. **Real-time Events**: Content extraction data sent immediately when a page is visited:
   - **Content** - Extracted content from web pages (sent in real-time, not through cold storage)

Each cold storage sync operation sends only data that has been created or modified since the last successful sync, making the process efficient and minimizing data transfer.

## Sync Schedule and Process

- **Frequency**: Once every 24 hours for cold storage sync; immediately in real-time for content extraction
- **Batching**: Cold storage data sent in batches of up to 500 records at a time
- **Incremental**: Only records modified since the last sync are transmitted
- **Operation**: Cold storage runs in the background during browser idle time when possible

## API Endpoints

The payloads are sent to the following endpoints:

### Cold Storage Endpoints (Daily Sync)
- `/api/cold-storage/pages`
- `/api/cold-storage/visits`
- `/api/cold-storage/sessions`

### Real-time Endpoint
- `/api/content` (for content extraction events, sent immediately)

## Payload Structures

### Pages Collection

Each record in the pages collection represents a web page that the user has visited.

```json
{
  "pageId": 12345,                    // Unique identifier for the page
  "userId": "user123",                // Identifier for the user who visited the page
  "title": "Example Website Title",   // Page title
  "url": "https://example.com/path",  // Full URL
  "firstVisit": 1647823456789,        // First visit timestamp (ms)
  "lastVisit": 1648023456789,         // Most recent visit timestamp (ms)
  "visitCount": 5,                    // Number of times visited
  "totalActiveTime": 450,             // Total time spent active on page (seconds)
  "totalDuration": 580,               // Total time page was open (seconds)
  "lastModified": 1648023456789       // Last modified timestamp (ms)
}
```

### Visits Collection

Each record in the visits collection represents a single visit to a web page.

```json
{
  "visitId": "visit_12345abc",        // Unique identifier for the visit
  "userId": "user123",                // Identifier for the user who made the visit
  "pageId": 12345,                    // Reference to the page
  "sessionId": "session_67890xyz",    // Reference to the browsing session
  "startTime": 1647823456789,         // Visit start timestamp (ms)
  "endTime": 1647823556789,           // Visit end timestamp (ms), may be null if ongoing
  "duration": 100.0,                  // Total time page was open (seconds)
  "fromPageId": 12344,                // Reference to the referrer page, if any
  "totalActiveTime": 98.5,            // Time actively engaged with the page (seconds)
  "isBackNavigation": false           // Whether this was a back navigation
}
```

### Sessions Collection

Each record in the sessions collection represents a browsing session.

```json
{
  "sessionId": "session_67890xyz",    // Unique identifier for the session
  "userId": "user123",                // Identifier for the user who created the session
  "startTime": 1647823456000,         // Session start timestamp (ms)
  "endTime": 1647833456000,           // Session end timestamp (ms), may be null if ongoing
  "totalActiveTime": 3540,            // Total active time across all pages (seconds)
  "totalDuration": 3600,              // Total session duration (seconds)
  "deviceInfo": {                     // Device information
    "browser": "Chrome",
    "browserVersion": "98.0.4758.102",
    "os": "Windows",
    "osVersion": "10"
  }
}
```

### Content Extraction Events (Real-time)

Content extraction data is sent directly to the backend in real-time when a page is visited, not through the cold storage sync process.

```json
{
  "contentId": "content_12345abc",    // Unique identifier for the content
  "sessionId": "session_67890xyz",    // Session when content was extracted
  "userId": "user123",                // Identifier for the user who visited the page
  "timestamp": 1647823456789,         // When the event occurred (ms)
  "data": {                           // Event-specific data
    "pageId": "12345",                // Reference to the page
    "visitId": "visit_67890xyz",      // Reference to the visit
    "userId": "user123",              // User ID (duplicated for data consistency)
    "url": "https://example.com/path",// URL of the page
    "content": {                      // Extracted content
      "title": "Example Page Title",  // Page title
      "markdown": "# Heading\n\nThis is the extracted content...",
      "metadata": {                   // Additional metadata
        "language": "en"              // Language of the content
      }
    }
  }
}
```

## Batch Request Example

A typical batch request to the cold storage API would look like:

```http
POST /api/cold-storage/visits HTTP/1.1
Content-Type: application/json
Cookie: [authentication cookies]

[
  {
    "visitId": "visit_12345abc",
    "userId": "user123",
    "pageId": 12345,
    "sessionId": "session_67890xyz",
    "startTime": 1647823456789,
    "endTime": 1647823556789,
    "duration": 100.0,
    "fromPageId": 12344,
    "totalActiveTime": 98.5,
    "isBackNavigation": false
  },
  {
    "visitId": "visit_12346def",
    "userId": "user123",
    "pageId": 12346,
    "sessionId": "session_67890xyz",
    "startTime": 1647823556800,
    "endTime": 1647823656800,
    "duration": 100.0,
    "fromPageId": 12345,
    "totalActiveTime": 86.2,
    "isBackNavigation": false
  },
  // ... up to 500 records per batch
]
```

## User ID Handling

Every record sent to the backend includes a `userId` field for proper attribution:

- All records automatically have a userId added before they're sent to the backend
- This ensures proper data ownership and makes user-specific queries possible
- If a user is not logged in, an anonymous ID is used as a fallback

## Content Extraction Process

Content extraction events are special in that they are:

1. **Processed in real-time** when a user visits a page
2. **Sent directly to the backend API immediately**
3. **NOT part of the cold storage sync process**

The content extractor:
- Converts page HTML to clean, readable markdown
- Extracts key metadata (title, language, etc.)
- Removes ads, navigation, and other non-content elements
- Preserves important semantic structure (headings, lists, etc.)

## Error Handling

If a sync fails for any reason:
- The system will retry during the next scheduled sync
- Failed records remain eligible for future syncs since the last sync timestamp is only updated after successful syncs
- The system logs details about failed sync attempts

## Privacy Considerations

- All payloads include authentication credentials to ensure data is associated with the correct user
- No personal data beyond browsing history is included in the sync
- Data is only synced when the user has enabled history sync in the DORY extension settings
- Browsing in incognito/private mode is never synced to cold storage

## Data Retention

The backend retains browsing history data according to the following policy:
- Standard retention: 90 days by default
- Users can configure longer retention periods in their account settings
- Users can manually trigger deletion of their data at any time

