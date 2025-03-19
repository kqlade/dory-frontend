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

import {
  checkAuthDirect,
  authenticateWithGoogleIdTokenDirect
} from '../services/authService';

import {
  handleOnCommitted,
  handleOnCreatedNavigationTarget
} from '../utils/navigationHandlers';

console.log('[DORY] Service Worker starting...');

// -------------------- Constants & State --------------------
const SESSION_IDLE_THRESHOLD = 15 * 60 * 1000; // 15 min

let isSessionActive = false;
let idleCheckInterval: ReturnType<typeof setInterval> | null = null;
let isStartingSession = false;

/**
 * Track data about each open tab:
 *   { [tabId]: { currentUrl, pageId, visitId } }
 */
interface TabTracking {
  currentUrl?: string;
  pageId?: string;
  visitId?: string;
}
const tabs: Record<number, TabTracking> = {};

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

/** Initialize the extension on startup (or service worker wake). */
async function initExtension() {
  console.log('[DORY] Initializing extension...');
  try {
    // 1) Initialize message router
    messageRouter.initialize();
    registerMessageHandlers();
    console.log('[DORY] Message system initialized');
    
    // 2) Check user auth
    const isAuthenticated = await checkAuthDirect();
    updateIcon(isAuthenticated);

    // 3) Listen for extension icon clicks
    chrome.action.onClicked.addListener(handleExtIconClick);
    
    // 4) Listen for keyboard shortcut commands
    chrome.commands.onCommand.addListener(handleCommand);

    // If user is authenticated, proceed with full functionality
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

/** Set up database, event streaming, session watchers, etc. */
async function initializeServices() {
  try {
    await initDexieSystem();

    // Start a new session
    const sid = await startNewSession();
    isSessionActive = true;
    console.log('[DORY] Started session =>', sid);

    // Initialize event streaming
    await initEventService();
    console.log('[DORY] Event streaming init done');

    // Start idle check
    idleCheckInterval = setInterval(checkSessionInactivity, 60_000);
  } catch (error) {
    console.error('[DORY] Services initialization error:', error);
  }
}

/**
 * Handler for extension icon clicks: opens the side panel.
 */
async function handleExtIconClick(tab: chrome.tabs.Tab): Promise<void> {
  if (!tab.id) {
    console.error('[DORY] No tab ID => cannot interact with tab');
    return;
  }

  // Open the side panel
  try {
    console.log('[DORY] Opening side panel for authentication');
    await chrome.sidePanel.open({ tabId: tab.id });
  } catch (err) {
    console.error('[DORY] Error opening side panel:', err);
  }
}

/**
 * Handle keyboard shortcut commands
 */
async function handleCommand(command: string): Promise<void> {
  console.log(`[DORY] Command received: ${command}`);
  
  if (command === 'activate-global-search') {
    // Get the active tab
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs || !tabs[0] || !tabs[0].id) {
      console.error('[DORY] No active tab found');
      return;
    }
    
    const tabId = tabs[0].id;
    
    try {
      // Check if the content script is present
      await chrome.tabs.sendMessage(tabId, { type: 'PING' });
      console.log('[DORY] Content script responded, showing search overlay');
      // Show the search overlay
      await chrome.tabs.sendMessage(tabId, { type: 'SHOW_SEARCH_OVERLAY' });
    } catch (error) {
      console.error('[DORY] No content script in tab:', tabId, error);
      // Inject the content script and then show the overlay
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ['src/content/globalSearch.tsx']
        });
        
        // Small delay to ensure script is loaded
        setTimeout(async () => {
          try {
            await chrome.tabs.sendMessage(tabId, { type: 'SHOW_SEARCH_OVERLAY' });
          } catch (err) {
            console.error('[DORY] Failed to show search overlay after injection:', err);
          }
        }, 300);
      } catch (injectionError) {
        console.error('[DORY] Failed to inject content script:', injectionError);
      }
    }
  } else if (command === 'toggle-side-panel') {
    // Get the active tab
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs || !tabs[0] || !tabs[0].id) {
      console.error('[DORY] No active tab found for side panel');
      return;
    }
    
    // Open the side panel for the active tab
    try {
      await chrome.sidePanel.open({ tabId: tabs[0].id });
      console.log('[DORY] Side panel opened via keyboard shortcut');
    } catch (err) {
      console.error('[DORY] Error opening side panel:', err);
    }
  }
}

// -------------------- Session Idle Check --------------------
async function checkSessionInactivity() {
  try {
    const ended = await checkSessionIdle(SESSION_IDLE_THRESHOLD);
    if (ended) {
      isSessionActive = false;
      console.log('[DORY] Session ended due to inactivity');
    }
  } catch (err) {
    console.error('[DORY] Error checking session inactivity:', err);
  }
}

/**
 * Ensures we have an active session. If not, tries to start one.
 * Uses a guard (isStartingSession) to avoid double-starting sessions concurrently.
 */
async function ensureActiveSession(): Promise<boolean> {
  if (isSessionActive) return true;
  if (isStartingSession) return isSessionActive;

  isStartingSession = true;
  try {
    const isAuthenticated = await checkAuthDirect();
    if (!isAuthenticated) {
      console.log('[DORY] Cannot start session: user not authenticated');
      return false;
    }
    if (!isSessionActive) {
      const newId = await startNewSession();
      isSessionActive = true;
      console.log('[DORY] New session =>', newId);
    }
  } catch (err) {
    console.error('[DORY] Error ensuring active session:', err);
    return false;
  } finally {
    isStartingSession = false;
  }
  return isSessionActive;
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
      try {
        await updateActiveTimeForPage(pageUrl, duration);
        await updateSessionActivityTime();

        const tabId = sender.tab?.id;
        if (tabId !== undefined && tabs[tabId]?.visitId) {
          const visitId = tabs[tabId].visitId!;
          await updateVisitActiveTime(visitId, duration);

          const sessId = await getCurrentSessionId();
          const pageId = tabs[tabId].pageId;
          if (sessId && pageId) {
            await logEvent({
              operation: EventType.ACTIVE_TIME_UPDATED,
              sessionId: String(sessId),
              timestamp: Date.now(),
              data: { pageId, visitId, duration, isActive }
            });
          }
        }
      } catch (error) {
        console.error('[DORY] Error updating activity info:', error);
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

    try {
      const pageId = await createOrGetPage(url, title, timestamp);
      const sessId = await getCurrentSessionId();
      console.log(
        '[DORY] ✅ Extraction =>',
        title,
        url,
        ' => pageId=',
        pageId,
        'session=',
        sessId
      );
    } catch (err) {
      console.error('[DORY] Error during extraction complete handler:', err);
    }
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

  // AUTH_REQUEST => user clicked "Sign in" in the side panel => do OAuth
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

  // Handle side panel ready message
  messageRouter.registerHandler(MessageType.SIDEPANEL_READY, async (msg, sender) => {
    console.log('[DORY] SIDEPANEL_READY => side panel initialized');
    try {
      // If from a tab, respond with current auth state
      if (sender.tab?.id) {
        const isAuthenticated = await checkAuthDirect();
        chrome.tabs.sendMessage(
          sender.tab.id,
          createMessage(MessageType.AUTH_RESULT, { isAuthenticated }, 'background')
        );
      }
    } catch (err) {
      console.error('[DORY] Error handling SIDEPANEL_READY:', err);
    }
    return true;
  });

  // API_PROXY_REQUEST => content script calls backend with special headers
  messageRouter.registerHandler(
    MessageType.API_PROXY_REQUEST,
    async (msg, _sender, sendResponse) => {
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

        console.log(
          `[DORY] Proxy fetch => ${requestData.method || 'GET'}: ${requestData.url}`
        );
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
    }
  );

  // Default
  messageRouter.setDefaultHandler((msg, _sender, resp) => {
    console.warn('[DORY] Unhandled message =>', msg);
    resp({ error: 'Unhandled' });
  });
}

// -------------------- Session & Cleanup --------------------
function cleanupServices(): void {
  console.log('[DORY] Cleaning up services...');
  // End the current session if one is active
  if (isSessionActive) {
    endCurrentSession().catch(err => {
      console.error('[DORY] Error ending session:', err);
    });
  }
  // Clear the idle interval
  if (idleCheckInterval) {
    clearInterval(idleCheckInterval);
    idleCheckInterval = null;
  }
  isSessionActive = false;

  // End any visits for open tabs
  Object.keys(tabs).forEach(async (tabIdStr) => {
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
  
  // Broadcast AUTH_RESULT message to all clients (including side panel)
  chrome.runtime.sendMessage(
    createMessage(MessageType.AUTH_RESULT, { isAuthenticated }, 'background')
  );
  console.log(`[DORY] Broadcasting AUTH_RESULT: isAuthenticated=${isAuthenticated}`);
}

async function endCurrentVisit(tabId: number) {
  console.log('[DORY] Ending visit => tab:', tabId);
  try {
    const visitId = tabs[tabId]?.visitId;
    if (!visitId) {
      console.log('[DORY] No visit found for tab =>', tabId);
      return;
    }
    const now = Date.now();
    await endVisit(visitId, now);

    // Optionally log an event
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
          url: tabs[tabId].currentUrl || '',
          timeSpent
        }
      });
    }
  } catch (e) {
    console.error('[DORY] endVisit error =>', e);
  } finally {
    delete tabs[tabId]?.visitId;
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
  const visitId = tabs[details.tabId]?.visitId;
  if (!visitId) {
    console.log('[DORY] No active visit => skipping =>', details.tabId);
    return;
  }
  const pageId = tabs[details.tabId]?.pageId;
  const sessionId = await getCurrentSessionId();

  // Trigger extraction in the content script
  chrome.tabs.sendMessage(
    details.tabId,
    createMessage(MessageType.SET_EXTRACTION_CONTEXT, { pageId, visitId, sessionId }, 'background'),
    {},
    () => {
      chrome.tabs.sendMessage(
        details.tabId,
        createMessage(MessageType.TRIGGER_EXTRACTION, {}, 'background')
      );
    }
  );
});

// -------------------- Tabs Lifecycle --------------------
chrome.tabs.onRemoved.addListener(async (tabId) => {
  await endCurrentVisit(tabId);
  delete tabs[tabId];
});

chrome.tabs.onCreated.addListener((tab) => {
  if (tab.id !== undefined && tab.url) {
    tabs[tab.id] = { currentUrl: tab.url };
  }
});

// -------------------- Service Worker Lifecycle --------------------
self.addEventListener('activate', () => {
  console.log('[DORY] service worker activated');
});

chrome.runtime.onSuspend.addListener(async () => {
  console.log('[DORY] onSuspend => end session');
  try {
    await endCurrentSession();
    if (idleCheckInterval) {
      clearInterval(idleCheckInterval);
    }
  } catch (err) {
    console.error('[DORY] Error onSuspend =>', err);
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
  try {
    if (!details || ('frameId' in details && details.frameId !== 0)) return;
    const isAuthenticated = await checkAuthDirect();
    if (!isAuthenticated) return;

    const navigationHelpers = {
      tabToCurrentUrl: tabs, // or just access 'tabs'
      async startNewVisit(tabId: number, pageId: string, fromPageId?: string, isBackNav?: boolean) {
        await ensureActiveSession();
        const sessId = await getCurrentSessionId();
        if (!sessId) throw new Error('No active session');

        const visitId = await startVisit(pageId, sessId, fromPageId, isBackNav);
        tabs[tabId].visitId = visitId;
        tabs[tabId].pageId = pageId;
        return visitId;
      },
      async ensureActiveSession() {
        return ensureActiveSession();
      },
      async getTabTitle(tid: number) {
        try {
          const t = await chrome.tabs.get(tid);
          return t.title || null;
        } catch {
          return null;
        }
      }
    };

    // Delegate to your specialized handler
    await handlerFn(details, navigationHelpers);
  } catch (err) {
    console.error('[DORY] handleNavigation error =>', err);
  }
}