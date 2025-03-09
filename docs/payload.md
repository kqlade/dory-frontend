# DORY Backend Payload Documentation

This document describes the event payloads that the DORY extension sends to the backend. All events follow a common structure and are sent in real-time as the user browses.

## Common Payload Structure

All events share this common structure:

```json
{
  "operation": "EVENT_TYPE",
  "sessionId": "s123456789",
  "timestamp": 1682541234567,
  "data": {
    // Event-specific data
  }
}
```

- `operation`: The type of event (see event types below)
- `sessionId`: Unique identifier for the browsing session
- `timestamp`: Unix timestamp in milliseconds when the event occurred
- `data`: Event-specific data payload

## Event Types

### 1. SESSION_STARTED

Sent when a new browsing session begins.

```json
{
  "operation": "SESSION_STARTED",
  "sessionId": "123",
  "timestamp": 1682541234567,
  "data": {
    "browser": {
      "name": "Chrome",
      "platform": "macOS"
    }
  }
}
```

### 2. PAGE_VISIT_STARTED

Sent when the user navigates to a page.

```json
{
  "operation": "PAGE_VISIT_STARTED",
  "sessionId": "123",
  "timestamp": 1682541239876,
  "data": {
    "pageId": "456",
    "visitId": "v789",
    "url": "https://example.com/article",
    "title": "Example Article",
    "fromPageId": "123",
    "isBackNavigation": false
  }
}
```

- `fromPageId`: Optional. The ID of the page the user navigated from
- `isBackNavigation`: Whether this navigation used the browser's back/forward buttons

### 3. CONTENT_EXTRACTED

Sent after content has been extracted from a page.

```json
{
  "operation": "CONTENT_EXTRACTED",
  "sessionId": "123",
  "timestamp": 1682541242123,
  "data": {
    "pageId": "456",
    "visitId": "v789",
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

### 4. PAGE_VISIT_ENDED

Sent when the user navigates away from a page or closes a tab.

```json
{
  "operation": "PAGE_VISIT_ENDED",
  "sessionId": "123",
  "timestamp": 1682541255432,
  "data": {
    "pageId": "456",
    "visitId": "v789"
  }
}
```

### 5. ACTIVE_TIME_UPDATED

Sent periodically to update the active time spent on a page.

```json
{
  "operation": "ACTIVE_TIME_UPDATED",
  "sessionId": "123",
  "timestamp": 1682541285123,
  "data": {
    "pageId": "456",
    "visitId": "v789",
    "duration": 29.691,
    "isActive": true
  }
}
```

- `duration`: Time in seconds that the user was active on the page
- `isActive`: Whether the page is currently active or inactive

### 6. SESSION_ENDED

Sent when a browsing session ends (browser closed or timeout due to inactivity).

```json
{
  "operation": "SESSION_ENDED",
  "sessionId": "123",
  "timestamp": 1682544834567,
  "data": {
    "totalActiveTime": 1025.5,
    "duration": 3600000
  }
}
```

- `totalActiveTime`: Total active time in seconds across all pages in the session
- `duration`: Total session duration in milliseconds (from start to end)

## Handling in the Backend

The backend should:

1. Process events in the order they are received
2. Maintain the relationship between sessions, pages, and visits
3. Handle potential duplicate events (in case of retries)
4. Reconstruct the browsing graph from the navigation events
5. Associate extracted content with the correct page and visit

## Offline Support

If the extension is offline:

1. Events are stored in a local queue
2. When connectivity is restored, events are sent in the original order
3. The backend should be able to handle batches of events that arrive later

## Data Volume Considerations

- Content extraction events contain the full markdown of the page, which can be large
- Consider implementing compression or chunking for large payloads
- The backend should be able to handle high-frequency events during active browsing 