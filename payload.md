# Cold Storage Sync Payload Documentation

This document describes the data payloads that are sent from the DORY browser extension to the backend cold storage service on a daily basis.

## Overview

The DORY extension syncs browsing history data to a persistent cold storage backend once per day. This data comprises three main collections:

1. **Pages** - Information about web pages visited
2. **Visits** - Individual page visit events and session information
3. **Sessions** - Browsing session metadata

Each sync operation sends only data that has been created or modified since the last successful sync, making the process efficient and minimizing data transfer.

## Sync Schedule and Process

- **Frequency**: Once every 24 hours
- **Batching**: Data is sent in batches of up to 500 records at a time
- **Incremental**: Only records modified since the last sync are transmitted
- **Operation**: Runs in the background during browser idle time when possible

## API Endpoints

The payloads are sent to the following endpoints:

- `/api/cold-storage/pages`
- `/api/cold-storage/visits`
- `/api/cold-storage/sessions`

## Payload Structures

### Pages Collection

Each record in the pages collection represents a web page that the user has visited.

```json
{
  "pageId": 12345,                    // Unique identifier for the page
  "title": "Example Website Title",   // Page title
  "url": "https://example.com/path",  // Full URL
  "firstVisit": 1647823456789,        // First visit timestamp (ms)
  "lastVisit": 1648023456789,         // Most recent visit timestamp (ms)
  "visitCount": 5,                    // Number of times visited
  "totalActiveTime": 450,             // Total time spent active on page (seconds)
  "lastModified": 1648023456789       // Last modified timestamp (ms)
}
```

### Visits Collection

Each record in the visits collection represents a single visit to a web page.

```json
{
  "visitId": "visit_12345abc",        // Unique identifier for the visit
  "pageId": 12345,                    // Reference to the page
  "sessionId": "session_67890xyz",    // Reference to the browsing session
  "startTime": 1647823456789,         // Visit start timestamp (ms)
  "endTime": 1647823556789,           // Visit end timestamp (ms), may be null if ongoing
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
  "startTime": 1647823456000,         // Session start timestamp (ms)
  "endTime": 1647833456000,           // Session end timestamp (ms), may be null if ongoing
  "deviceInfo": {                     // Device information
    "browser": "Chrome",
    "browserVersion": "98.0.4758.102",
    "os": "Windows",
    "osVersion": "10"
  }
}
```

## Batch Request Example

A typical batch request to the API would look like:

```http
POST /api/cold-storage/visits HTTP/1.1
Content-Type: application/json
Cookie: [authentication cookies]

[
  {
    "visitId": "visit_12345abc",
    "pageId": 12345,
    "sessionId": "session_67890xyz",
    "startTime": 1647823456789,
    "endTime": 1647823556789,
    "fromPageId": 12344,
    "totalActiveTime": 98.5,
    "isBackNavigation": false
  },
  {
    "visitId": "visit_12346def",
    "pageId": 12346,
    "sessionId": "session_67890xyz",
    "startTime": 1647823556800,
    "endTime": 1647823656800,
    "fromPageId": 12345,
    "totalActiveTime": 86.2,
    "isBackNavigation": false
  },
  // ... up to 500 records per batch
]
```

## Error Handling

If a sync fails for any reason:
- The system will retry during the next scheduled sync
- Failed records remain eligible for future syncs since the last sync timestamp is only updated after successful syncs
- The system logs details about failed sync attempts

