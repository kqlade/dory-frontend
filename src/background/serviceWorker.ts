/**
 * @file serviceWorker.ts
 *
 * Main background/service worker script for the DORY extension (Manifest V3).
 * Handles session tracking, navigation events, message routing, OAuth, etc.
 */

import {
  messageRouter,
  MessageType,
  createMessage,
  ContentDataMessage,
  ApiProxyRequestData,
  ApiProxyResponseData
} from '../utils/messageSystem';

import {
  startNewSession,
  endCurrentSession,
  getCurrentSessionId,
  checkSessionIdle,
  updateSessionActivityTime
} from '../utils/dexieSessionManager';
import {
  createOrGetPage,
  endVisit,
  startVisit,
  updateActiveTimeForPage,
  updateVisitActiveTime,
  getDB
} from '../utils/dexieBrowsingStore';

import { initDexieSystem } from '../utils/dexieInit';
import { initEventService, sendContentEvent } from '../services/eventService';
import { logEvent } from '../utils/dexieEventLogger';
import { EventType } from '../api/types';
import { isWebPage } from '../utils/urlUtils';

// Import the direct fetch versions for the background
import {
  checkAuthDirect,
  authenticateWithGoogleIdTokenDirect
} from '../services/authService';

import { handleOnCommitted, handleOnCreatedNavigationTarget } from '../utils/navigationHandlers';

console.log('[DORY] Service Worker starting...');

// -------------------- Constants & State --------------------
const SESSION_IDLE_THRESHOLD = 15 * 60 * 1000; // 15 min
let isSessionActive = false;
let idleCheckInterval: ReturnType<typeof setInterval> | null = null;

const tabToCurrentUrl: Record<number, string> = {};
const tabToPageId: Record<number, string> = {};
const tabToVisitId: Record<number, string> = {};

// -------------------- Icon Helpers --------------------
function updateIcon(isAuthenticated: boolean) {
  const iconPath = isAuthenticated
    ? {
        16: '/icons/dory_logo_16x16.png',
        48: '/icons/dory_logo_48x48.png',
        128: '/icons/dory_logo_128x128.png'
      }
    : {
        16: '/icons/dory_logo_gray_16x16.png',
        48: '/icons/dory_logo_gray_48x48.png',
        128: '/icons/dory_logo_gray_128x128.png'
      };
  chrome.action.setIcon({ path: iconPath });
}

// -------------------- Initialization --------------------
initExtension();

/** Initialize the extension on startup */
async function initExtension() {
  console.log('[DORY] Initializing extension...');
  try {
    // 1) Always initialize the message router so we can receive content messages
    messageRouter.initialize();
    registerMessageHandlers();
    console.log('[DORY] Message system initialized');
    
    // 2) Check auth with direct fetch
    const isAuthenticated = await checkAuthDirect();
    updateIcon(isAuthenticated);

    // 3) Listen for extension icon clicks
    chrome.action.onClicked.addListener(handleExtIconClick);

    if (isAuthenticated) {
      await initializeServices();
    } else {
      console.log('[DORY] Not authenticated => extension in limited mode');
    }
  } catch (err) {
    console.error('[DORY] Initialization error:', err);
    updateIcon(false);
  }
}

/** Set up database, event services, session watchers, etc. */
async function initializeServices() {
  try {
    await initDexieSystem();

    const sid = await startNewSession();
    isSessionActive = true;
    console.log('[DORY] Started session =>', sid);

    await initEventService();
    console.log('[DORY] Event streaming init done');

    idleCheckInterval = setInterval(checkSessionInactivity, 60_000);
  } catch (error) {
    console.error('[DORY] Services initialization error:', error);
  }
}

async function handleExtIconClick(tab: chrome.tabs.Tab): Promise<void> {
  if (!tab.id) {
    console.error('[DORY] No tab ID => cannot open popup');
    return;
  }
  const tabId = tab.id;

  try {
    await chrome.tabs.sendMessage(tabId, { type: 'PING' });
    console.log('[DORY] Content script responded, showing popup');
    await chrome.tabs.sendMessage(tabId, { type: 'SHOW_POPUP' });
  } catch (error) {
    console.error('[DORY] No content script in tab:', tabId, error);
    chrome.notifications?.create({
      type: 'basic',
      iconUrl: '/icons/dory_logo_128x128.png',
      title: 'DORY Extension',
      message: 'Cannot open popup on this page. Try refreshing the page first.',
      priority: 2
    });
  }
}

// -------------------- Session Idle Check --------------------
async function checkSessionInactivity() {
  const ended = await checkSessionIdle(SESSION_IDLE_THRESHOLD);
  if (ended) {
    isSessionActive = false;
    console.log('[DORY] Session ended due to inactivity');
  }
}

async function ensureActiveSession() {
  const isAuthenticated = await checkAuthDirect(); // direct fetch
  if (!isAuthenticated) {
    console.log('[DORY] Cannot start session: user not authenticated');
    return false;
  }
  if (!isSessionActive) {
    const newId = await startNewSession();
    isSessionActive = true;
    console.log('[DORY] New session =>', newId);
  }
  return true;
}

// -------------------- Register Handlers --------------------
function registerMessageHandlers() {
  // ACTIVITY_EVENT
  messageRouter.registerHandler(MessageType.ACTIVITY_EVENT, async (msg, sender) => {
    const { isActive, pageUrl, duration } = msg.data;
    console.log('[DORY] ACTIVITY_EVENT =>', msg.data);

    if (isActive) {
      const sessionActive = await ensureActiveSession();
      if (!sessionActive) return false;
    }
    if (pageUrl && duration > 0) {
      await updateActiveTimeForPage(pageUrl, duration);
      await updateSessionActivityTime();

      const tabId = sender.tab?.id;
      if (tabId !== undefined && tabToVisitId[tabId]) {
        const vid = tabToVisitId[tabId];
        await updateVisitActiveTime(vid, duration);

        const sessId = await getCurrentSessionId();
        const pid = tabToPageId[tabId];
        if (sessId) {
          await logEvent({
            operation: EventType.ACTIVE_TIME_UPDATED,
            sessionId: String(sessId),
            timestamp: Date.now(),
            data: { pageId: pid, visitId: vid, duration, isActive }
          });
        }
      }
    }
    return true;
  });

  // EXTRACTION_COMPLETE
  messageRouter.registerHandler(MessageType.EXTRACTION_COMPLETE, async (msg) => {
    console.log('[DORY] EXTRACTION_COMPLETE =>', msg.data);
    const { title, url, timestamp } = msg.data;
    const sessionActive = await ensureActiveSession();
    if (!sessionActive) return false;

    const pageId = await createOrGetPage(url, title, timestamp);
    const sessId = await getCurrentSessionId();
    console.log('[DORY] ✅ Extraction =>', title, url, ' => pageId=', pageId, 'session=', sessId);
    return true;
  });

  // EXTRACTION_ERROR
  messageRouter.registerHandler(MessageType.EXTRACTION_ERROR, async (msg) => {
    console.error('[DORY] ❌ EXTRACTION FAILED =>', msg.data);
    return true;
  });

  // CONTENT_DATA
  messageRouter.registerHandler(MessageType.CONTENT_DATA, async (msg) => {
    console.log('[DORY] Received CONTENT_DATA');
    try {
      const contentData = msg.data as ContentDataMessage;
      await sendContentEvent({
        pageId: contentData.pageId,
        visitId: contentData.visitId,
        url: contentData.url,
        title: contentData.title,
        markdown: contentData.markdown,
        metadata: contentData.metadata,
        sessionId: contentData.sessionId
      });
      console.log('[DORY] Content data sent to API successfully');
    } catch (error) {
      console.error('[DORY] Error sending content data:', error);
    }
    return true;
  });

  // POPUP_READY => respond with current auth state
  messageRouter.registerHandler(MessageType.POPUP_READY, async (msg, sender) => {
    if (sender.tab?.id) {
      const isAuthenticated = await checkAuthDirect(); // direct fetch
      chrome.tabs.sendMessage(
        sender.tab.id,
        createMessage(MessageType.AUTH_RESULT, { isAuthenticated }, 'background')
      );
    }
    return true;
  });

  // AUTH_REQUEST => user clicked "Sign in" in the popup => do OAuth
  messageRouter.registerHandler(MessageType.AUTH_REQUEST, async () => {
    console.log('[DORY] AUTH_REQUEST => starting OAuth flow');
    openOAuthPopup();
    return true;
  });

  // AUTH_RESULT => user changed auth state
  messageRouter.registerHandler(MessageType.AUTH_RESULT, async (msg) => {
    const { isAuthenticated } = msg.data;
    await handleAuthStateChange(isAuthenticated);
    return true;
  });

  // API_PROXY_REQUEST => content script calls backend with special headers
  messageRouter.registerHandler(MessageType.API_PROXY_REQUEST, async (msg, _sender, sendResponse) => {
    console.log('[DORY] API_PROXY_REQUEST received');
    try {
      const requestData = msg.data as ApiProxyRequestData;
      // retrieve token from storage
      const storage = await chrome.storage.local.get(['auth_token']);
      const authToken = storage.auth_token;

      // build headers
      const headers: Record<string, string> = {
        ...(requestData.headers || {}),
        'Content-Type': 'application/json'
      };
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }

      console.log(`[DORY] Proxy fetch => ${requestData.method || 'GET'}: ${requestData.url}`);
      const response = await fetch(requestData.url, {
        method: requestData.method || 'GET',
        headers,
        body: requestData.body ? JSON.stringify(requestData.body) : undefined,
        credentials: 'include'
      });

      let responseData;
      try {
        responseData = await response.json();
      } catch (e) {
        responseData = await response.text();
      }

      sendResponse(
        createMessage(
          MessageType.API_PROXY_RESPONSE,
          {
            status: response.status,
            ok: response.ok,
            data: responseData
          } as ApiProxyResponseData,
          'background'
        )
      );
      return true;
    } catch (error: any) {
      console.error('[DORY] API Proxy error:', error);
      sendResponse(
        createMessage(
          MessageType.API_PROXY_RESPONSE,
          { status: 0, ok: false, error: error.message },
          'background'
        )
      );
      return true;
    }
  });

  // Default
  messageRouter.setDefaultHandler((msg, _sender, resp) => {
    console.warn('[DORY] Unhandled message =>', msg);
    resp({ error: 'Unhandled' });
  });
}

// -------------------- Session & Cleanup --------------------
function cleanupServices(): void {
  console.log('[DORY] Cleaning up services...');
  if (isSessionActive) {
    endCurrentSession().catch(err => {
      console.error('[DORY] Error ending session:', err);
    });
  }
  if (idleCheckInterval) {
    clearInterval(idleCheckInterval);
    idleCheckInterval = null;
  }
  isSessionActive = false;

  // End any tracked visits
  Object.keys(tabToVisitId).forEach(async (tabIdStr) => {
    const tabId = parseInt(tabIdStr, 10);
    await endCurrentVisit(tabId);
  });
  console.log('[DORY] Services cleaned up');
}

/** Called whenever user logs in or logs out */
async function handleAuthStateChange(isAuthenticated: boolean) {
  updateIcon(isAuthenticated);
  if (isAuthenticated) {
    console.log('[DORY] Auth success => initializing services');
    if (!isSessionActive) {
      await initializeServices();
    }
  } else {
    console.log('[DORY] Auth false => cleaning up services');
    cleanupServices();
  }
}

async function endCurrentVisit(tabId: number) {
  console.log('[DORY] Ending visit => tab:', tabId);
  try {
    const visitId = tabToVisitId[tabId];
    if (!visitId) {
      console.log('[DORY] No visit found for tab =>', tabId);
      return;
    }
    const now = Date.now();
    await endVisit(visitId, now);

    const db = await getDB();
    const visit = await db.visits.get(visitId);
    const sessId = await getCurrentSessionId();
    if (sessId && visit) {
      const timeSpent = Math.round((now - visit.startTime) / 1000);
      const userId = await getUserIdFromStorage();
      await logEvent({
        operation: EventType.PAGE_VISIT_ENDED,
        sessionId: String(sessId),
        timestamp: now,
        userId,
        data: {
          pageId: String(visit.pageId),
          visitId,
          url: tabToCurrentUrl[tabId] || '',
          timeSpent
        }
      });
    }
  } catch (e) {
    console.error('[DORY] endVisit error =>', e);
  } finally {
    delete tabToVisitId[tabId];
  }
}

// -------------------- OAuth Flow --------------------
function openOAuthPopup() {
  console.log('[DORY] Starting OAuth with chrome.identity.launchWebAuthFlow...');
  const manifest = chrome.runtime.getManifest();
  const clientId = manifest.oauth2?.client_id;
  const scopes = manifest.oauth2?.scopes || [];

  if (!clientId) {
    console.error('[DORY] OAuth client ID not found in manifest');
    return;
  }

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.append('client_id', clientId);
  authUrl.searchParams.append('response_type', 'id_token');
  authUrl.searchParams.append('redirect_uri', `https://${chrome.runtime.id}.chromiumapp.org/`);
  authUrl.searchParams.append('scope', scopes.join(' '));
  authUrl.searchParams.append('nonce', Math.random().toString(36).substring(2));
  authUrl.searchParams.append('prompt', 'consent');

  chrome.identity.launchWebAuthFlow(
    { url: authUrl.toString(), interactive: true },
    async (responseUrl) => {
      if (chrome.runtime.lastError) {
        console.error('[DORY] OAuth error =>', chrome.runtime.lastError.message);
        return;
      }
      if (!responseUrl) {
        console.warn('[DORY] No response URL from Google');
        return;
      }

      // Extract ID token from the fragment
      const urlFragment = responseUrl.split('#')[1];
      const params = new URLSearchParams(urlFragment);
      const idToken = params.get('id_token');
      if (!idToken) {
        console.error('[DORY] No ID token in OAuth response');
        return;
      }

      // Direct fetch approach
      try {
        const success = await authenticateWithGoogleIdTokenDirect(idToken);
        console.log('[DORY] authenticateWithGoogleIdTokenDirect =>', success);
        if (success) {
          await handleAuthStateChange(true);
        } else {
          console.warn('[DORY] Backend auth failed');
        }
      } catch (err) {
        console.error('[DORY] Backend auth error =>', err);
      }
    }
  );
}

// -------------------- Navigation Handlers --------------------
chrome.webNavigation.onCommitted.addListener(async (details) => {
  await handleNavigation(details, handleOnCommitted);
});

chrome.webNavigation.onCreatedNavigationTarget.addListener(async (details) => {
  await handleNavigation(details, handleOnCreatedNavigationTarget);
});

chrome.webNavigation.onCompleted.addListener(async (details) => {
  if (details.frameId !== 0) return;
  console.log('[DORY] onCompleted => tab:', details.tabId, 'url:', details.url);

  const isAuthenticated = await checkAuthDirect();
  if (!isAuthenticated) return;

  if (!isWebPage(details.url)) {
    console.log('[DORY] Not a web page => skipping =>', details.url);
    return;
  }
  const visitId = tabToVisitId[details.tabId];
  if (!visitId) {
    console.log('[DORY] No active visit => skipping =>', details.tabId);
    return;
  }
  const pageId = tabToPageId[details.tabId];
  const sessionId = await getCurrentSessionId();

  // Trigger extraction in the content script
  chrome.tabs.sendMessage(
    details.tabId,
    createMessage(MessageType.SET_EXTRACTION_CONTEXT, { pageId, visitId, sessionId }, 'background'),
    {},
    () => {
      chrome.tabs.sendMessage(details.tabId, createMessage(MessageType.TRIGGER_EXTRACTION, {}, 'background'));
    }
  );
});

// -------------------- Tabs Lifecycle --------------------
chrome.tabs.onRemoved.addListener(async (tabId) => {
  await endCurrentVisit(tabId);
  delete tabToCurrentUrl[tabId];
  delete tabToPageId[tabId];
  delete tabToVisitId[tabId];
});
chrome.tabs.onCreated.addListener((tab) => {
  if (tab.id !== undefined && tab.url) {
    tabToCurrentUrl[tab.id] = tab.url;
  }
});

// -------------------- Service Worker Lifecycle --------------------
self.addEventListener('activate', () => {
  console.log('[DORY] service worker activated');
});

chrome.runtime.onSuspend.addListener(async () => {
  console.log('[DORY] onSuspend => end session');
  await endCurrentSession();
  if (idleCheckInterval) {
    clearInterval(idleCheckInterval);
  }
});

// -------------------- Helper: get user ID from storage --------------------
async function getUserIdFromStorage(): Promise<string | undefined> {
  try {
    const data = await chrome.storage.local.get(['user']);
    return data.user?.id || undefined;
  } catch (error) {
    console.error('[ServiceWorker] Error reading user from storage:', error);
    return undefined;
  }
}

/**
 * Helper: top-level navigation check
 */
async function handleNavigation(
  details:
    | chrome.webNavigation.WebNavigationFramedCallbackDetails
    | chrome.webNavigation.WebNavigationSourceCallbackDetails,
  handlerFn: Function
) {
  if (!details || ('frameId' in details && details.frameId !== 0)) return;
  const isAuthenticated = await checkAuthDirect();
  if (!isAuthenticated) return;

  const navigationHelpers = {
    tabToCurrentUrl,
    tabToPageId,
    tabToVisitId,
    startNewVisit: async (
      tabId: number,
      pageId: string,
      fromPageId?: string,
      isBackNav?: boolean
    ) => {
      await ensureActiveSession();
      const sessId = await getCurrentSessionId();
      if (!sessId) throw new Error('No active session');
      const visitId = await startVisit(pageId, sessId, fromPageId, isBackNav);
      tabToVisitId[tabId] = visitId;
      tabToPageId[tabId] = pageId;
      return visitId;
    },
    ensureActiveSession: async () => ensureActiveSession(),
    getTabTitle: async (tid: number) => {
      try {
        const t = await chrome.tabs.get(tid);
        return t.title || null;
      } catch {
        return null;
      }
    }
  };

  await handlerFn(details, navigationHelpers);
}