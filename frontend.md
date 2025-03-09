# Dory Frontend Integration Guidelines

This document outlines how the Dory frontend extension works and the data structures it sends to the backend.

## Overview

The Dory extension tracks user browsing activity and sends data to the backend in two main ways:
1. **Event Streaming**: Real-time events about browsing sessions, page visits, and content extraction
2. **Search Requests**: User-initiated searches for previously visited content

## Authentication

The extension uses Google OAuth2 for user authentication. All events are associated with the authenticated user.

### Authentication Flow

1. The extension uses Chrome's built-in Identity API for authentication
2. User info is fetched from Google's userinfo endpoint
3. User ID and email are attached to all events

### Event Association

All events include user information in their structure:
```json
{
  "operation": "EVENT_TYPE",
  "sessionId": "s123456789",
  "userId": "google-user-id",
  "userEmail": "user@example.com",
  "timestamp": 1682541234567,
  "data": {
    // Event-specific data
  }
}
```

### Authentication Setup

1. Configure OAuth in manifest.json:
```json
{
  "permissions": [
    "identity"
  ],
  "oauth2": {
    "client_id": "${GOOGLE_CLIENT_ID}",
    "scopes": [
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile"
    ]
  }
}
```

2. Required Google Cloud setup:
   - Create project in Google Cloud Console
   - Enable People API
   - Configure OAuth consent screen
   - Create OAuth 2.0 client ID for Chrome extension
   - Add extension ID to allowed origins

## Event Streaming

The frontend uses an event-based architecture to stream browsing data to the backend. Events are sent in real-time as the user browses.

### Common Event Structure

All events follow this common structure:

```json
{
  "operation": "EVENT_TYPE",
  "sessionId": "s123456789",
  "userId": "google-user-id",
  "userEmail": "user@example.com",
  "timestamp": 1682541234567,
  "data": {
    // Event-specific data
  }
}
```

For batch processing, multiple events may be sent together:

```json
{
  "events": [
    {
      "operation": "EVENT_TYPE",
      "sessionId": "s123456789",
      "userId": "google-user-id",
      "userEmail": "user@example.com",
      "timestamp": 1682541234567,
      "data": {}
    },
    // More events...
  ]
}
```

### Event Types

#### 1. SESSION_STARTED

Sent when a new browsing session begins.

```json
{
  "operation": "SESSION_STARTED",
  "sessionId": "s123456789",
  "userId": "google-user-id",
  "userEmail": "user@example.com",
  "timestamp": 1682541234567,
  "data": {
    "browser": {
      "name": "Chrome",
      "platform": "macOS"
    }
  }
}
```

#### 2. PAGE_VISIT_STARTED

Sent when the user navigates to a page.

```json
{
  "operation": "PAGE_VISIT_STARTED",
  "sessionId": "s123456789",
  "userId": "google-user-id",
  "userEmail": "user@example.com",
  "timestamp": 1682541239876,
  "data": {
    "pageId": "p987654321",
    "visitId": "v123456",
    "url": "https://example.com/article",
    "title": "Example Article",
    "fromPageId": "p123456789",
    "isBackNavigation": false
  }
}
```

- `fromPageId`: Optional. The ID of the page the user navigated from
- `isBackNavigation`: Whether this navigation used the browser's back/forward buttons

#### 3. CONTENT_EXTRACTED

Sent after content has been extracted from a page.

```json
{
  "operation": "CONTENT_EXTRACTED",
  "sessionId": "s123456789",
  "userId": "google-user-id",
  "userEmail": "user@example.com",
  "timestamp": 1682541242123,
  "data": {
    "pageId": "p987654321",
    "visitId": "v123456",
    "url": "https://example.com/article",
    "content": {
      "extracted": true,
      "title": "Example Article",
      "markdown": "# Example Article\n\nThis is the extracted content...",
      "metadata": {
        "language": "english"
      }
    }
  }
}
```

#### 4. PAGE_VISIT_ENDED

Sent when the user navigates away from a page or closes a tab.

```json
{
  "operation": "PAGE_VISIT_ENDED",
  "sessionId": "s123456789",
  "userId": "google-user-id",
  "userEmail": "user@example.com",
  "timestamp": 1682541255432,
  "data": {
    "pageId": "p987654321",
    "visitId": "v123456"
  }
}
```

#### 5. ACTIVE_TIME_UPDATED

Sent periodically to update the active time spent on a page.

```json
{
  "operation": "ACTIVE_TIME_UPDATED",
  "sessionId": "s123456789",
  "userId": "google-user-id",
  "userEmail": "user@example.com",
  "timestamp": 1682541285123,
  "data": {
    "pageId": "p987654321",
    "visitId": "v123456",
    "duration": 29.691,
    "isActive": true
  }
}
```

- `duration`: Time in seconds that the user was active on the page
- `isActive`: Whether the page is currently active or inactive

#### 6. SESSION_ENDED

Sent when a browsing session ends (browser closed or timeout due to inactivity).

```json
{
  "operation": "SESSION_ENDED",
  "sessionId": "s123456789",
  "userId": "google-user-id",
  "userEmail": "user@example.com",
  "timestamp": 1682544834567,
  "data": {
    "totalActiveTime": 1025.5,
    "duration": 3600000
  }
}
```

- `totalActiveTime`: Total active time in seconds across all pages in the session
- `duration`: Total session duration in milliseconds (from start to end)

## Search Functionality

The frontend allows users to search for previously visited content.

### Search Request

```json
{
  "query": "User's search query",
  "limit": 5,
  "filters": {
    "startDate": 1677776000000,
    "endDate": 1677862400000,
    "domains": ["example.com", "github.com"]
  }
}
```

Query parameters may include:
- `hybrid`: Whether to use hybrid search (boolean)
- `expand`: Whether to use LLM expansion (boolean)
- `rerank`: Whether to use reranking (boolean)

### Expected Search Response

```json
{
  "results": [
    {
      "docId": "05005417-816f-4d08-9a2e-c00e01d87750",
      "chunkText": "This is the snippet of content that matches the query",
      "isHighlighted": true,
      "score": 0.876,
      "explanation": "This result directly addresses the query by explaining...",
      "metadata": {
        "title": "Document Title",
        "url": "https://example.com/page",
        "visitedAt": 1677776000000
      }
    }
  ],
  "totalResults": 10,
  "metadata": {
    "total": 10,
    "query": {
      "original": "Original query"
    },
    "timing": {
      "total_ms": 2500
    }
  }
}
```

## Frontend Behavior Details

### Authentication

1. **User Authentication**:
   - Automatic Google sign-in on extension startup
   - User info (ID and email) attached to all events
   - Token refresh handled automatically by Chrome

2. **Error Handling**:
   - Failed auth attempts are logged
   - Events can still be sent without auth (userId and userEmail will be undefined)
   - Auth can be retried at any time

### Event Streaming

1. **Session Management**:
   - Sessions start when the extension loads
   - Sessions end after 15 minutes of inactivity or when the browser closes
   - Each session has a unique ID

2. **Page Visit Tracking**:
   - Each page visit gets a unique ID
   - Back/forward navigation is detected and flagged
   - New tab navigation is tracked with the source page

3. **Content Extraction**:
   - Content is extracted after navigation completes
   - Extraction waits for the DOM to be stable
   - Markdown is generated from the page content

4. **Activity Tracking**:
   - Active time is tracked when the page is visible
   - Updates are sent periodically
   - Time is accumulated per visit and per page

### Search Behavior

1. **Search Execution**:
   - Searches are executed as the user types
   - Results are displayed in real-time
   - The frontend highlights the highest-scoring result

2. **Refinement Searches**:
   - When a user adds details to a search, the frontend will concatenate previous queries with the new query
   - Example: Initial "React component" → Refinement "with button" → Sends "React component with button"

## Error Handling

1. **Network Errors**:
   - Retry up to 3 times with exponential backoff
   - Clear error messages in console
   - Graceful degradation when offline

2. **Expected Error Response Format**:

```json
{
  "error": {
    "message": "Descriptive error message",
    "code": "ERROR_CODE"
  }
}
```

## Performance Considerations

1. **Event Streaming**:
   - Events are sent immediately
   - Failed events are logged but not retried
   - Large content (markdown) may need compression

2. **Search Performance**:
   - Search responses should ideally return within 3 seconds
   - The frontend shows a loading indicator during search 