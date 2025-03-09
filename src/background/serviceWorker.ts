// src/background/serviceWorker.ts

import { messageRouter, MessageType, Message, createMessage } from '../services/messageSystem';
import {
  startNewSession,
  endCurrentSession,
  getCurrentSessionId,
  checkSessionIdle,
  updateSessionActivityTime,
} from '../services/sessionManager';
import {
  createOrGetPage,
  createNavigationEdge,
  updateActiveTimeForPage,
  createOrUpdateEdge,
  startVisit,
  endVisit,
  updateVisitActiveTime,
  VisitRecord
} from '../services/browsingStore';
import { sendDoryEvent, EventTypes } from '../services/eventStreamer';
import { testAuth } from '../services/auth';

console.log('[DORY] Service Worker: Starting up...');

// Test auth on startup
testAuth().catch(console.error);

// Session idle config
const SESSION_IDLE_THRESHOLD = 15 * 60 * 1000; // 15 minutes
let isSessionActive = false;
let idleCheckInterval: ReturnType<typeof setInterval> | null = null;

// A small cache that tracks each tab's "current page URL," so we know from->to
// for same-tab navigations.
const tabToCurrentUrl: Record<number, string | undefined> = {};

// Track the current page ID for each tab
const tabToPageId: Record<number, number> = {};

// Track the current visit ID for each tab
const tabToVisitId: Record<number, string> = {};

/** Initialize everything */
async function initialize() {
  console.log('[DORY] Initializing extension...');
  messageRouter.initialize();
  registerMessageHandlers();

  const sessionId = await startNewSession();
  isSessionActive = true;
  console.log(`[DORY] Started initial session: ${sessionId}`);

  // Periodically check if we've gone idle
  idleCheckInterval = setInterval(checkSessionInactivity, 60 * 1000); // once per minute
  
  // Add listener for extension icon clicks
  chrome.action.onClicked.addListener(handleExtensionIconClick);
}

/** Handle clicks on the extension icon */
function handleExtensionIconClick() {
  // Open the graph page in a new tab
  chrome.tabs.create({
    url: chrome.runtime.getURL('src/pages/graph/graph.html')
  });
}

/** Check if session is idle -> if so, end it. */
async function checkSessionInactivity() {
  const ended = await checkSessionIdle(SESSION_IDLE_THRESHOLD);
  if (ended) {
    isSessionActive = false;
    console.log('[DORY] Session ended due to inactivity.');
  }
}

/** Ensure we have an active session; if none is active, start one. */
async function ensureActiveSession() {
  if (!isSessionActive) {
    const sessionId = await startNewSession();
    isSessionActive = true;
    console.log('[DORY] New session started (it was idle before):', sessionId);
  }
}

/** Message Handlers */
function registerMessageHandlers() {
  // 1) Activity events (from content script)
  messageRouter.registerHandler(MessageType.ACTIVITY_EVENT, async (message: Message, sender) => {
    const { isActive, pageUrl, duration } = message.data;
    console.log(`[DORY] ACTIVITY_EVENT => isActive=${isActive}, pageUrl=${pageUrl}, dur=${duration}s`);

    if (isActive) {
      // User did something => ensure session is active
      await ensureActiveSession();
    }
    
    // If we have some time to add, do it
    if (pageUrl && duration > 0) {
      await updateActiveTimeForPage(pageUrl, duration);
      // Also update session's lastActivityAt
      await updateSessionActivityTime();
      
      // If we have a visit ID for this tab, update its active time too
      const tabId = sender.tab?.id;
      if (tabId && tabToVisitId[tabId]) {
        const visitId = tabToVisitId[tabId];
        await updateVisitActiveTime(visitId, duration);
        
        // Send active time updated event
        const sessionId = await getCurrentSessionId();
        if (sessionId) {
          sendDoryEvent({
            operation: EventTypes.ACTIVE_TIME_UPDATED,
            sessionId: sessionId.toString(),
            timestamp: Date.now(),
            data: {
              pageId: tabToPageId[tabId].toString(),
              visitId,
              duration,
              isActive
            }
          });
        }
      }
    }
    return true; // Indicate async response handling
  });

  // 2) Everything else we'll log (like EXTRACTION_COMPLETE, if you need it)
  messageRouter.registerHandler(MessageType.EXTRACTION_COMPLETE, async (message: Message, sender) => {
    const { title, url, timestamp } = message.data;
    console.log(`[DORY] EXTRACTION_COMPLETE => ${title} @ ${url}`);

    await ensureActiveSession();
    const pageId = await createOrGetPage(url, title, timestamp);
    const sessionId = await getCurrentSessionId();
    if (sessionId) {
      // If you want to store "which pages belong to which session," do that here.
      console.log('[DORY] Page created / got ID:', pageId, ' in session:', sessionId);
      
      // If we have a tab ID, set the extraction context
      const tabId = sender.tab?.id;
      if (tabId && tabToVisitId[tabId]) {
        // Send message to content script to set extraction context
        chrome.tabs.sendMessage(tabId, createMessage(MessageType.SET_EXTRACTION_CONTEXT, {
          pageId: pageId.toString(),
          visitId: tabToVisitId[tabId]
        }, 'background'));
      }
    }
    return true; // Indicate async response handling
  });

  // Default handler
  messageRouter.setDefaultHandler((msg, sender, resp) => {
    console.warn('[DORY] Unhandled message type:', msg);
    resp({ error: 'Unhandled message type' });
  });
}

/** Get the title of a tab */
async function getTabTitle(tabId: number): Promise<string | null> {
  try {
    const tab = await chrome.tabs.get(tabId);
    return tab.title || null;
  } catch (error) {
    console.error('[DORY] Error getting tab title:', error);
    return null;
  }
}

/** End the current visit for a tab */
async function endCurrentVisit(tabId: number): Promise<void> {
  const visitId = tabToVisitId[tabId];
  if (visitId) {
    const now = Date.now();
    await endVisit(visitId, now);
    
    // Send page visit ended event
    const sessionId = await getCurrentSessionId();
    if (sessionId) {
      sendDoryEvent({
        operation: EventTypes.PAGE_VISIT_ENDED,
        sessionId: sessionId.toString(),
        timestamp: now,
        data: {
          pageId: tabToPageId[tabId].toString(),
          visitId
        }
      });
    }
    
    delete tabToVisitId[tabId];
  }
}

/** Start a new visit for a tab */
async function startNewVisit(tabId: number, pageId: number, fromPageId?: number, isBackNav?: boolean): Promise<string> {
  const sessionId = await getCurrentSessionId();
  if (!sessionId) {
    throw new Error('No active session');
  }
  
  // End any existing visit for this tab
  await endCurrentVisit(tabId);
  
  // Start a new visit
  const visitId = await startVisit(pageId, sessionId, fromPageId, isBackNav);
  tabToVisitId[tabId] = visitId;
  tabToPageId[tabId] = pageId;
  
  // Send page visit started event
  const url = tabToCurrentUrl[tabId] || '';
  const title = await getTabTitle(tabId) || url;
  
  sendDoryEvent({
    operation: EventTypes.PAGE_VISIT_STARTED,
    sessionId: sessionId.toString(),
    timestamp: Date.now(),
    data: {
      pageId: pageId.toString(),
      visitId,
      url,
      title,
      fromPageId: fromPageId ? fromPageId.toString() : undefined,
      isBackNavigation: isBackNav
    }
  });
  
  return visitId;
}

/** WEB NAVIGATION: handle completed navigations (after all redirects) */
chrome.webNavigation.onCommitted.addListener(async (details) => {
  // We only want main frame navigations
  if (details.frameId !== 0) return;
  const { tabId, url, timeStamp, transitionType, transitionQualifiers } = details;
  console.log('[DORY] onCommitted => navigation:', { tabId, url, transitionType, transitionQualifiers });

  await ensureActiveSession();

  // Check if this is a back/forward navigation
  const isBackNav = transitionQualifiers.includes('forward_back');
  console.log('[DORY] Navigation type:', isBackNav ? 'BACK/FORWARD' : transitionType.toUpperCase());

  // Try to get the page title
  const title = await getTabTitle(tabId) || url;

  // Get the current URL for this tab
  const currentTabValue = tabToCurrentUrl[tabId];
  
  // Create or get the destination page
  const toPageId = await createOrGetPage(url, title, timeStamp);

  // Check if this is a pending navigation from a new tab
  if (currentTabValue && currentTabValue.startsWith('pending:')) {
    // Extract the source page ID from the pending value
    const fromPageId = parseInt(currentTabValue.substring(8));
    const sessionId = await getCurrentSessionId();
    
    if (sessionId) {
      // Create or update the edge
      await createOrUpdateEdge(fromPageId, toPageId, sessionId, timeStamp, isBackNav);
      console.log('[DORY] Created/updated new-tab-edge:', { fromPageId, toPageId, title, isBackNav });
      
      // Start a new visit
      await startNewVisit(tabId, toPageId, fromPageId, isBackNav);
    }
  } 
  // Otherwise, check if this is a same-tab navigation
  else if (currentTabValue && currentTabValue !== url) {
    const fromPageId = await createOrGetPage(currentTabValue, currentTabValue, timeStamp);
    const sessionId = await getCurrentSessionId();
    
    if (sessionId) {
      // Create or update the edge
      await createOrUpdateEdge(fromPageId, toPageId, sessionId, timeStamp, isBackNav);
      console.log('[DORY] Created/updated same-tab-edge:', { fromPageId, toPageId, title, isBackNav });
      
      // Start a new visit
      await startNewVisit(tabId, toPageId, fromPageId, isBackNav);
    }
  } else {
    // This is a direct navigation (typed URL, bookmark, etc.)
    // Start a new visit without a fromPageId
    await startNewVisit(tabId, toPageId);
  }

  // Update our tab->url mapping so next navigation is from this new URL
  tabToCurrentUrl[tabId] = url;

  // Trigger content extraction after navigation is complete
  chrome.tabs.sendMessage(tabId, createMessage(MessageType.TRIGGER_EXTRACTION, {}, 'background'));
});

/** WEB NAVIGATION: handle new tab creation from a link */
chrome.webNavigation.onCreatedNavigationTarget.addListener(async (details) => {
  // This event is fired when a link in one tab spawns a new tab
  // (i.e. target="_blank").
  // sourceTabId = the original tab; url = the new tab's URL
  const { sourceTabId, tabId, timeStamp } = details;
  console.log('[DORY] onCreatedNavigationTarget => ', { sourceTabId, tabId });

  await ensureActiveSession();

  // Old page => fromPage
  const oldUrl = tabToCurrentUrl[sourceTabId];
  if (oldUrl && !oldUrl.startsWith('pending:')) {
    const fromPageId = await createOrGetPage(oldUrl, oldUrl, timeStamp);
    
    // Store the source page ID temporarily so we can create the edge when the navigation completes
    tabToCurrentUrl[tabId] = `pending:${fromPageId}`;
    console.log('[DORY] Stored pending navigation from:', { fromPageId, tabId });
  }
});

/** Also watch for tab removal => clear from the map and end visit. */
chrome.tabs.onRemoved.addListener(async (tabId) => {
  // End the current visit for this tab
  await endCurrentVisit(tabId);
  
  // Clean up our maps
  delete tabToCurrentUrl[tabId];
  delete tabToPageId[tabId];
});

/** Also store the initial URL for a tab if it's loaded right away. */
chrome.tabs.onCreated.addListener((tab) => {
  if (tab.id && tab.url) {
    tabToCurrentUrl[tab.id] = tab.url;
  }
});

// This can help if the extension's service worker is reloaded
initialize();

// Cleanup on service worker unload
self.addEventListener('activate', () => {
  console.log('[DORY] Service worker activated');
});

chrome.runtime.onSuspend.addListener(async () => {
  console.log('[DORY] Service worker is suspending => end session');
  await endCurrentSession();
  if (idleCheckInterval) clearInterval(idleCheckInterval);
});