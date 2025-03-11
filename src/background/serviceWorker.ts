// src/background/serviceWorker.ts

/**
 * @file serviceWorker.ts
 * Using ES modules (strict mode by default).
 *
 * This is the main background service worker for the DORY extension.
 * It handles:
 *  - Session management
 *  - Navigation tracking
 *  - Content extraction coordination
 *  - Message routing between content scripts and background
 *  - Local event logging (for later cold storage sync)
 */

import { messageRouter, MessageType, Message, createMessage } from '../background/messageSystem';
import {
  startNewSession,
  endCurrentSession,
  getCurrentSessionId,
  checkSessionIdle,
  updateSessionActivityTime
} from '../utils/dexieSessionManager';
import {
  createOrGetPage,
  updateActiveTimeForPage,
  startVisit,
  endVisit,
  updateVisitActiveTime,
  getDB
} from '../utils/dexieBrowsingStore';
import { initEventService } from '../services/eventService';
import { logEvent } from '../utils/dexieEventLogger';
import { EventType } from '../api/types';
import { initDexieSystem } from '../utils/dexieInit';
import { getUserInfo } from '../auth/googleAuth';
import {
  handleOnCommitted,
  handleOnCreatedNavigationTarget
} from '../services/navigationHandlers';

console.log('[DORY] INFO: Service Worker: Starting up...');

// Session idle config
const SESSION_IDLE_THRESHOLD = 15 * 60 * 1000; // 15 minutes

// State
let isSessionActive = false;
let idleCheckInterval: ReturnType<typeof setInterval> | null = null;
let isAuthenticated = false;

// Tracking structures (ephemeral in memory)
const tabToCurrentUrl: Record<number, string | undefined> = {};
const tabToPageId: Record<number, string> = {};
const tabToVisitId: Record<number, string> = {};

/**
 * Main initialization of the service worker.
 */
async function initialize(): Promise<void> {
  console.log('[DORY] INFO: Initializing extension...');

  // 1) Check authentication first - gate all functionality behind auth
  try {
    const userInfo = await getUserInfo();
    if (!userInfo || !userInfo.id) {
      console.log('[DORY] AUTH: User not authenticated, extension functionality disabled');
      isAuthenticated = false;

      // Set extension icon click to trigger authentication
      chrome.action.onClicked.addListener(handleUnauthenticatedClick);

      // Gray out the icon
      chrome.action.setIcon({
        path: {
          16: '/icons/dory_logo_gray_16x16.png',
          48: '/icons/dory_logo_gray_48x48.png',
          128: '/icons/dory_logo_gray_128x128.png'
        }
      });
      return; // Exit early - don't initialize other functionality
    }

    // Otherwise, user is authenticated
    isAuthenticated = true;
    console.log('[DORY] AUTH: User authenticated:', userInfo.email);

    // Set active icon
    chrome.action.setIcon({
      path: {
        16: '/icons/dory_logo_16x16.png',
        48: '/icons/dory_logo_48x48.png',
        128: '/icons/dory_logo_128x128.png'
      }
    });
  } catch (error) {
    console.error('[DORY] AUTH ERROR:', error);
    isAuthenticated = false;
    return; // Exit initialization on error
  }

  // 2) Initialize Dexie
  const dbInitialized = await initDexieSystem();
  if (!dbInitialized) {
    console.log('[DORY] INFO: Database initialization failed, aborting');
    chrome.action.onClicked.removeListener(handleExtensionIconClick);
    chrome.action.onClicked.addListener(handleUnauthenticatedClick);

    chrome.action.setIcon({
      path: {
        16: '/icons/dory_logo_gray_16x16.png',
        48: '/icons/dory_logo_gray_48x48.png',
        128: '/icons/dory_logo_gray_128x128.png'
      }
    });
    return;
  }

  console.log('[DORY] INFO: Dexie DB system initialized');

  // 3) Setup message routing
  messageRouter.initialize();
  registerMessageHandlers();

  // 4) Start a new session
  const sessionId = await startNewSession();
  isSessionActive = true;
  console.log('[DORY] INFO: Started initial session:', sessionId);

  // 5) Initialize event streaming
  await initEventService();
  console.log('[DORY] INFO: Event streaming initialized');

  // 6) Idle check
  idleCheckInterval = setInterval(checkSessionInactivity, 60 * 1000);

  // 7) Extension icon click -> open new tab (remove unauth click if it was set)
  chrome.action.onClicked.removeListener(handleUnauthenticatedClick);
  chrome.action.onClicked.addListener(handleExtensionIconClick);
}

/**
 * Handle extension icon click when not authenticated
 * This triggers the authentication flow.
 */
async function handleUnauthenticatedClick(): Promise<void> {
  console.log('[DORY] AUTH: Extension icon clicked while unauthenticated, triggering auth flow');
  try {
    const userInfo = await getUserInfo();
    if (userInfo && userInfo.id) {
      console.log('[DORY] AUTH: Auth successful, re-initializing');
      await initialize(); // re-init now that user is authenticated
    } else {
      console.log('[DORY] AUTH: Authentication failed or was cancelled');
    }
  } catch (error) {
    console.error('[DORY] AUTH ERROR:', error);
  }
}

/**
 * Handle extension icon click => open a new tab
 */
function handleExtensionIconClick(): void {
  chrome.tabs.create({});
}

/**
 * Periodically check if the session is idle.
 */
async function checkSessionInactivity(): Promise<void> {
  const ended = await checkSessionIdle(SESSION_IDLE_THRESHOLD);
  if (ended) {
    isSessionActive = false;
    console.log('[DORY] INFO: Session ended due to inactivity.');
  }
}

/**
 * Ensure session is active; if not, start a new one.
 */
async function ensureActiveSession(): Promise<void> {
  if (!isSessionActive) {
    const sessionId = await startNewSession();
    isSessionActive = true;
    console.log('[DORY] INFO: New session started (was idle):', sessionId);
  }
}

/**
 * Safely retrieve tab title.
 */
async function getTabTitle(tabId: number): Promise<string | null> {
  try {
    const tab = await chrome.tabs.get(tabId);
    return tab.title || null;
  } catch (error) {
    console.error('[DORY] ERROR: getTabTitle failed:', error);
    return null;
  }
}

/**
 * End visit for a particular tab.
 */
async function endCurrentVisit(tabId: number): Promise<void> {
  const visitId = tabToVisitId[tabId];
  if (!visitId) return;

  const now = Date.now();
  try {
    await endVisit(visitId, now);
  } catch (err) {
    console.error('[DORY] ERROR: Failed to end visit', err);
  }

  // Retrieve the visit from Dexie
  const db = await getDB();
  const visit = await db.visits.get(visitId);

  const sessionId = await getCurrentSessionId();
  if (sessionId && visit) {
    const timeSpent = Math.round((now - visit.startTime) / 1000);
    const userInfo = await getUserInfo(); // might be null if user is signed out
    await logEvent({
      operation: EventType.PAGE_VISIT_ENDED,
      sessionId: sessionId.toString(),
      timestamp: Math.floor(now),
      userId: userInfo?.id,
      userEmail: userInfo?.email,
      data: {
        pageId: visit.pageId.toString(),
        visitId,
        url: tabToCurrentUrl[tabId] || '',
        timeSpent
      }
    });
  }

  // Clean up
  delete tabToVisitId[tabId];
}

/**
 * Start a new visit for the given tab/page.
 */
async function startNewVisit(
  tabId: number,
  pageId: string,
  fromPageId?: string,
  isBackNav?: boolean
): Promise<string> {
  const sessionId = await getCurrentSessionId();
  if (!sessionId) {
    throw new Error('No active session to associate this visit with.');
  }

  const now = Date.now();
  const url = tabToCurrentUrl[tabId] || '';
  const title = (await getTabTitle(tabId)) || url;

  // Create a new visit in Dexie
  const visitId = await startVisit(pageId, sessionId, fromPageId, isBackNav);
  tabToVisitId[tabId] = visitId;
  tabToPageId[tabId] = pageId;

  const userInfo = await getUserInfo();
  await logEvent({
    operation: EventType.PAGE_VISIT_STARTED,
    sessionId: sessionId.toString(),
    timestamp: Math.floor(now),
    userId: userInfo?.id,
    userEmail: userInfo?.email,
    data: {
      pageId,
      visitId,
      url,
      title,
      fromPageId,
      isBackNavigation: isBackNav
    }
  });

  return visitId;
}

/**
 * Register all message handlers for the messageRouter.
 */
function registerMessageHandlers(): void {
  // 1) ACTIVITY_EVENT
  messageRouter.registerHandler(MessageType.ACTIVITY_EVENT, async (message: Message, sender) => {
    const { isActive, pageUrl, duration } = message.data;
    console.log('[DORY] INFO: ACTIVITY_EVENT', { isActive, pageUrl, duration });

    if (isActive) {
      await ensureActiveSession();
    }

    if (pageUrl && duration > 0) {
      // Update page-level active time
      await updateActiveTimeForPage(pageUrl, duration);
      // Update session-level last activity time
      await updateSessionActivityTime();

      const tabId = sender.tab?.id;
      if (tabId !== undefined && tabToVisitId[tabId]) {
        const visitId = tabToVisitId[tabId];
        await updateVisitActiveTime(visitId, duration);

        const pageId = tabToPageId[tabId];
        const sessionId = await getCurrentSessionId();
        if (sessionId) {
          await logEvent({
            operation: EventType.ACTIVE_TIME_UPDATED,
            sessionId: sessionId.toString(),
            timestamp: Math.floor(Date.now()),
            data: {
              pageId,
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

  // 2) EXTRACTION_COMPLETE
  messageRouter.registerHandler(MessageType.EXTRACTION_COMPLETE, async (message: Message, sender) => {
    const { title, url, timestamp } = message.data;
    console.log('[DORY] INFO: EXTRACTION_COMPLETE', { title, url });

    await ensureActiveSession();
    const pageId = await createOrGetPage(url, title, timestamp);
    const sessionId = await getCurrentSessionId();

    if (sessionId) {
      console.log('[DORY] INFO: Page created/exists', { pageId, sessionId });

      const tabId = sender.tab?.id;
      if (tabId !== undefined && tabToVisitId[tabId]) {
        // Let the content script know about the final context
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
    console.log('[DORY] INFO: ✅ EXTRACTION SUCCESSFUL for', title, url);
    return true;
  });

  // 3) EXTRACTION_ERROR
  messageRouter.registerHandler(MessageType.EXTRACTION_ERROR, async (message: Message) => {
    const error = message.data;
    console.error('[DORY] ERROR: ❌ EXTRACTION FAILED', error);
    return true;
  });

  // DEFAULT handler
  messageRouter.setDefaultHandler((msg, sender, resp) => {
    console.warn('[DORY] WARN: Unhandled message type', msg);
    resp({ error: 'Unhandled message type' });
  });
}

// Initialize service worker
initialize();

/**
 * Attach the separated navigation handlers (onCommitted, etc.).
 */
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

/**
 * onRemoved => end the visit for that tab, clean up tracking
 */
chrome.tabs.onRemoved.addListener(async (tabId) => {
  await endCurrentVisit(tabId);
  delete tabToCurrentUrl[tabId];
  delete tabToPageId[tabId];
});

/**
 * Store initial URL on tab creation
 */
chrome.tabs.onCreated.addListener((tab) => {
  if (tab.id !== undefined && tab.url) {
    tabToCurrentUrl[tab.id] = tab.url;
  }
});

/**
 * On service worker activate
 */
self.addEventListener('activate', () => {
  console.log('[DORY] INFO: Service worker activated');
});

/**
 * On service worker suspend
 */
chrome.runtime.onSuspend.addListener(async () => {
  console.log('[DORY] INFO: Service worker suspending => end session');
  await endCurrentSession();
  if (idleCheckInterval) {
    clearInterval(idleCheckInterval);
  }
});

/**
 * Handle auth state changes via chrome.identity API
 */
chrome.identity.onSignInChanged.addListener((account, signedIn) => {
  console.log('[DORY] AUTH: Sign-in state changed:', signedIn, 'for account:', account);

  if (signedIn && !isAuthenticated) {
    // User just signed in => re-initialize
    initialize();
  } else if (!signedIn && isAuthenticated) {
    // User signed out => disable
    isAuthenticated = false;

    if (idleCheckInterval) {
      clearInterval(idleCheckInterval);
      idleCheckInterval = null;
    }
    if (isSessionActive) {
      endCurrentSession();
      isSessionActive = false;
    }

    // Gray out icon
    chrome.action.setIcon({
      path: {
        16: '/icons/dory_logo_gray_16x16.png',
        48: '/icons/dory_logo_gray_48x48.png',
        128: '/icons/dory_logo_gray_128x128.png'
      }
    });

    // Re-assign icon click to handle auth
    chrome.action.onClicked.removeListener(handleExtensionIconClick);
    chrome.action.onClicked.addListener(handleUnauthenticatedClick);
  }
});

/**
 * 
 *  ADDED CODE: On main-frame load completion => send TRIGGER_EXTRACTION
 *  so your content script calls `extract()`.
 * 
 *  Make sure "webNavigation" is in your manifest permissions:
 *  "permissions": ["webNavigation", ...]
 */

chrome.webNavigation.onCompleted.addListener((details) => {
  // Only trigger extraction for the main frame
  if (details.frameId === 0) {
    console.log('[DORY] INFO: Page finished loading => sending TRIGGER_EXTRACTION');
    chrome.tabs.sendMessage(details.tabId, {
      type: MessageType.TRIGGER_EXTRACTION
    });
  }
}, {
  url: [
    // Optional: limit to certain domains, e.g. https only
    { schemes: ['http', 'https'] }
  ]
});