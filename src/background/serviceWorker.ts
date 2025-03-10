/**
 * @file serviceWorker.ts
 * Using ES modules (strict mode by default).
 */

// Import necessary modules and services
import { messageRouter, MessageType, Message, createMessage } from '../services/messageSystem';
import {
  startNewSession,
  endCurrentSession,
  getCurrentSessionId,
  checkSessionIdle,
  updateSessionActivityTime
} from '../services/dexieSessionManager';
import {
  createOrGetPage,
  updateActiveTimeForPage,
  createOrUpdateEdge,
  startVisit,
  endVisit,
  updateVisitActiveTime,
  getDB
} from '../services/dexieBrowsingStore';
// Import the Dexie event streamer for all regular events
import { sendDoryEvent, EventTypes, initEventStreaming } from '../services/dexieEventStreamer';
// We don't need to import the API event streamer here since content extraction events 
// are sent directly from the contentExtractor.ts file
import { initDexieSystem } from '../services/dexieInit';

// Import navigation handlers
import {
  handleOnCommitted,
  handleOnCreatedNavigationTarget,
  TabTracking
} from '../services/navigationHandlers';

console.log('[DORY] INFO:', 'Service Worker: Starting up...');

// Session idle config
const SESSION_IDLE_THRESHOLD = 15 * 60 * 1000; // 15 minutes
let isSessionActive = false;
let idleCheckInterval: ReturnType<typeof setInterval> | null = null;

// Tracking structures
const tabToCurrentUrl: Record<number, string | undefined> = {};
const tabToPageId: Record<number, number> = {};
const tabToVisitId: Record<number, string> = {};

/**
 * Main initialization of the service worker
 */
async function initialize(): Promise<void> {
  console.log('[DORY] INFO:', 'Initializing extension...');
  
  // Initialize Dexie
  await initDexieSystem();
  console.log('[DORY] INFO:', 'Dexie database system initialized');
  
  // Setup message routing
  messageRouter.initialize();
  registerMessageHandlers();

  // Initialize event streaming
  await initEventStreaming();
  console.log('[DORY] INFO:', 'Event streaming initialized (Dexie storage)');

  // Start a new session
  const sessionId = await startNewSession();
  isSessionActive = true;
  console.log('[DORY] INFO:', `Started initial session: ${sessionId}`);

  // Idle check
  idleCheckInterval = setInterval(checkSessionInactivity, 60 * 1000);

  // Extension icon click -> open a new tab
  chrome.action.onClicked.addListener(handleExtensionIconClick);
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
      sendDoryEvent({
        operation: EventTypes.PAGE_VISIT_ENDED,
        sessionId: sessionId.toString(),
        timestamp: Math.floor(now),
        data: {
          pageId: tabToPageId[tabId].toString(),
          visitId,
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

  const tab = await chrome.tabs.get(tabId);
  const url = tab.url || '';
  const title = (await getTabTitle(tabId)) || 'Untitled';
  
  console.log('[DORY] INFO:', 'Starting new visit', { tabId, pageId, url });

  // Start the visit in Dexie
  const visitId = await startVisit(pageId, sessionId, fromPageId, isBackNav);
  
  // Update tracking
  tabToPageId[tabId] = pageId;
  tabToVisitId[tabId] = visitId;

  // Fire PAGE_VISIT_STARTED
  sendDoryEvent({
    operation: EventTypes.PAGE_VISIT_STARTED,
    sessionId: sessionId.toString(),
    timestamp: Math.floor(Date.now()),
    data: {
      pageId: pageId.toString(),
      visitId,
      url,
      title,
      fromPageId: fromPageId?.toString(),
      isBackNavigation: isBackNav
    }
  });

  // If it's a web page, set extraction context & trigger extraction
  if (url.startsWith('http://') || url.startsWith('https://')) {
    try {
      chrome.tabs.sendMessage(
        tabId,
        createMessage(MessageType.SET_EXTRACTION_CONTEXT, { pageId: pageId.toString(), visitId }, 'background')
      );
      chrome.tabs.sendMessage(
        tabId,
        createMessage(MessageType.TRIGGER_EXTRACTION, {}, 'background')
      );
    } catch (err) {
      console.error('Error triggering extraction for tab', { tabId, err });
    }
  } else {
    console.log('[DORY] INFO:', 'Skipping extraction for non-web URL', { url });
  }

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

        const sessionId = await getCurrentSessionId();
        if (sessionId) {
          sendDoryEvent({
            operation: EventTypes.ACTIVE_TIME_UPDATED,
            sessionId: sessionId.toString(),
            timestamp: Math.floor(Date.now()),
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