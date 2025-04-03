/**
 * @file serviceWorker.ts
 * 
 * Background script for the Dory extension.
 * Sets up the background API, coordinates navigation, and manages extension lifecycle.
 */

import { authService } from '../services/authService';
import { backgroundApi } from './api';
import { exposeBackgroundAPI } from '../utils/comlinkSetup';
import { isWebPage, shouldRecordHistoryEntry } from '../utils/urlUtils';
import { DatabaseManager, initializeDatabase, isDatabaseInitialized } from '../db/DatabaseCore'; 
import { createColdStorageSyncer, ColdStorageSync, SYNC_SOURCE } from '../services/coldStorageService';
import { CLUSTERING_CONFIG, STORAGE_KEYS } from '../config';
// No longer need Comlink for content extraction

// -------------------- Constants & State --------------------
const SESSION_IDLE_THRESHOLD = 15 * 60 * 1000; // 15 min (from the first version)
const IDLE_CHECK_INTERVAL = 60 * 1000;         // 1 min interval between each check
const COLD_STORAGE_ALARM_NAME = 'doryColdStorageSync';
const CLUSTERING_ALARM_NAME = 'doryClusteringRefresh';

/**
 * Single flag for overall readiness (formerly `isFullyInitialized`).
 * Now named `isSessionActive` to reflect usage in the original code.
 */
let isSessionActive = false;

/**
 * Used to store the ID for the setInterval that checks session inactivity
 * (formerly `idleCheckIntervalId`).
 */
let idleCheckInterval: ReturnType<typeof setInterval> | null = null;

// -------------------- Tab Tracking --------------------
/**
 * Track data about each open tab with separate maps for different properties.
 * (Kept from the original approach in the first code snippet.)
 */
const tabToCurrentUrl: Record<number, string | undefined> = {};
const tabToPageId: Record<number, string> = {}; 
const tabToVisitId: Record<number, string> = {}; 
const extractionRequestedForVisitId: Record<number, string> = {};

// No longer tracking content extractors by tab ID - using direct messaging now

// -------------------- Initialization --------------------

/**
 * Main initialization function. Combines the old `initializeExtension` + `initializeServices`.
 * We call it `initializeExtension` to match the first version's naming.
 * Exported to allow calling from AuthService after login.
 */
export async function initializeExtension() {
  console.log('[Background] initializeExtension: Starting initialization...');
  isSessionActive = false; // Reset on each attempt

  try {
    // 1. Initialize Auth Service (Loads state from storage)
    await authService.init();
    const authState = authService.getAuthState(); // Synchronous getter after init
    console.log(`[Background] initializeExtension: Auth service initialized. Authenticated: ${authState.isAuthenticated}`);
    updateIcon(authState.isAuthenticated);

    // 2. If authenticated, proceed with DB + session. Otherwise, wait for login.
    if (authState.isAuthenticated && authState.user?.id) {
      console.log(`[Background] initializeExtension: User ${authState.user.id} authenticated.`);

      // 3. Initialize Database Core for the current user
      await initializeDatabase();
      if (!isDatabaseInitialized()) {
        throw new Error('Database failed to initialize after user authentication.');
      }
      console.log('[Background] initializeExtension: Database initialized successfully.');

      // 4. Ensure an active session
      const sessionEnsured = await backgroundApi.navigation.ensureActiveSession();
      if (!sessionEnsured) {
        throw new Error('Failed to ensure an active session.');
      }
      const currentSessionId = await backgroundApi.navigation.getCurrentSessionId();
      console.log(`[Background] initializeExtension: Active session ensured: ${currentSessionId}`);

      // Now we consider the extension "active" and "ready" immediately after session is established
      isSessionActive = true;

      // 5. Set up background tasks (idle checks, scheduled tasks, script injection, etc.)
      setupSessionInactivityCheck();
      setupScheduledTasks();
      await injectGlobalSearchIntoExistingTabs(); 

      console.log('[Background] initializeExtension: Initialization complete and successful!');
    } else {
      console.log('[Background] initializeExtension: User not authenticated. Waiting for login.');
      // Cleanup any tasks from a previous session to stay consistent with original
      cleanupServices();
    }
  } catch (error) {
    console.error('[Background] initializeExtension: Initialization failed:', error);
    isSessionActive = false;
    updateIcon(false);
    cleanupServices();
  }
}

// Start initialization on service worker startup
initializeExtension();

// Expose the background API (as in the original)
exposeBackgroundAPI(backgroundApi);

// Set up message listener for basic tab ID requests
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_CURRENT_TAB_ID' && sender.tab?.id) {
    // Handle tab ID request
    sendResponse({ tabId: sender.tab.id });
    return true;
  }
  return false;
});

console.log('[Background] Service worker global scope initialized.');

// -------------------- Auth State Listener --------------------
/**
 * In the new version, we have an `onStateChange` subscription.
 * We re-initialize or clean up based on login/logout events.
 */
authService.onStateChange(async (newState) => {
  console.log('[Background] Auth state changed:', newState.isAuthenticated);
  updateIcon(newState.isAuthenticated);

  // Only handle logout - no reinitialization on login to prevent loops
  if (!newState.isAuthenticated && isSessionActive) {
    console.log('[Background] User logged out => cleaning up...');
    cleanupServices();
    isSessionActive = false;
    DatabaseManager.setCurrentUser('');
  }
  // Login is handled by the login method itself or the initial startup
});

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

// -------------------- Command Handling --------------------
chrome.commands.onCommand.addListener(async (command) => {
  console.log(`[Background] Command received: ${command}`);

  // In the original code, we often skip commands if not authenticated or session is not active
  if (!isSessionActive && command !== 'toggle-side-panel') {
    console.warn(`[Background] Command '${command}' ignored: Extension not fully active.`);
    return;
  }

  if (command === 'activate-global-search') {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs?.[0];

    if (!tab?.id || !tab.url) {
      console.error('[Background] No active tab found for global search.');
      return;
    }
    if (!isWebPage(tab.url)) {
      console.log(`[Background] Skipping global search on non-web page: ${tab.url}`);
      return;
    }

    console.log(`[Background] Attempting to toggle search overlay for tab ${tab.id}`);
    try {
      const success = await backgroundApi.commands.showSearchOverlay(tab.id, 'toggle');
      if (!success) {
        console.warn(`[Background] Toggling search overlay failed. Attempting script injection on tab ${tab.id}.`);
        await injectGlobalSearch(tab.id);
        // Retry after injection:
        await backgroundApi.commands.showSearchOverlay(tab.id, 'toggle');
      }
    } catch (error) {
      console.error(`[Background] Error toggling search overlay for tab ${tab.id}:`, error);
    }
  } 
  else if (command === 'toggle-side-panel') {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs?.[0]?.id) {
        await chrome.sidePanel.open({ tabId: tabs[0].id });
        console.log('[Background] Side panel opened via keyboard shortcut');
      } else {
        console.error('[Background] No active tab found for side panel toggle.');
      }
    } catch (err) {
      console.error('[Background] Error opening side panel:', err);
    }
  }
  else if (command === 'toggle-cluster-view') {
    // Old code used the same approach: check active tab => if it's New Tab => send message
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs && tabs[0] && tabs[0].id && tabs[0].url?.startsWith('chrome://newtab')) {
      try {
        await chrome.tabs.sendMessage(tabs[0].id, { type: 'TOGGLE_CLUSTER_VIEW' });
        console.log('[Background] Sent TOGGLE_CLUSTER_VIEW message to New Tab');
      } catch (err) {
        console.error('[Background] Failed to send TOGGLE_CLUSTER_VIEW message:', err);
      }
    } else {
      console.log('[Background] toggle-cluster-view command ignored: Not on New Tab page.');
    }
  }
});

// -------------------- Navigation & History Tracking --------------------
// Re-implemented with the new code's checks for `isSessionActive` (old name was `isFullyInitialized`).
// Also preserving the old function names and style.

async function getTabTitle(tabId: number): Promise<string | null> {
  try {
    const tab = await chrome.tabs.get(tabId);
    return tab.title || null;
  } catch (err) {
    console.warn(`[Background] Failed to get title for tab ${tabId}:`, err);
    return null;
  }
}

async function endCurrentVisit(tabId: number, visitId?: string): Promise<void> {
  const visitIdToEnd = visitId || tabToVisitId[tabId];
  if (!visitIdToEnd) {
    return;
  }
  console.log(`[Background] Ending visit => tab: ${tabId}, visitId: ${visitIdToEnd}`);
  try {
    await backgroundApi.navigation.endVisit(visitIdToEnd, Date.now());
  } catch (error) {
    console.error(`[Background] Error ending visit ${visitIdToEnd}:`, error);
  }
}

/**
 * Main function to handle navigation events (onCommitted, onHistoryStateUpdated, etc.)
 * Renamed from `processNavigationEvent` in the new code, but we keep that name for clarity.
 */
async function processNavigationEvent(details: {
  tabId: number;
  url?: string;
  timeStamp?: number;
  frameId?: number;
  transitionType?: string;
  transitionQualifiers?: string[];
}) {
  if (details.frameId !== undefined && details.frameId !== 0) return; // Skip non-main frames

  const { tabId, url, timeStamp } = details;
  if (!url || tabId < 0 || !isWebPage(url)) {
    return; 
  }

  // Check readiness
  if (!isSessionActive) {
    console.warn(`[Background] Skipping navigation for ${url}: Extension/session not active.`);
    return;
  }

  try {
    const title = (await getTabTitle(tabId)) || url;
    const previousVisitId = tabToVisitId[tabId];
    const pageIdFromPreviousVisit = tabToPageId[tabId];
    const previousUrl = tabToCurrentUrl[tabId];

    // Only process if URL has changed
    if (!previousUrl || previousUrl !== url) {
      console.log(`[Background] Navigation in tab ${tabId}: ${previousUrl || 'None'} -> ${url}`);

      // End the old visit
      if (previousVisitId) {
        await endCurrentVisit(tabId, previousVisitId);
      }

      // Clear old state for this tab
      delete tabToVisitId[tabId];
      delete tabToPageId[tabId];
      tabToCurrentUrl[tabId] = url; // Always update the new URL

      const validEntry = shouldRecordHistoryEntry(url, title, 'processNavigationEvent');
      if (!validEntry) {
        console.log(`[Background] Filtered navigation, skipping record for ${url}`);
        delete extractionRequestedForVisitId[tabId];
        return;
      }

      // Must have active session
      const sessionId = await backgroundApi.navigation.getCurrentSessionId();
      if (!sessionId) {
        console.error('[Background] No active session found despite isSessionActive = true');
        return;
      }

      // Create/Get the new page, build an edge from old page if relevant
      const newPageId = await backgroundApi.navigation.createOrGetPage(url, title, timeStamp || Date.now());

      const isBackNav = details.transitionQualifiers?.includes('forward_back') || false;
      if (pageIdFromPreviousVisit && pageIdFromPreviousVisit !== newPageId) {
        try {
          console.log(`[Background] Creating edge: ${pageIdFromPreviousVisit} -> ${newPageId}`);
          await backgroundApi.navigation.createOrUpdateEdge(
            pageIdFromPreviousVisit,
            newPageId,
            sessionId,
            timeStamp || Date.now(),
            isBackNav
          );
        } catch (err) {
          console.error('[Background] Failed to create edge:', err);
        }
      }

      // Start new visit
      const newVisitId = await backgroundApi.navigation.startVisit(newPageId, sessionId, pageIdFromPreviousVisit, isBackNav);
      tabToPageId[tabId] = newPageId;
      tabToVisitId[tabId] = newVisitId;
      console.log(`[Background] State updated for tab ${tabId}: pageId=${newPageId}, visitId=${newVisitId}`);

      // Request extraction if not already requested
      if (extractionRequestedForVisitId[tabId] !== newVisitId) {
        console.log(`[Background] Requesting content extraction for visit ${newVisitId}`);
        try {
          const extractionSuccess = await backgroundApi.content.extractAndSendContent(tabId, {
            pageId: newPageId,
            visitId: newVisitId,
            sessionId
          });
          if (extractionSuccess) {
            extractionRequestedForVisitId[tabId] = newVisitId;
          } else {
            console.warn(`[Background] Content extraction request failed for visit ${newVisitId}`);
          }
        } catch (exErr) {
          console.error(`[Background] Content extraction error:`, exErr);
        }
      }
    } 
    else {
      // console.log(`[Background] Skipping navigation: URL unchanged (${url})`);
    }
  } catch (error) {
    console.error(`[Background] Error processing navigation for ${url}:`, error);
    // In case of an error, remove partial state:
    delete tabToVisitId[tabId];
    delete tabToPageId[tabId];
    delete extractionRequestedForVisitId[tabId];
    tabToCurrentUrl[tabId] = url; 
  }
}

// -------------------- Navigation Event Listeners --------------------
chrome.webNavigation.onCommitted.addListener(processNavigationEvent);
chrome.webNavigation.onHistoryStateUpdated.addListener(processNavigationEvent);
chrome.webNavigation.onReferenceFragmentUpdated.addListener(processNavigationEvent);

chrome.webNavigation.onCreatedNavigationTarget.addListener(async (details) => {
  const { sourceTabId, tabId, timeStamp, url } = details;
  console.log(`[Background] Created navigation target: source=${sourceTabId}, target=${tabId}, url=${url}`);

  if (!isSessionActive) {
    console.warn(`[Background] Skipping created navigation target for ${url}: Not active yet.`);
    return;
  }
  if (!shouldRecordHistoryEntry(url, null, 'onCreatedNavigationTarget')) {
    console.log(`[Background] Filtered navigation target: skipping ${url}`);
    return;
  }

  try {
    const sessionActive = await backgroundApi.navigation.ensureActiveSession();
    if (!sessionActive) {
      console.warn('[Background] Skipping new target: no active session (unexpected).');
      return;
    }

    const oldUrl = tabToCurrentUrl[sourceTabId];
    const sourceTitle = (await getTabTitle(sourceTabId)) || oldUrl || 'Unknown Page';

    if (oldUrl && shouldRecordHistoryEntry(oldUrl, sourceTitle, 'onCreatedNavigationTarget_SourceCheck')) {
      const fromPageId = await backgroundApi.navigation.createOrGetPage(oldUrl, sourceTitle, timeStamp);
      tabToCurrentUrl[tabId] = url;
      console.log(`[Background] New tab ${tabId} created from source pageId=${fromPageId}`);
    } else {
      console.log(`[Background] Source tab ${sourceTabId} URL unknown/invalid (${oldUrl}), setting target URL directly.`);
      tabToCurrentUrl[tabId] = url;
    }
  } catch (error) {
    console.error('[Background] Error handling navigation target:', error);
  }
});

// -------------------- Browser Event Handlers --------------------
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id) {
    console.error('[Background] No tab ID => cannot open side panel');
    return;
  }
  try {
    console.log('[Background] Opening side panel for authentication');
    await chrome.sidePanel.open({ tabId: tab.id });
  } catch (err) {
    console.error('[Background] Error opening side panel:', err);
  }
});

// -------------------- Tab Lifecycle Management --------------------
chrome.tabs.onRemoved.addListener((tabId) => {
  console.log(`[Background] Tab ${tabId} removed`);
  // No longer need to unregister content extractor with direct messaging
  backgroundApi.commands.unregisterCommandHandler?.(tabId); // If the new code had this method

  delete tabToCurrentUrl[tabId];
  delete tabToPageId[tabId];
  delete tabToVisitId[tabId];
  delete extractionRequestedForVisitId[tabId];
});

chrome.tabs.onCreated.addListener((tab) => {
  if (tab.id !== undefined && tab.url) {
    tabToCurrentUrl[tab.id] = tab.url;
  }
});

// -------------------- Global Search Integration --------------------
async function injectGlobalSearch(tabId: number): Promise<boolean> {
  // The path must match your actual content script build output
  const scriptPath = 'src/content/globalSearch.tsx';

  try {
    console.log(`[Background] Injecting global search script (${scriptPath}) into tab ${tabId}`);
    await chrome.scripting.executeScript({
      target: { tabId },
      files: [scriptPath]
    });
    console.log(`[Background] Successfully executed script injection for tab ${tabId}`);
    return true;
  } catch (error: any) {
    if (error.message?.includes('Cannot access') || error.message?.includes('extension context')) {
      console.warn(`[Background] Cannot inject script into tab ${tabId}: ${error.message}`);
    } else if (error.message?.includes('No tab with id')) {
      console.warn(`[Background] Tab ${tabId} not found (closed?).`);
    } else if (error.message?.includes('Could not load file')) {
      console.error(`[Background] Check your build output path for ${scriptPath}. Error: ${error.message}`);
    } else {
      console.error(`[Background] Failed to inject global search into tab ${tabId}:`, error);
    }
    return false;
  }
}

async function injectGlobalSearchIntoExistingTabs(): Promise<void> {
  if (!isSessionActive) {
    console.warn('[Background] Skipping injection into existing tabs: Session not active.');
    return;
  }
  try {
    const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
    console.log(`[Background] Attempting to inject global search into ${tabs.length} existing web tabs`);

    let injectedCount = 0;
    const injectionPromises = tabs.map(async (tab) => {
      if (tab.id && tab.url) {
        const success = await injectGlobalSearch(tab.id);
        if (success) injectedCount++;
      }
    });

    await Promise.allSettled(injectionPromises);
    console.log(`[Background] Finished injections. Successfully injected into ${injectedCount}/${tabs.length} tabs`);
  } catch (error) {
    console.error('[Background] Error querying tabs for injection:', error);
  }
}

// -------------------- Session Management & Idle Check --------------------
/**
 * Replaces `setupIdleCheck` from the new code with the original naming approach:
 * Now called `setupSessionInactivityCheck`.
 */
function setupSessionInactivityCheck() {
  if (idleCheckInterval) {
    clearInterval(idleCheckInterval);
  }
  console.log('[Background] Setting up session inactivity check interval.');
  idleCheckInterval = setInterval(checkSessionInactivity, IDLE_CHECK_INTERVAL);

  // In the new approach, we also track system idle/locked states:
  chrome.idle.onStateChanged.addListener(async (newState) => {
    console.log(`[Background] Idle state changed: ${newState}`);
    if (newState === 'idle' || newState === 'locked') {
      await backgroundApi.navigation.endCurrentSession();
    } else if (newState === 'active' && isSessionActive) {
      await backgroundApi.navigation.ensureActiveSession();
    }
  });
}

/**
 * Replaces `checkIdleState` from the new version with the original name `checkSessionInactivity`.
 */
async function checkSessionInactivity() {
  if (!isSessionActive) return; // Don't check if not active

  try {
    const state = await chrome.idle.queryState(SESSION_IDLE_THRESHOLD / 1000);
    if (state === 'idle') {
      console.log('[Background] Session idle threshold reached, ending session.');
      await backgroundApi.navigation.endCurrentSession();
    }
    // else if (state === 'active') {
    //   Could optionally refresh session or do something here.
    // }
  } catch (error) {
    console.error('[Background] Error checking session inactivity:', error);
  }
}

// -------------------- Cleanup & Scheduled Tasks --------------------
function cleanupServices() {
  console.log('[Background] Cleaning up background tasks...');
  if (idleCheckInterval) {
    clearInterval(idleCheckInterval);
    idleCheckInterval = null;
    console.log('[Background] Cleared session inactivity interval.');
  }
  isSessionActive = false;
  console.log('[Background] Background tasks cleaned up.');
}

function setupScheduledTasks() {
  // Setup cold storage sync alarm
  ColdStorageSync.initializeScheduling();
  
  // Setup clustering refresh alarm
  chrome.alarms.clear(CLUSTERING_ALARM_NAME);
  chrome.alarms.create(CLUSTERING_ALARM_NAME, {
    periodInMinutes: CLUSTERING_CONFIG.REFRESH_INTERVAL_MINUTES,
    when: Date.now() + CLUSTERING_CONFIG.INITIAL_DELAY_MS
  });
  
  console.log('[Background] Scheduled tasks (Cold Storage Sync, Clustering Refresh) set up.');
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  console.log(`[Background] Alarm triggered: ${alarm.name}`);
  if (alarm.name === COLD_STORAGE_ALARM_NAME) {
    if (!isSessionActive) {
      console.log('[Background] Skipping cold storage sync: Session not active.');
      return;
    }
    console.log('[Background] Initiating cold storage sync task.');
    const syncer = createColdStorageSyncer(SYNC_SOURCE.ALARM);
    await syncer.performSync();
  }
  else if (alarm.name === CLUSTERING_ALARM_NAME) {
    if (!isSessionActive) {
      console.log('[Background] Skipping clustering refresh: Session not active.');
      return;
    }
    
    console.log('[Background] Initiating scheduled clustering refresh');
    
    try {
      // ClusteringService now handles polling in the service worker context
      const jobId = await backgroundApi.clusters.triggerClustering();
      console.log(`[Background] Started clustering job: ${jobId}`);
    } catch (error) {
      console.error('[Background] Error starting clustering job:', error);
    }
  }
});

// -------------------- Extension Lifecycle --------------------
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log(`[Background] Extension ${details.reason}:`, details);
  if (details.reason === 'install' || details.reason === 'update') {
    await initializeExtension();
  }
});

chrome.runtime.onSuspend?.addListener(() => {
  console.log('[Background] Service worker suspending...');
  cleanupServices();
});

chrome.runtime.onStartup?.addListener(async () => {
  console.log('[Background] Extension startup detected.');
  await initializeExtension();
});

// Example message listener for tab ID requests
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_CURRENT_TAB_ID') {
    if (sender.tab?.id !== undefined) {
      sendResponse({ tabId: sender.tab.id });
    } else {
      console.warn('[Background] GET_CURRENT_TAB_ID request from non-tab context:', sender);
      sendResponse({ tabId: undefined });
    }
    return true;
  }
  return false;
});

console.log('[Background] Service worker final initialization complete.');