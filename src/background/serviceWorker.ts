/**
 * @file serviceWorker.ts
 * Using ES modules (strict mode by default).
 * 
 * This is the main background service worker for the DORY extension.
 * It handles:
 * - Session management
 * - Navigation tracking
 * - Content extraction coordination
 * - Message routing between content scripts and background
 * - Local event logging (for later cold storage sync)
 */

// Import message system for handling communication between content scripts and background
import { messageRouter, MessageType, Message, createMessage } from '../services/messageSystem';

// Import session management functions
import {
  startNewSession,
  endCurrentSession,
  getCurrentSessionId,
  checkSessionIdle,
  updateSessionActivityTime
} from '../services/dexieSessionManager';

// Import browsing data storage functions
import {
  createOrGetPage,
  updateActiveTimeForPage,
  startVisit,
  endVisit,
  updateVisitActiveTime,
  getDB
} from '../services/dexieBrowsingStore';

// Import the event service for initialization only
// Note: Content extraction events are sent directly from contentExtractor.ts
import { initEventService } from '../services/eventService';

// Import the event logger for local storage
import { logEvent } from '../services/dexieEventLogger';
import { EventType } from '../api/types';

// Import database initialization
import { initDexieSystem } from '../services/dexieInit';

// Import authentication
import { getUserInfo } from '../auth/googleAuth';

// Import navigation handlers
import {
  handleOnCommitted,
  handleOnCreatedNavigationTarget
} from '../services/navigationHandlers';

console.log('[DORY] INFO:', 'Service Worker: Starting up...');

// Session idle config
const SESSION_IDLE_THRESHOLD = 15 * 60 * 1000; // 15 minutes
let isSessionActive = false;
let idleCheckInterval: ReturnType<typeof setInterval> | null = null;

// Authentication status
let isAuthenticated = false;

// Tracking structures
const tabToCurrentUrl: Record<number, string | undefined> = {};
const tabToPageId: Record<number, number> = {};
const tabToVisitId: Record<number, string> = {};

/**
 * Main initialization of the service worker
 */
async function initialize(): Promise<void> {
  console.log('[DORY] INFO:', 'Initializing extension...');
  
  // Check authentication first - gate all functionality behind auth
  try {
    const userInfo = await getUserInfo();
    if (!userInfo || !userInfo.id) {
      console.log('[DORY] AUTH:', 'User not authenticated, extension functionality disabled');
      isAuthenticated = false;
      
      // Set extension icon click to trigger authentication
      chrome.action.onClicked.addListener(handleUnauthenticatedClick);
      
      // Update icon to indicate unauthenticated state
      chrome.action.setIcon({ 
        path: {
          16: '/icons/dory-gray-16.png',
          48: '/icons/dory-gray-48.png',
          128: '/icons/dory-gray-128.png'
        }
      });
      
      return; // Exit early - don't initialize other functionality
    }
    
    // User is authenticated
    isAuthenticated = true;
    console.log('[DORY] AUTH:', `User authenticated: ${userInfo.email}`);
    
    // Update icon to active state
    chrome.action.setIcon({ 
      path: {
        16: '/icons/dory-16.png',
        48: '/icons/dory-48.png',
        128: '/icons/dory-128.png'
      }
    });
  } catch (error) {
    console.error('[DORY] AUTH ERROR:', error);
    isAuthenticated = false;
    return; // Exit initialization on error
  }
  
  // Only proceed with initialization if authenticated
  
  // Initialize Dexie
  const dbInitialized = await initDexieSystem();
  if (!dbInitialized) {
    console.log('[DORY] INFO:', 'Database initialization failed or user not authenticated, aborting initialization');
    
    // Set icon click to trigger re-authentication
    chrome.action.onClicked.removeListener(handleExtensionIconClick);
    chrome.action.onClicked.addListener(handleUnauthenticatedClick);
    
    // Update icon to indicate disabled state
    chrome.action.setIcon({ 
      path: {
        16: '/icons/dory-gray-16.png',
        48: '/icons/dory-gray-48.png',
        128: '/icons/dory-gray-128.png'
      }
    });
    
    return;
  }
  
  console.log('[DORY] INFO:', 'Dexie database system initialized');
  
  // Setup message routing
  messageRouter.initialize();
  registerMessageHandlers();

  // Initialize event streaming
  await initEventService();
  console.log('[DORY] INFO:', 'Event streaming initialized (Dexie storage)');

  // Start a new session
  const sessionId = await startNewSession();
  isSessionActive = true;
  console.log('[DORY] INFO:', `Started initial session: ${sessionId}`);

  // Idle check
  idleCheckInterval = setInterval(checkSessionInactivity, 60 * 1000);

  // Extension icon click -> open a new tab
  chrome.action.onClicked.removeListener(handleUnauthenticatedClick); // Remove auth handler if exists
  chrome.action.onClicked.addListener(handleExtensionIconClick);
}

/** 
 * Handle extension icon click when not authenticated 
 * This will trigger the authentication flow
 */
async function handleUnauthenticatedClick(): Promise<void> {
  console.log('[DORY] AUTH:', 'User clicked extension while unauthenticated, triggering auth flow');
  try {
    const userInfo = await getUserInfo();
    if (userInfo && userInfo.id) {
      console.log('[DORY] AUTH:', 'Authentication successful, initializing extension');
      // Reinitialize the extension now that we're authenticated
      initialize();
    } else {
      console.log('[DORY] AUTH:', 'Authentication failed or was cancelled');
    }
  } catch (error) {
    console.error('[DORY] AUTH ERROR:', error);
  }
}

/** Clicks on the extension icon => open new tab */
function handleExtensionIconClick(): void {
  chrome.tabs.create({});
}

/** Check session idle */
async function checkSessionInactivity(): Promise<void> {
  const ended = await checkSessionIdle(SESSION_IDLE_THRESHOLD);
  if (ended) {
    isSessionActive = false;
    console.log('[DORY] INFO:', 'Session ended due to inactivity.');
  }
}

/** Ensure session is active */
async function ensureActiveSession(): Promise<void> {
  if (!isSessionActive) {
    const sessionId = await startNewSession();
    isSessionActive = true;
    console.log('[DORY] INFO:', `New session started (was idle): ${sessionId}`);
  }
}

/** Get tab title safely */
async function getTabTitle(tabId: number): Promise<string | null> {
  try {
    const tab = await chrome.tabs.get(tabId);
    return tab.title || null;
  } catch (error) {
    console.error('Error getting tab title', { error });
    return null;
  }
}

/** End visit for tab */
async function endCurrentVisit(tabId: number): Promise<void> {
  const visitId = tabToVisitId[tabId];
  if (visitId) {
    const now = Date.now();
    await endVisit(visitId, now).catch(err => {
      console.error('Failed to end visit', { err });
    });

    // Retrieve from Dexie
    const db = await getDB();
    const visit = await db.visits.get(visitId);

    const sessionId = await getCurrentSessionId();
    if (sessionId && visit) {
      const timeSpent = Math.round((now - visit.startTime) / 1000);
      
      // Log visit ended event locally - will be synced to backend via cold storage
      await logEvent({
        operation: EventType.PAGE_VISIT_ENDED,
        sessionId: sessionId.toString(),
        timestamp: Math.floor(now),
        data: {
          pageId: visit.pageId.toString(),
          visitId,
          url: tabToCurrentUrl[tabId] || '',
          timeSpent
        }
      });
    }
    delete tabToVisitId[tabId];
  }
}

/** Start a new visit for a tab (moved from onCommitted logic) */
async function startNewVisit(
  tabId: number,
  pageId: number,
  fromPageId?: number,
  isBackNav?: boolean
): Promise<string> {
  const sessionId = await getCurrentSessionId();
  if (!sessionId) {
    throw new Error('No active session');
  }

  const now = Date.now();
  const url = tabToCurrentUrl[tabId] || '';
  const title = await getTabTitle(tabId) || url;

  // Create visit record in Dexie
  const visitId = await startVisit(pageId, sessionId, fromPageId, isBackNav);
  tabToVisitId[tabId] = visitId;

  // Fire PAGE_VISIT_STARTED
  await logEvent({
    operation: EventType.PAGE_VISIT_STARTED,
    sessionId: sessionId.toString(),
    timestamp: Math.floor(now),
    data: {
      pageId: pageId.toString(),
      visitId,
      url,
      title,
      fromPageId: fromPageId?.toString(),
      isBackNavigation: isBackNav
    }
  });

  return visitId;
}

/** Register message handlers for router */
function registerMessageHandlers(): void {
  // 1) Activity events
  messageRouter.registerHandler(MessageType.ACTIVITY_EVENT, async (message: Message, sender) => {
    const { isActive, pageUrl, duration } = message.data;
    console.log('[DORY] INFO:', 'ACTIVITY_EVENT', { isActive, pageUrl, duration });

    if (isActive) {
      await ensureActiveSession();
    }

    if (pageUrl && duration > 0) {
      await updateActiveTimeForPage(pageUrl, duration);
      await updateSessionActivityTime();

      const tabId = sender.tab?.id;
      if (tabId && tabToVisitId[tabId]) {
        const visitId = tabToVisitId[tabId];
        await updateVisitActiveTime(visitId, duration);

        // Get the pageId from our tracking
        const pageId = tabToPageId[tabId];
        
        const sessionId = await getCurrentSessionId();
        if (sessionId) {
          // Log active time update locally - will be synced to backend via cold storage
          await logEvent({
            operation: EventType.ACTIVE_TIME_UPDATED,
            sessionId: sessionId.toString(),
            timestamp: Math.floor(Date.now()),
            data: {
              pageId: pageId.toString(),
              visitId,
              duration,
              isActive
            }
          });
        }
      }
    }
    return true;
  });

  // 2) Extraction Complete
  messageRouter.registerHandler(MessageType.EXTRACTION_COMPLETE, async (message: Message, sender) => {
    const { title, url, timestamp } = message.data;
    console.log('[DORY] INFO:', 'EXTRACTION_COMPLETE', { title, url });

    await ensureActiveSession();
    const pageId = await createOrGetPage(url, title, timestamp);
    const sessionId = await getCurrentSessionId();
    if (sessionId) {
      console.log('[DORY] INFO:', 'Page created/exists', { pageId, sessionId });
      
      const tabId = sender.tab?.id;
      if (tabId && tabToVisitId[tabId]) {
        chrome.tabs.sendMessage(
          tabId,
          createMessage(
            MessageType.SET_EXTRACTION_CONTEXT,
            { pageId: pageId.toString(), visitId: tabToVisitId[tabId] },
            'background'
          )
        );
      }
    }

    // Extra logging or data handling
    console.log('[DORY] INFO:', `✅ EXTRACTION SUCCESSFUL for "${title}" (${url})`);
    return true;
  });

  // 3) Extraction Error
  messageRouter.registerHandler(MessageType.EXTRACTION_ERROR, async (message: Message) => {
    const error = message.data;
    console.error('[DORY] ERROR:', '❌ EXTRACTION FAILED', { error });
    return true;
  });

  // Default
  messageRouter.setDefaultHandler((msg, sender, resp) => {
    console.warn('Unhandled message type', { msg });
    resp({ error: 'Unhandled message type' });
  });
}

// Initialize the service worker
initialize();

/** Attach the separated navigation handlers */
chrome.webNavigation.onCommitted.addListener((details) => 
  handleOnCommitted(details, {
    tabToCurrentUrl,
    tabToPageId,
    tabToVisitId,
    startNewVisit,
    ensureActiveSession,
    getTabTitle
  })
);

chrome.webNavigation.onCreatedNavigationTarget.addListener((details) => 
  handleOnCreatedNavigationTarget(details as any, {
    tabToCurrentUrl,
    tabToPageId,
    tabToVisitId,
    startNewVisit,
    ensureActiveSession,
    getTabTitle
  })
);

/** Handle tab removal */
chrome.tabs.onRemoved.addListener(async (tabId) => {
  await endCurrentVisit(tabId);
  delete tabToCurrentUrl[tabId];
  delete tabToPageId[tabId];
});

/** Store initial URL on tab creation */
chrome.tabs.onCreated.addListener((tab) => {
  if (tab.id && tab.url) {
    tabToCurrentUrl[tab.id] = tab.url;
  }
});

// On activate
self.addEventListener('activate', () => {
  console.log('[DORY] INFO:', 'Service worker activated');
});

// On suspend
chrome.runtime.onSuspend.addListener(async () => {
  console.log('[DORY] INFO:', 'Service worker suspending => end session');
  await endCurrentSession();
  if (idleCheckInterval) clearInterval(idleCheckInterval);
});

// Handle auth state changes via chrome identity API
chrome.identity.onSignInChanged.addListener((account, signedIn) => {
  console.log('[DORY] AUTH:', `Sign-in state changed: ${signedIn ? 'signed in' : 'signed out'} for account:`, account);
  
  if (signedIn && !isAuthenticated) {
    // User just signed in, initialize the extension
    initialize();
  } else if (!signedIn && isAuthenticated) {
    // User signed out, disable functionality
    isAuthenticated = false;
    
    // Clean up
    if (idleCheckInterval) {
      clearInterval(idleCheckInterval);
      idleCheckInterval = null;
    }
    
    if (isSessionActive) {
      endCurrentSession();
      isSessionActive = false;
    }
    
    // Update icon to indicate unauthenticated state
    chrome.action.setIcon({ 
      path: {
        16: '/icons/dory-gray-16.png',
        48: '/icons/dory-gray-48.png',
        128: '/icons/dory-gray-128.png'
      }
    });
    
    // Set up click listener for re-authentication
    chrome.action.onClicked.removeListener(handleExtensionIconClick);
    chrome.action.onClicked.addListener(handleUnauthenticatedClick);
  }
});

// Bootstrap the extension
initialize();