# Dory Event Structures

This document provides a comprehensive reference for all event types that the Dory extension sends to the backend.

## Common Event Structure

All events follow this common structure:

```json
{
  "operation": "EVENT_TYPE",
  "sessionId": "s123456789",
  "userId": "google-user-id",      // Optional, present when authenticated
  "userEmail": "user@example.com", // Optional, present when authenticated
  "timestamp": 1682541234567,      // Unix timestamp in milliseconds
  "data": {
    // Event-specific data structure (varies by event type)
  }
}
```

## Event Types

### 1. SESSION_STARTED

Sent when a new browsing session begins.

**Interface:**
```typescript
interface SessionStartedData {
  browser: {
    name: string;
    platform: string;
  };
}
```

**Example:**
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

**When it's sent:**
- When the extension is first loaded
- When a new session is started after the previous one expired due to inactivity

### 2. PAGE_VISIT_STARTED

Sent when the user navigates to a page.

**Interface:**
```typescript
interface PageVisitStartedData {
  pageId: string;
  visitId: string;
  url: string;
  title: string;
  fromPageId?: string;
  isBackNavigation?: boolean;
}
```

**Example:**
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

**When it's sent:**
- When a user navigates to a new URL
- When a user opens a new tab
- When a user uses the browser's back/forward buttons

**Field details:**
- `pageId`: Unique identifier for the page
- `visitId`: Unique identifier for this specific visit to the page
- `url`: The URL of the page
- `title`: The title of the page
- `fromPageId`: (Optional) The ID of the page the user navigated from
- `isBackNavigation`: (Optional) Whether this navigation used the browser's back/forward buttons

### 3. CONTENT_EXTRACTED

Sent after content has been extracted from a page.

**Interface:**
```typescript
interface ContentExtractedData {
  pageId: string;
  visitId: string;
  url?: string;  // Optional URL for the page
  content: {
    extracted: boolean;
    title: string;
    markdown: string;
    metadata: Record<string, any>;
  };
}
```

**Example:**
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

**When it's sent:**
- After a page has finished loading and the content has been extracted
- May be sent multiple times if extraction is retried

**Field details:**
- `pageId`: Unique identifier for the page
- `visitId`: Unique identifier for this specific visit to the page
- `url`: (Optional) The URL of the page
- `content.extracted`: Whether content extraction was successful
- `content.title`: The title of the page
- `content.markdown`: The extracted content in markdown format
- `content.metadata`: Additional metadata about the content (e.g., language)

### 4. PAGE_VISIT_ENDED

Sent when the user navigates away from a page or closes a tab.

**Interface:**
```typescript
interface PageVisitEndedData {
  pageId: string;
  visitId: string;
}
```

**Example:**
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

**When it's sent:**
- When a user navigates to a different URL
- When a user closes a tab
- When a user closes the browser

**Field details:**
- `pageId`: Unique identifier for the page
- `visitId`: Unique identifier for this specific visit to the page

### 5. ACTIVE_TIME_UPDATED

Sent when there's a change in the active status of a page.

**Interface:**
```typescript
interface ActiveTimeUpdatedData {
  pageId: string;
  visitId: string;
  duration: number;
  isActive: boolean;
}
```

**Example:**
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

**When it's sent:**
- When a page becomes active (visible)
- When a page becomes inactive (hidden)
- When a page is closed

**Field details:**
- `pageId`: Unique identifier for the page
- `visitId`: Unique identifier for this specific visit to the page
- `duration`: Time in seconds that the user was active on the page
- `isActive`: Whether the page is currently active or inactive

### 6. SESSION_ENDED

Sent when a browsing session ends.

**Interface:**
```typescript
interface SessionEndedData {
  totalActiveTime: number;
  duration: number;
}
```

**Example:**
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

**When it's sent:**
- When the browser is closed
- When the session times out due to inactivity (15 minutes of inactivity)

**Field details:**
- `totalActiveTime`: Total active time in seconds across all pages in the session
- `duration`: Total session duration in milliseconds (from start to end)

## Event Flow

The typical flow of events for a browsing session is:

1. `SESSION_STARTED` - When the extension loads
2. `PAGE_VISIT_STARTED` - When the user navigates to a page
3. `CONTENT_EXTRACTED` - After the page content is extracted
4. `ACTIVE_TIME_UPDATED` - When the page becomes active/inactive
5. `PAGE_VISIT_ENDED` - When the user navigates away or closes the tab
6. (Repeat steps 2-5 for each page visit)
7. `SESSION_ENDED` - When the browser is closed or session times out

## Implementation Details

### User Authentication

All events include user information when the user is authenticated:
- `userId`: The Google user ID
- `userEmail`: The user's email address

These fields are optional to handle cases where the user is not yet authenticated.

### Session and Visit IDs

- `sessionId`: A unique identifier for the browsing session
- `pageId`: A unique identifier for a page (based on URL)
- `visitId`: A unique identifier for a specific visit to a page

These IDs allow the backend to correlate events and build a complete picture of the user's browsing activity.

### Timestamps

All events include a `timestamp` field with the Unix timestamp in milliseconds when the event was generated.

### Duration Calculation

- For `ACTIVE_TIME_UPDATED` events, the `duration` field represents the time in seconds that the user was active on the page since the last update.
- For `SESSION_ENDED` events:
  - `totalActiveTime` is the sum of all active times across all pages in the session (in seconds)
  - `duration` is the total time from session start to end (in milliseconds) 