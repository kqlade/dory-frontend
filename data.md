# Dory Data Structure & Ranking System Inputs

This document outlines the existing data collected by Dory and how it maps to the inputs required for the advanced statistical ranking system.

## Current Data Structure

Dory already collects rich browsing data in five primary tables:

### 1. Pages (`PageRecord`)

| Field | Type | Description |
|-------|------|-------------|
| `pageId` | string | Unique identifier for the page |
| `url` | string | Full URL of the page |
| `title` | string | Page title |
| `domain` | string | Extracted domain (e.g., "google.com") |
| `firstVisit` | number | Timestamp of first visit |
| `lastVisit` | number | Timestamp of most recent visit |
| `visitCount` | number | Total number of visits |
| `totalActiveTime` | number | Accumulated active time on page (seconds) |
| `personalScore` | number | User-specific relevance score (0-1) |

### 2. Visits (`VisitRecord`)

| Field | Type | Description |
|-------|------|-------------|
| `visitId` | string | Unique identifier for the visit |
| `pageId` | string | Reference to the visited page |
| `sessionId` | number | Reference to the browsing session |
| `startTime` | number | Visit start timestamp |
| `endTime` | number? | Visit end timestamp |
| `totalActiveTime` | number | Active time during this visit |
| `fromPageId` | string? | Page visited immediately before |
| `isBackNavigation` | boolean? | Whether this was a back navigation |

### 3. Edges (`EdgeRecord`)

| Field | Type | Description |
|-------|------|-------------|
| `edgeId` | number | Auto-incremented primary key |
| `fromPageId` | string | Source page ID |
| `toPageId` | string | Destination page ID |
| `sessionId` | number | Session context |
| `timestamp` | number | When this navigation occurred |
| `count` | number | Times this path was navigated |
| `firstTraversal` | number | First time this path was taken |
| `lastTraversal` | number | Most recent traversal time |
| `isBackNavigation` | boolean? | Whether this was a back navigation |

### 4. Sessions (`BrowsingSession`)

| Field | Type | Description |
|-------|------|-------------|
| `sessionId` | number | Auto-incremented identifier |
| `startTime` | number | Session start timestamp |
| `endTime` | number? | Session end timestamp |
| `lastActivityAt` | number | Last activity timestamp |
| `totalActiveTime` | number | Total active time in this session |
| `isActive` | boolean | Whether session is currently active |

### 5. Events (`DoryEvent`)

| Field | Type | Description |
|-------|------|-------------|
| `eventId` | number | Auto-incremented identifier |
| `operation` | string | Event type |
| `sessionId` | string | Associated session |
| `timestamp` | number | When the event occurred |
| `loggedAt` | number | When the event was logged |
| `data` | object | Event-specific data |

## Mapping to Ranking System Inputs

The advanced statistical ranking system can leverage this data as follows:

### 1. Text Matching Component: `P(q | p is target)`

**Required Inputs:**
- Query tokens
- Page title tokens
- URL tokens
- Global term statistics

**Existing Data Mapping:**
- `PageRecord.title` → Title tokens
- `PageRecord.url` → URL tokens
- Collection of all `PageRecord` entries → Global term statistics

**Implementation Notes:**
- Need to implement tokenization for queries, titles, and URLs
- Can pre-compute term frequency statistics across the corpus
- No additional data collection needed

### 2. Temporal Weighting Model

**Required Inputs:**
- Visit timestamps
- Visit durations
- Current time

**Existing Data Mapping:**
- `VisitRecord.startTime` → Visit timestamps
- `VisitRecord.totalActiveTime` → Visit durations
- `PageRecord.visitCount` → Frequency statistics
- `PageRecord.firstVisit` and `PageRecord.lastVisit` → Visit timespan

**Implementation Notes:**
- Multi-scale temporal model can be built directly from existing visit data
- Page visit frequency already tracked

### 3. Navigation Context Model

**Required Inputs:**
- Page transition probabilities
- Current/recent pages
- Common browsing patterns

**Existing Data Mapping:**
- `EdgeRecord` table → Complete navigation graph
- `EdgeRecord.count` → Transition frequencies
- `EdgeRecord.timestamp` → Temporal context for transitions
- `VisitRecord.fromPageId` → Previous page

**Implementation Notes:**
- First-order Markov model can be built from the edges table
- Can identify common navigation sequences from edge patterns
- Can analyze forward and backward navigation probabilities

### 4. Time-of-Day Pattern Model

**Required Inputs:**
- Historical visit times by hour/day
- Current time information

**Existing Data Mapping:**
- `VisitRecord.startTime` → Can extract hour of day, day of week
- `VisitRecord` collection → Can build temporal distributions
- `EdgeRecord.timestamp` → Can add temporal context to navigation patterns

**Implementation Notes:**
- Need to extract cyclical time features (hour, day of week)
- Can build hourly and daily visit distributions per page
- No additional data collection needed

### 5. Session Context Model

**Required Inputs:**
- Recent domains/pages
- Session characteristics
- Page clusters

**Existing Data Mapping:**
- `BrowsingSession` table → Session metadata
- `VisitRecord` filtered by `sessionId` → Pages in current session
- `PageRecord.domain` → Domain grouping

**Implementation Notes:**
- Can infer session "type" from pages visited
- Can cluster domains based on co-occurrence in sessions
- Session intensity available via activity measures

### 6. Parameter Adaptation System

**Required Inputs:**
- User interactions with search results
- Navigation after search

**Existing Data Mapping:**
- `EdgeRecord` entries after search → Result selection
- `PageRecord.personalScore` → Current personalization mechanism
- `VisitRecord` patterns → Implicit feedback

**Implementation Notes:**
- Need to track search result selections explicitly
- Can infer preferences from navigation patterns
- Use Thompson sampling to adjust ranking parameters

## Conclusion

The current data structure in Dory already contains all the essential information needed for implementing the advanced statistical ranking system. No additional data collection is required, though some derived features will need to be computed from the raw data.

The system can be implemented by focusing on how to effectively process and utilize this existing data rather than changing the data collection architecture. 