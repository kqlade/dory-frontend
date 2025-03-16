/**
 * @file serviceWorker.ts
 *
 * Main background/service worker script for the Dory extension.
 * - Session tracking (Dexie)
 * - WebNavigation event handling
 * - Message routing for content scripts
 * - Chrome extension OAuth (launchWebAuthFlow)
 */

import { messageRouter, MessageType, createMessage, ContentDataMessage } from '../utils/messageSystem';
import { startNewSession, endCurrentSession, getCurrentSessionId, checkSessionIdle, updateSessionActivityTime } from '../utils/dexieSessionManager';
import { createOrGetPage, endVisit, startVisit, updateActiveTimeForPage, updateVisitActiveTime, getDB } from '../utils/dexieBrowsingStore';
import { initDexieSystem } from '../utils/dexieInit';
import { initEventService, sendContentEvent } from '../services/eventService';
import { logEvent } from '../utils/dexieEventLogger';
import { EventType } from '../api/types';
import { isWebPage } from '../utils/urlUtils';
import { checkAuth, authenticateWithGoogleIdToken } from '../services/authService';
import { API_BASE_URL, ENDPOINTS } from '../config';
import { handleOnCommitted, handleOnCreatedNavigationTarget } from '../utils/navigationHandlers';

console.log('[DORY] Service Worker starting up...');

// -------------------- Constants & State --------------------
const SESSION_IDLE_THRESHOLD = 15 * 60 * 1000; // 15 minutes
let isSessionActive = false;
let idleCheckInterval: ReturnType<typeof setInterval> | null = null;
const tabToCurrentUrl: Record<number, string> = {};
const tabToPageId: Record<number, string> = {};
const tabToVisitId: Record<number, string> = {};

// -------------------- Icon Helpers --------------------
function updateIcon(isAuthenticated: boolean) {
  const iconPath = isAuthenticated ? {
    16: '/icons/dory_logo_16x16.png',
    48: '/icons/dory_logo_48x48.png',
    128: '/icons/dory_logo_128x128.png'
  } : {
    16: '/icons/dory_logo_gray_16x16.png',
    48: '/icons/dory_logo_gray_48x48.png',
    128: '/icons/dory_logo_gray_128x128.png'
  };
  
  chrome.action.setIcon({ path: iconPath });
}

// -------------------- Initialize on load --------------------
initExtension();

// -------------------- Initialize Extension --------------------
async function initExtension() {
  console.log('[DORY] Initializing extension...');
  try {
    const isAuthenticated = await checkAuth();
    updateIcon(isAuthenticated);
    
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

// -------------------- Initialize Services --------------------
async function initializeServices() {
  try {
    await initDexieSystem();
    messageRouter.initialize();
    registerMessageHandlers();
    const sid = await startNewSession();
    isSessionActive = true;
    console.log('[DORY] Started session =>', sid);
    await initEventService();
    console.log('[DORY] Event streaming init done');
    idleCheckInterval = setInterval(checkSessionInactivity, 60000);
    chrome.action.onClicked.addListener(handleExtIconClick);
  } catch (error) {
    console.error('[DORY] Services initialization error:', error);
  }
}

function handleExtIconClick() {
  chrome.tabs.create({});
}

// -------------------- checkSessionInactivity --------------------
async function checkSessionInactivity() {
  const ended = await checkSessionIdle(SESSION_IDLE_THRESHOLD);
  if (ended) {
    isSessionActive = false;
    console.log('[DORY] Session ended due to inactivity');
  }
}

// -------------------- ensureActiveSession --------------------
async function ensureActiveSession() {
  // First ensure the user is authenticated
  const isAuthenticated = await checkAuth();
  if (!isAuthenticated) {
    console.log('[DORY] Cannot start session: not authenticated');
    return false;
  }
  
  if (!isSessionActive) {
    const newId = await startNewSession();
    isSessionActive = true;
    console.log('[DORY] New session =>', newId);
  }
  
  return true;
}

// -------------------- endCurrentVisit --------------------
async function endCurrentVisit(tabId: number) {
  console.log('[DORY] Ending visit for tab =>', tabId);
  try {
    const visitId = tabToVisitId[tabId];
    if (!visitId) {
      console.log('[DORY] No visit to end for tab =>', tabId);
      return;
    }
    const now = Date.now();
    await endVisit(visitId, now);
    const db = await getDB();
    const visit = await db.visits.get(visitId);
    const sessId = await getCurrentSessionId();
    if (sessId && visit) {
      const timeSpent = Math.round((now - visit.startTime) / 1000);
      
      // Get authenticated user ID
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

// -------------------- registerMessageHandlers --------------------
function registerMessageHandlers() {
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
  messageRouter.registerHandler(MessageType.EXTRACTION_COMPLETE, async (msg) => {
    console.log('[DORY] EXTRACTION_COMPLETE =>', msg.data);
    const { title, url, timestamp } = msg.data;
    const sessionActive = await ensureActiveSession();
    if (!sessionActive) return false;
    
    const pageId = await createOrGetPage(url, title, timestamp);
    const sessId = await getCurrentSessionId();
    console.log('[DORY] ✅ Extraction finished =>', title, url, '=> pageId=', pageId, 'session=', sessId);
    return true;
  });
  messageRouter.registerHandler(MessageType.EXTRACTION_ERROR, async (msg) => {
    console.error('[DORY] ❌ EXTRACTION FAILED =>', msg.data);
    return true;
  });
  messageRouter.registerHandler(MessageType.CONTENT_DATA, async (msg) => {
    console.log('[DORY] Received CONTENT_DATA from content script');
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
      console.error('[DORY] Error sending content data to API:', error);
    }
    return true;
  });
  messageRouter.setDefaultHandler((msg, _sender, resp) => {
    console.warn('[DORY] Unhandled message =>', msg);
    resp({ error: 'Unhandled' });
  });
}

// -------------------- OAuth Flow Messages from Popup  --------------------
chrome.runtime.onMessage.addListener((msg, _sender, _sendResponse) => {
  if (msg.action === 'auth_completed') {
    console.log('[DORY] auth_completed => re-checking...');
    handleAuthCompleted();
  }
  if (msg.action === 'start_oauth') {
    openOAuthPopup();
  }
  return false;
});

/**
 * Handle authentication completion
 */
async function handleAuthCompleted() {
  const isAuthenticated = await checkAuth();
  updateIcon(isAuthenticated);
  
  if (isAuthenticated) {
    console.log('[DORY] Now authenticated => initializing extension services');
    if (!isSessionActive) {
      await initializeServices();
    }
  } else {
    console.log('[DORY] Authentication failed or was canceled');
  }
}

/**
 * Open OAuth popup to get Google authentication
 */
function openOAuthPopup() {
  console.log('[DORY] Starting OAuth flow with launchWebAuthFlow...');
  
  const manifest = chrome.runtime.getManifest();
  const clientId = manifest.oauth2?.client_id;
  const scopes = manifest.oauth2?.scopes || [];
  
  if (!clientId) {
    console.error('[DORY] OAuth client ID not found in manifest');
    return;
  }

  console.log('[DORY] Extension details:', {
    id: chrome.runtime.id,
    clientId,
    scopes
  });

  // Construct the Google OAuth URL
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.append('client_id', clientId);
  authUrl.searchParams.append('response_type', 'id_token');
  authUrl.searchParams.append('redirect_uri', `https://${chrome.runtime.id}.chromiumapp.org/`);
  authUrl.searchParams.append('scope', scopes.join(' '));
  authUrl.searchParams.append('nonce', Math.random().toString(36).substring(2));
  authUrl.searchParams.append('prompt', 'consent');

  console.log('[DORY] Launching web auth flow with URL:', authUrl.toString());

  chrome.identity.launchWebAuthFlow({
    url: authUrl.toString(),
    interactive: true
  }, async (responseUrl) => {
    if (chrome.runtime.lastError) {
      console.error('[DORY] OAuth error details =>', {
        message: chrome.runtime.lastError.message,
        stack: new Error().stack,
        extensionId: chrome.runtime.id
      });
      return;
    }

    if (!responseUrl) {
      console.warn('[DORY] No response URL received from Google');
      return;
    }

    // Extract the ID token from the response URL
    const urlFragment = responseUrl.split('#')[1];
    const params = new URLSearchParams(urlFragment);
    const idToken = params.get('id_token');

    if (!idToken) {
      console.error('[DORY] No ID token found in response URL');
      return;
    }

    console.log('[DORY] Received Google ID token:', {
      length: idToken.length,
      prefix: idToken.substring(0, 10) + '...',
      timestamp: new Date().toISOString()
    });

    try {
      const success = await authenticateWithGoogleIdToken(idToken);
      console.log('[DORY] Backend authentication attempt completed:', {
        success,
        tokenLength: idToken.length,
        timestamp: new Date().toISOString()
      });

      if (success) {
        console.log('[DORY] Backend authentication successful => updating extension state');
        await handleAuthCompleted();
      } else {
        console.warn('[DORY] Backend authentication failed');
      }
    } catch (error: unknown) {
      const err = error as Error;
      console.error('[DORY] Backend authentication error:', {
        error: err.message,
        tokenLength: idToken.length,
        timestamp: new Date().toISOString(),
        stack: err.stack
      });
    }
  });
}

// -------------------- Navigation Handler Utilities --------------------
/**
 * Shared navigation handler for different navigation events
 */
async function handleNavigation(
  details: chrome.webNavigation.WebNavigationFramedCallbackDetails | chrome.webNavigation.WebNavigationSourceCallbackDetails,
  handlerFunction: Function
) {
  // Skip if not main frame or if details are missing
  if (!details || ('frameId' in details && details.frameId !== 0)) return;
  
  // Check auth before handling navigation
  const isAuthenticated = await checkAuth();
  if (!isAuthenticated) return;
  
  // Common navigation handling configuration
  const navigationHelpers = {
    tabToCurrentUrl,
    tabToPageId,
    tabToVisitId,
    startNewVisit: async (tabId: number, pageId: string, fromPageId?: string, isBackNav?: boolean) => {
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
        const tab = await chrome.tabs.get(tid);
        return tab.title || null;
      } catch {
        return null;
      }
    }
  };
  
  // Call the specific handler with shared configuration
  await handlerFunction(details, navigationHelpers);
}

// -------------------- Navigation Handling --------------------
chrome.webNavigation.onCommitted.addListener(async (details) => {
  await handleNavigation(details, handleOnCommitted);
});

chrome.webNavigation.onCreatedNavigationTarget.addListener(async (details) => {
  await handleNavigation(details, handleOnCreatedNavigationTarget);
});

chrome.webNavigation.onCompleted.addListener(async (details) => {
  if (details.frameId !== 0) return;
  console.log('[DORY] onCompleted =>', details.tabId, details.url);
  
  // Check auth before handling completion
  const isAuthenticated = await checkAuth();
  if (!isAuthenticated) return;
  
  if (!isWebPage(details.url)) {
    console.log('[DORY] Not a web page => skipping =>', details.url);
    return;
  }
  const visitId = tabToVisitId[details.tabId];
  if (!visitId) {
    console.log('[DORY] No visit => skip => tabId=', details.tabId);
    return;
  }
  const pageId = tabToPageId[details.tabId];
  const sessionId = await getCurrentSessionId();
  console.log('[DORY] onCompleted => sending SET_EXTRACTION_CONTEXT =>', { pageId, visitId, sessionId });
  chrome.tabs.sendMessage(details.tabId, createMessage(MessageType.SET_EXTRACTION_CONTEXT, { pageId, visitId, sessionId }, 'background'), {}, (resp) => {
    console.log('[DORY] SET_EXTRACTION_CONTEXT ack =>', resp);
    chrome.tabs.sendMessage(details.tabId, createMessage(MessageType.TRIGGER_EXTRACTION, {}, 'background'));
  });
});

// -------------------- Tab Lifecycle --------------------
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

/**
 * Service worker safe method to get user ID from storage directly
 */
async function getUserIdFromStorage(): Promise<string | undefined> {
  try {
    const data = await chrome.storage.local.get(['user']);
    return data.user?.id || undefined;
  } catch (error) {
    console.error('[ServiceWorker] Error getting user ID from storage:', error);
    return undefined;
  }
}