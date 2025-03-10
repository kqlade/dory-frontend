# Implementation Plan: Integrating Dexie.js with Dory Extension

This document outlines the specific implementation steps to replace the API-based event logging with local Dexie.js database storage while preserving all existing functionality.

## Phase 1: Database Setup and Schema Definition

### Step 1: Define Dexie.js Database Schema
- Create a Dexie database class that mirrors the existing schema
- Define object stores for pages, edges, sessions, and visits
- Ensure compatibility with existing data models

```typescript
// src/services/dexieDB.ts
import Dexie from 'dexie';
import { PageRecord, EdgeRecord, VisitRecord, BrowsingSession } from './types';

export class DoryDatabase extends Dexie {
  pages!: Dexie.Table<PageRecord, number>;
  edges!: Dexie.Table<EdgeRecord, number>;
  sessions!: Dexie.Table<BrowsingSession, number>;
  visits!: Dexie.Table<VisitRecord, string>;

  constructor(userId: string) {
    super(`doryLocalDB_${userId}`);
    
    this.version(1).stores({
      pages: 'pageId, url, title, totalActiveTime, firstVisit, lastVisit, visitCount',
      edges: 'edgeId, fromPageId, toPageId, sessionId, timestamp, count, firstTraversal, lastTraversal, *isBackNavigation',
      sessions: 'sessionId, startTime, endTime, lastActivityAt, totalActiveTime, isActive',
      visits: 'visitId, pageId, sessionId, fromPageId, startTime, endTime, totalActiveTime, *isBackNavigation'
    });
  }
}
```

### Step 2: Create Database Management Functions
- Implement user-specific database instance management
- Create functions to get database instances
- Handle database initialization and connection

```typescript
// User-specific database instances
const dbInstances: Record<string, DoryDatabase> = {};
let currentUserId: string | null = null;

// Get or create a database instance for the current user
export function getDB(): DoryDatabase {
  if (!currentUserId) {
    throw new Error("No authenticated user");
  }
  
  if (!dbInstances[currentUserId]) {
    dbInstances[currentUserId] = new DoryDatabase(currentUserId);
  }
  
  return dbInstances[currentUserId];
}
```

### Step 3: Set Up Type Definitions
- Ensure all types and interfaces match the existing ones
- Export these types for use throughout the application

```typescript
// src/services/types.ts
export interface PageRecord {
  pageId?: number;
  url: string;
  title: string;
  totalActiveTime: number;
  firstVisit: number;
  lastVisit: number;
  visitCount: number;
}

// Additional interfaces...
```

## Phase 2: Implement Storage Layer

### Step 1: Create Dexie Version of BrowsingStore
- Implement all functions from the existing browsingStore.ts
- Keep the same function signatures and return types
- Use Dexie.js internally for all operations

```typescript
// src/services/dexieBrowsingStore.ts
import { getDB } from './dexieDB';
import { PageRecord, EdgeRecord, VisitRecord } from './types';

// Create or get a page by URL
export async function createOrGetPage(url: string, title: string, timestamp: number): Promise<number> {
  const db = getDB();
  
  // Try to find an existing page with this URL
  const existingPage = await db.pages.where('url').equals(url).first();
  
  if (existingPage) {
    // Update the existing page
    await db.pages.update(existingPage.pageId!, {
      lastVisit: timestamp,
      visitCount: (existingPage.visitCount || 0) + 1
    });
    return existingPage.pageId!;
  } else {
    // Create a new page
    const newPage: PageRecord = {
      url,
      title: title || url,
      totalActiveTime: 0,
      firstVisit: timestamp,
      lastVisit: timestamp,
      visitCount: 1
    };
    return await db.pages.add(newPage);
  }
}

// Additional functions from existing browsingStore.ts...
```

### Step 2: Create Dexie Version of SessionManager
- Implement all functions from the existing sessionManager.ts
- Keep the same function signatures and return types
- Use Dexie.js internally for all operations

```typescript
// src/services/dexieSessionManager.ts
import { getDB } from './dexieDB';
import { BrowsingSession } from './types';
import { createMessage, MessageType } from './messageSystem';

let currentSessionId: number | null = null;

/** Start a new session */
export async function startNewSession(): Promise<number> {
  const db = getDB();
  
  const now = Date.now();
  const session: BrowsingSession = {
    startTime: now,
    lastActivityAt: now,
    totalActiveTime: 0,
    isActive: true
  };
  
  const id = await db.sessions.add(session);
  currentSessionId = id;
  
  // Send session started event - now stored in DB instead of API
  // Could implement event logging to DB here
  
  return currentSessionId;
}

// Additional functions from existing sessionManager.ts...
```

### Step 3: Implement Event Logging to Dexie
- Create functions to log events to the database instead of the API
- Keep the same event structure and data
- Store events in a new `events` table

```typescript
// src/services/dexieEventLogger.ts
import { getDB } from './dexieDB';
import { DoryEvent } from '../api/types';

export async function logEvent(event: DoryEvent): Promise<void> {
  const db = getDB();
  
  // Store the event in the database
  await db.events.add({
    ...event,
    loggedAt: Date.now()
  });
}
```

## Phase 3: Integration and Testing

### Step 1: Update Import Paths
- Modify the service worker to import from the Dexie versions
- Update any other imports throughout the codebase

```typescript
// src/background/serviceWorker.ts
// Replace these imports:
import {
  createOrGetPage,
  createNavigationEdge,
  // ...other imports
} from '../services/browsingStore';

// With these:
import {
  createOrGetPage,
  createNavigationEdge,
  // ...other imports
} from '../services/dexieBrowsingStore';
```

### Step 2: Redirect Event Streaming
- Modify the eventStreamer to store events in Dexie instead of sending to API
- Keep the same event structure and creation process

```typescript
// src/services/eventStreamer.ts
// Replace API sending with database logging
import { logEvent } from './dexieEventLogger';

export async function sendDoryEvent(event: DoryEvent): Promise<void> {
  // Add user info if available (keep existing logic)
  
  // Instead of sending to API, log to database
  await logEvent(event);
}
```

### Step 3: Auth Integration
- Update the database initialization to work with the authentication system
- Ensure database is created with the correct user ID
- Add functions to handle user login/logout

```typescript
// src/services/dexieDB.ts
import { getUserInfo } from '../auth/googleAuth';

export async function initializeDexieDB(): Promise<void> {
  const userInfo = await getUserInfo();
  if (userInfo && userInfo.id) {
    currentUserId = userInfo.id;
    // Initialize database for this user
    getDB(); // This will create the DB if needed
  }
}

export function handleUserLogout(): void {
  if (currentUserId && dbInstances[currentUserId]) {
    dbInstances[currentUserId].close();
    delete dbInstances[currentUserId];
  }
  currentUserId = null;
}
```

### Step 4: Test Database Operations
- Create unit tests for each database operation
- Verify data is stored correctly
- Compare with existing functionality

## Phase 4: Rollout and Verification

### Step 1: Create Database Inspection Tools
- Add functions to query and display stored data
- Create a simple UI for debugging database contents

### Step 2: Event Verification
- Implement logging to verify all events are correctly stored
- Create comparison tools to ensure data integrity

### Step 3: Performance Testing
- Test performance under load
- Verify indexing is sufficient for common queries

## Fallback Strategy

In case of issues:
1. Keep both implementations available
2. Add toggle to switch between API and local database
3. Log errors and failures for analysis

## Future Enhancements

1. **Sync Functionality**: Enable syncing database to server when online
2. **Data Export**: Tools to export browsing history
3. **Storage Management**: Automatic cleanup of old data
4. **Search Optimization**: Enhanced querying of browsing history