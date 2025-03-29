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
import { EventType, SearchResponse } from '../api/types';
import { isWebPage } from '../utils/urlUtils';
import { ColdStorageSync } from '../services/coldStorageSync';
import { getClusterSuggestions } from '../services/clusteringService';
import { localRanker } from '../services/localDoryRanking';
import { semanticSearch } from '../api/client';
import { getCurrentUserId } from '../services/userService';

import {
  checkAuthDirect,
  authenticateWithGoogleIdTokenDirect
} from '../services/authService';

import {
  handleOnCommitted,
  handleOnCreatedNavigationTarget
} from '../utils/navigationHandlers';

import { 
  API_BASE_URL, 
  ENDPOINTS, 
  ENABLE_GLOBAL_SEARCH,
} from '../config';

// +++ NEW IMPORTS +++
import { searchHistoryAPI } from '../services/historySearch';
import { UnifiedLocalSearchResult } from '../types/search';
// +++ END NEW IMPORTS +++

console.log('[DORY] Service Worker starting...');

// -------------------- Constants & State --------------------
const SESSION_IDLE_THRESHOLD = 15 * 60 * 1000; // 15 min

let isSessionActive = false;
let idleCheckInterval: ReturnType<typeof setInterval> | null = null;
let isStartingSession = false;

/**
 * Track data about each open tab with separate maps for different properties
 */
const tabToCurrentUrl: Record<number, string | undefined> = {};
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
    
    // 5) Listen for alarms to trigger cold storage sync
    chrome.alarms.onAlarm.addListener(handleAlarm);

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

/**
 * Handle Chrome alarms for scheduled tasks
 */
async function handleAlarm(alarm: chrome.alarms.Alarm): Promise<void> {
  console.log(`[DORY] Alarm triggered: ${alarm.name}`);
  
  if (alarm.name === 'doryColdStorageSync') {
    try {
      // Make sure the user is authenticated before syncing
      const isAuthenticated = await checkAuthDirect();
      if (!isAuthenticated) {
        console.log('[DORY] Skipping cold storage sync: user not authenticated');
        return;
      }
      
      // Get the last sync time for logging
      const store = await chrome.storage.local.get('lastColdStorageSync');
      const lastSyncTime = store.lastColdStorageSync ? new Date(store.lastColdStorageSync) : 'never';
      console.log(`[DORY] Starting cold storage sync from alarm trigger. Last sync: ${lastSyncTime}`);
      
      // Check database state before sync
      try {
        const db = await getDB();
        const pageCount = await db.pages.count();
        const visitCount = await db.visits.count();
        const sessionCount = await db.sessions.count();
        console.log(`[DORY] Database state before sync - Pages: ${pageCount}, Visits: ${visitCount}, Sessions: ${sessionCount}`);
      } catch (dbErr) {
        console.warn('[DORY] Could not count database records:', dbErr);
      }
      
      // Perform the sync
      const startTime = Date.now();
      const syncer = new ColdStorageSync('alarm');
      await syncer.performSync();
      const syncDuration = Date.now() - startTime;
      
      console.log(`[DORY] Cold storage sync completed successfully in ${syncDuration}ms`);
      
      // Also refresh clusters while we're at it (piggyback on the existing sync)
      try {
        console.log('[DORY] Starting cluster fetch after cold storage sync');
        const result = await getClusterSuggestions({ forceRefresh: true });
        console.log(`[DORY] Cluster fetch completed successfully: ${result.current.length} current clusters`);
      } catch (clusterErr) {
        console.error('[DORY] Error fetching clusters:', clusterErr);
      }
    } catch (error) {
      console.error('[DORY] Error during cold storage sync:', error);
      
      // Report sync error to browser console clearly
      console.error('==========================================');
      console.error('DORY COLD STORAGE SYNC FAILED');
      console.error('Please check authentication and network status');
      console.error('Error details:', error);
      console.error('==========================================');
    }
  }
}

/** Set up database, event streaming, session watchers, etc. */
async function initializeServices() {
  try {
    await initDexieSystem();

    // +++ Initialize localRanker here +++
    try {
      await localRanker.initialize();
      console.log('[DORY] AdvancedLocalRanker initialized.');
    } catch (rankerError) {
        console.error('[DORY] Failed to initialize AdvancedLocalRanker:', rankerError);
        // Continue initialization even if ranker fails?
    }
    // +++ End localRanker init +++

    // Start a new session, potentially reusing a recent one
    const sid = await startNewSession(SESSION_IDLE_THRESHOLD);
    isSessionActive = true;
    console.log('[DORY] Session active =>', sid);

    // Initialize event streaming
    await initEventService();
    console.log('[DORY] Event streaming init done');

    // Initialize cold storage sync scheduler (every 5 minutes)
    ColdStorageSync.initializeScheduling();
    console.log('[DORY] Cold storage sync scheduled for 5-minute intervals');

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
    // Check if global search is enabled
    if (!ENABLE_GLOBAL_SEARCH) {
      console.log('[DORY] Global search is disabled via configuration');
      return;
    }
    
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
      // Pass the idle threshold to potentially reuse a recent session
      const newId = await startNewSession(SESSION_IDLE_THRESHOLD);
      isSessionActive = true;
      console.log('[DORY] Session active =>', newId);
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
        if (tabId !== undefined && tabToVisitId[tabId]) {
          const visitId = tabToVisitId[tabId];
          await updateVisitActiveTime(visitId, duration);

          const sessId = await getCurrentSessionId();
          const pageId = tabToPageId[tabId];
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
  messageRouter.registerHandler(MessageType.CONTENT_DATA, (msg, _sender, sendResponse) => {
    console.log('[DORY] Received CONTENT_DATA');
    try {
      // 1. Store the content data (we're going to just use a variable for now, but you could use chrome.storage if needed)
      const contentData = msg.data as ContentDataMessage;
      
      // 2. Immediately respond to the content script
      sendResponse({ status: 'received', success: true });
      
      // 3. Process content data in a separate task (using an IIFE)
      (async () => {
        try {
          console.log('[DORY] Processing content data in background task');
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
          // Could implement retry logic here if needed
        }
      })();
      
      // 4. Return false since we already called sendResponse
      return false;
    } catch (error) {
      console.error('[DORY] Error handling CONTENT_DATA message:', error);
      sendResponse({ status: 'error', error: String(error) });
      return false;
    }
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
  
  // Broadcast AUTH_RESULT message to all clients (including side panel)
  chrome.runtime.sendMessage(
    createMessage(MessageType.AUTH_RESULT, { isAuthenticated }, 'background')
  );
  console.log(`[DORY] Broadcasting AUTH_RESULT: isAuthenticated=${isAuthenticated}`);
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

    // Optionally log an event
    const db = await getDB();
    const visit = await db.visits.get(visitId);
    const sessId = await getCurrentSessionId();
    if (sessId && visit) {
      const timeSpent = Math.round((now - visit.startTime) / 1000);
      const userId = await getCurrentUserId();
      await logEvent({
        operation: EventType.PAGE_VISIT_ENDED,
        sessionId: String(sessId),
        timestamp: now,
        userId: userId || undefined,
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

// -------------------- Helper Functions (Extracted) --------------------

/**
 * Retrieves the title for a given tab ID.
 */
async function getTabTitle(tabId: number): Promise<string | null> {
  try {
    const t = await chrome.tabs.get(tabId);
    return t.title || null;
  } catch (err) {
    console.warn(`[DORY] Failed to get title for tab ${tabId}:`, err);
    return null;
  }
}

/**
 * Starts a new visit record and updates tab state maps.
 * Assumes an active session exists.
 */
async function startNewVisit(
  tabId: number,
  pageId: string,
  fromPageId?: string,
  isBackNav?: boolean
): Promise<string> {
  const sessId = await getCurrentSessionId();
  if (!sessId) {
    console.error('[DORY] Cannot start visit, no active session ID found.');
    // Potentially try ensureActiveSession() here again, or throw
    throw new Error('No active session found for startNewVisit');
  }

  console.log(`[DORY] startNewVisit => tabId=${tabId}, pageId=${pageId}, fromPageId=${fromPageId}, isBackNav=${isBackNav}`);

  const visitId = await startVisit(pageId, sessId, fromPageId, isBackNav);
  tabToVisitId[tabId] = visitId; // Ensure visitId map is updated here
  // tabToPageId should be updated *before* calling startNewVisit
  
  console.log(`[DORY] => New visit started: ${visitId}`);
  return visitId;
}

// -------------------- Unified Navigation Event Processor --------------------

/**
 * Processes navigation events from onCommitted, onHistoryStateUpdated, 
 * and onReferenceFragmentUpdated.
 * Handles ending previous visits, creating page/visit records, and updating state.
 */
async function processNavigationEvent(details: {
  tabId: number;
  url: string;
  timeStamp: number;
  frameId?: number; // Optional frameId
  transitionType?: string; // Use basic string type
  transitionQualifiers?: string[]; // Use basic string array type
}) {
  // Ignore non-main frames if frameId is available
  if (details.frameId !== undefined && details.frameId !== 0) return;

  const { tabId, url, timeStamp } = details;

  // Ignore invalid tab IDs or non-web pages
  if (tabId < 0 || !isWebPage(url)) {
    console.log(`[DORY] Skipping navigation event: Invalid tabId (${tabId}) or non-web page (${url})`);
    return;
  }

  try {
    // Ensure user is authenticated
    const isAuthenticated = await checkAuthDirect();
    if (!isAuthenticated) {
        console.log(`[DORY] Skipping navigation event for ${url}: User not authenticated.`);
        return; // Stop processing if not authenticated
    }

    // Make sure a session is active
    const sessionActive = await ensureActiveSession();
    if (!sessionActive) {
      console.warn(`[DORY] Skipping navigation event for ${url}: Could not ensure active session.`);
      return;
    }


    const lastUrl = tabToCurrentUrl[tabId];

    // Only process if the URL has meaningfully changed
    // TODO: Implement more robust URL comparison if needed (e.g., ignoring tracking params)
    if (!lastUrl || lastUrl !== url) {
      console.log(`[DORY] Navigation detected for tab ${tabId}: ${lastUrl || 'None'} => ${url}`);

      // --- State Update Logic ---
      // 1. End the previous visit for this tab (if one exists)
      await endCurrentVisit(tabId); // Ends the visit associated with lastUrl

      // 2. Get context for the new page
      const title = (await getTabTitle(tabId)) || url; // Use URL as fallback title
      const isBackNav = details.transitionQualifiers?.includes('forward_back') || false;

      // 3. Create/Get the PageRecord for the *new* URL
      // Store the previous pageId *before* potentially overwriting it in createOrGetPage or map update
      const previousPageId = tabToPageId[tabId];
      const newPageId = await createOrGetPage(url, title, timeStamp);
      
      // 4. Update state maps *before* starting the new visit
      tabToCurrentUrl[tabId] = url;
      tabToPageId[tabId] = newPageId; 

      // 5. Start the new visit record, linking from the previous page if appropriate
      // Only link if previousPageId exists and is different from newPageId
      const linkFromPageId = (previousPageId && previousPageId !== newPageId) ? previousPageId : undefined;
      await startNewVisit(tabId, newPageId, linkFromPageId, isBackNav); 
      // startNewVisit now internally updates tabToVisitId[tabId]

      console.log(`[DORY] => State updated: pageId=${newPageId}, visitId=${tabToVisitId[tabId]}`);
      // --- End State Update Logic ---

    } else {
      // console.log(`[DORY] Skipping navigation event for tab ${tabId}: URL unchanged (${url})`);
    }
  } catch (err) {
    console.error(`[DORY] Error processing navigation event for ${url} in tab ${tabId}:`, err);
  }
}

// -------------------- Navigation Handlers --------------------
chrome.webNavigation.onCommitted.addListener(async (details) => {
  // Process all committed main-frame navigations
  await processNavigationEvent(details);
});

chrome.webNavigation.onHistoryStateUpdated.addListener(async (details) => {
  // Process SPA navigations
  await processNavigationEvent(details);
});

// Add listener for hash changes
chrome.webNavigation.onReferenceFragmentUpdated.addListener(async (details) => {
  // Process hash fragment navigations
  await processNavigationEvent(details);
});

// onCreatedNavigationTarget remains separate as it links a *new* tab to a source
chrome.webNavigation.onCreatedNavigationTarget.addListener(async (details) => {
  const { sourceTabId, tabId, timeStamp, url } = details;
  console.log('[DORY] onCreatedNavigationTarget =>', { sourceTabId, tabId, url });

  // Basic checks needed
  if (!isWebPage(url)) {
    console.log('[DORY] Not a web page => skipping new tab tracking =>', url);
    return;
  }
  const isAuthenticated = await checkAuthDirect();
  if (!isAuthenticated) return;

  // --- Inlined Logic from handleOnCreatedNavigationTarget --- 
  try {
    await ensureActiveSession(); // Ensure session exists

    const oldUrl = tabToCurrentUrl[sourceTabId];
    if (oldUrl) { // Check if source tab URL is known
      // Create/get page for the source URL
      const fromPageId = await createOrGetPage(oldUrl, oldUrl, timeStamp); 
      // Store pending navigation state for the new tab
      tabToCurrentUrl[tabId] = `pending:${fromPageId}`; 
      console.log('[DORY] => Stored pending nav from pageId:', fromPageId);
    } else {
      console.log('[DORY] => Source tab URL unknown, cannot link navigation target.');
    }
  } catch (err) {
    console.error('[DORY] Error in onCreatedNavigationTarget handler:', err);
  }
  // --- End Inlined Logic ---
});

chrome.webNavigation.onCompleted.addListener(async (details) => {
  if (details.frameId !== 0) return;

  // Basic checks
  const isAuthenticated = await checkAuthDirect();
  if (!isAuthenticated || !isWebPage(details.url)) return;

  console.log(`[DORY] onCompleted => tab: ${details.tabId}, url: ${details.url}`);

  // --- Refined Extraction Trigger ---
  // Only trigger extraction if the completed URL matches the *currently tracked* URL for the active visit
  const currentTrackedUrl = tabToCurrentUrl[details.tabId];
  const visitId = tabToVisitId[details.tabId]; // Get the current visit ID for this tab

  if (visitId && currentTrackedUrl && currentTrackedUrl === details.url) {
    console.log(`[DORY] => URL matches tracked state (${currentTrackedUrl}). Triggering extraction.`);
    const pageId = tabToPageId[details.tabId]; // Get the corresponding pageId
    const sessionId = await getCurrentSessionId();

    if (pageId && sessionId) {
       console.log(`[DORY] => Sending SET_EXTRACTION_CONTEXT & TRIGGER_EXTRACTION (pageId: ${pageId}, visitId: ${visitId})`);
       // Send context first
       chrome.tabs.sendMessage(
         details.tabId,
         createMessage(MessageType.SET_EXTRACTION_CONTEXT, { pageId, visitId, sessionId }, 'background'),
         {}, // Options - empty
         (response) => { // Callback after context is set (or attempted)
            if (chrome.runtime.lastError) {
               console.warn(`[DORY] Error setting extraction context for tab ${details.tabId}:`, chrome.runtime.lastError.message);
               // Optionally retry or just proceed to trigger? For now, proceed.
            } else {
               console.log(`[DORY] => Extraction context sent response:`, response);
            }
            // Always attempt trigger after trying to set context
            chrome.tabs.sendMessage(
               details.tabId,
               createMessage(MessageType.TRIGGER_EXTRACTION, {}, 'background')
            );
         }
       );
    } else {
       console.warn(`[DORY] => Cannot trigger extraction: Missing pageId (${pageId}) or sessionId (${sessionId})`);
    }
  } else {
    console.log(`[DORY] => Skipping extraction trigger: URL mismatch (Completed: ${details.url}, Tracked: ${currentTrackedUrl}) or no active visit (VisitId: ${visitId})`);
  }
  // --- End Refined Extraction Trigger ---
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
  try {
    await endCurrentSession();
    if (idleCheckInterval) {
      clearInterval(idleCheckInterval);
    }
  } catch (err) {
    console.error('[DORY] Error onSuspend =>', err);
  }
});

// Add specific listeners for new search message types
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Ensure sender.tab exists for sending responses
  if (!sender.tab || !sender.tab.id) {
    console.warn('[DORY] Message received without sender tab ID, ignoring:', message);
    return false; // Indicate synchronous return or no response needed
  }
  const tabId = sender.tab.id;
  const query = message.query;

  if (message.type === 'PERFORM_LOCAL_SEARCH') {
    console.log(`[DORY] Received PERFORM_LOCAL_SEARCH for query: "${query}"`);
    if (!query) return true; // No query, do nothing but acknowledge

    (async () => {
      try {
        // Perform combined local search
        const historyPromise = searchHistoryAPI(query);
        const dexiePromise = localRanker.rank(query);
        const [historyResults, dexieResults] = await Promise.all([historyPromise, dexiePromise]);

        // Merge and sort using the corrected function
        const finalResults = mergeAndSortResults(historyResults, dexieResults);

        console.log(`[DORY] Sending ${finalResults.length} combined local results to tab:`, tabId);
        chrome.tabs.sendMessage(tabId, {
          type: 'SEARCH_RESULTS',
          results: finalResults
        });
      } catch (error) {
        console.error('[DORY] Error performing combined local search:', error);
        chrome.tabs.sendMessage(tabId, { type: 'SEARCH_RESULTS', results: [] });
      }
    })();

    return true; // Indicate asynchronous response

  } else if (message.type === 'PERFORM_SEMANTIC_SEARCH') {
    console.log(`[DORY] Received PERFORM_SEMANTIC_SEARCH for query: "${query}"`);
    if (!query) return true; // No query, do nothing but acknowledge

    (async () => {
      try {
        const userId = await getCurrentUserId();
        if (!userId) {
          throw new Error('User not authenticated for semantic search');
        }

        const semanticResponse = await semanticSearch(query, userId, {
          limit: 20, // Keep parameters as before
          useHybridSearch: true,
          useLLMExpansion: true,
          useReranking: true,
        });

        const semanticResults = semanticResponse as SearchResponse; // Use existing type

        // Map Semantic results to UnifiedLocalSearchResult or keep separate?
        // For now, let's send back the original structure for semantic
        // Or adapt the UI? Let's map to Unified for consistency?
        // Decision: Map to Unified for consistency in what UI receives
        const formattedResults: UnifiedLocalSearchResult[] = semanticResults.map(result => ({
          id: result.docId, // Use docId as primary ID
          url: result.url,
          title: result.title,
          score: result.score, // Add the mandatory score field
          source: 'semantic',  // Clearly mark the source as semantic
          explanation: result.explanation,
          pageId: result.pageId,
          // lastVisitTime, visitCount, typedCount will be undefined
        }));

        console.log(`[DORY] Sending ${formattedResults.length} semantic results to tab:`, tabId);
        chrome.tabs.sendMessage(tabId, {
          type: 'SEARCH_RESULTS',
          results: formattedResults
        });

      } catch (error) {
        console.error('[DORY] Error performing semantic search:', error);
        chrome.tabs.sendMessage(tabId, { type: 'SEARCH_RESULTS', results: [] });
      }
    })();

    return true; // Indicate asynchronous response
  }

  // Return false if message type wasn't handled here
  // Allow other listeners (like messageRouter) to potentially handle it
  return false;
});

// +++ NEW MERGE FUNCTION (Corrected Parameter Type) +++
/**
 * Merges and sorts results from History API and Dexie (AdvancedLocalRanker).
 * Prioritizes Dexie results for items found in both sources.
 *
 * @param historyResults Results from searchHistoryAPI.
 * @param dexieResults Results directly from localRanker.rank.
 * @returns A sorted array of UnifiedLocalSearchResult.
 */
function mergeAndSortResults(
  historyResults: UnifiedLocalSearchResult[],
  // Correct type for results from localRanker.rank
  dexieResults: Array<{ pageId: string; title: string; url: string; score: number }>
): UnifiedLocalSearchResult[] {
  const resultsMap = new Map<string, UnifiedLocalSearchResult>();

  // 1. Add history results first
  for (const result of historyResults) {
    if (result.url) { // Ensure URL exists
      // Assign default score of 1 to history results
      resultsMap.set(result.url, { ...result, source: 'history', score: 1 });
    }
  }

  // 2. Add/Update with Dexie results (prioritize Dexie data)
  for (const result of dexieResults) { // result is now the raw Dexie result type
    if (result.url) { // Ensure URL exists
      const existing = resultsMap.get(result.url);
      // Map Dexie result to UnifiedLocalSearchResult structure HERE
      const dexieUnifiedResult: UnifiedLocalSearchResult = {
        id: result.pageId, // Use pageId as ID
        url: result.url,
        title: result.title,
        source: 'dexie',
        score: result.score, // Use the mandatory 'score' field from Dexie result
        pageId: result.pageId,
        // Merge relevant fields from existing history entry
        lastVisitTime: existing?.lastVisitTime, // Keep history time if present
        visitCount: existing?.visitCount,
        typedCount: existing?.typedCount,
        // explanation: undefined, // Add if localRanker provides it
      };
      resultsMap.set(result.url, dexieUnifiedResult);
    }
  }

  // 3. Convert Map to Array
  const mergedList = Array.from(resultsMap.values());

  // 4. Implement Custom Sort: Primary by score (desc), secondary by source ('dexie' > 'history')
  mergedList.sort((a, b) => {
    // Primary sort: score descending
    const scoreDiff = b.score - a.score;
    if (scoreDiff !== 0) return scoreDiff;

    // Secondary sort: prioritize 'dexie' if scores are equal
    if (a.source === 'dexie' && b.source !== 'dexie') return -1;
    if (a.source !== 'dexie' && b.source === 'dexie') return 1;

    // Tertiary sort (optional, for history items with same default score): lastVisitTime
    if (a.source === 'history' && b.source === 'history') {
       const visitTimeDiff = (b.lastVisitTime ?? 0) - (a.lastVisitTime ?? 0);
       if (visitTimeDiff !== 0) return visitTimeDiff;
    }

    return 0; // Should only happen if scores and sources are identical
  });

  // 5. Limit total results (optional)
  const MAX_TOTAL_RESULTS = 50;
  return mergedList.slice(0, MAX_TOTAL_RESULTS);
}
// +++ END NEW MERGE FUNCTION +++