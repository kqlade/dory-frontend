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

// -------------------- Constants & State --------------------
const SESSION_IDLE_THRESHOLD = 15 * 60 * 1000; // 15 min

let isSessionActive = false;
let idleCheckInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Track data about each open tab with separate maps for different properties
 */
const tabToCurrentUrl: Record<number, string | undefined> = {};
const tabToPageId: Record<number, string> = {}; // Tracks PageID of the *last valid* visit
const tabToVisitId: Record<number, string> = {}; // Tracks VisitID of the *current valid* visit
const extractionRequestedForVisitId: Record<number, string> = {}; // Tracks the last visitId extraction was requested for

// -------------------- Initialization --------------------

// Initialize auth service
authService.init().catch(err => {
  console.error('[Background] Failed to initialize auth service:', err);
});

// Check auth state and initialize services accordingly
const currentAuthState = authService.getAuthState();
const isAuthenticated = currentAuthState.isAuthenticated;
console.log(`[Background] Auth state checked. Authenticated: ${isAuthenticated}`);
updateIcon(isAuthenticated);
if (isAuthenticated) {
  initializeServices();
}

// Expose the API to content scripts
exposeBackgroundAPI(backgroundApi);

// Initialize the extension
console.log('[Background] Service worker initializing...');

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

// -------------------- Service Initialization --------------------
async function initializeServices() {
  try {
    // 1. Get services from background API
    console.log('[Background] Initializing services...');
    
    // 2. Initialize session management
    await backgroundApi.auth.getAuthState(); // Ensure auth is initialized
    
    isSessionActive = true;
    console.log('[Background] Services initialized');
    
    // 3. Set up idle check interval (delegated to services via background API)
    idleCheckInterval = setInterval(checkSessionInactivity, 60000); // Check every minute
    
    // 4. Initialize cold storage sync scheduler
    setupScheduledTasks();
    
    // 5. Inject global search into existing tabs
    injectGlobalSearchIntoExistingTabs();
  } catch (error) {
    console.error('[Background] Services initialization error:', error);
    updateIcon(false);
  }
}

// -------------------- Command Handling --------------------

// Handle keyboard shortcut commands
chrome.commands.onCommand.addListener(async (command) => {
  console.log(`[Background] Command received: ${command}`);
  
  if (command === 'activate-global-search') {
    
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs || !tabs[0] || !tabs[0].id) {
      console.error('[Background] No active tab found');
      return;
    }
    
    const tabId = tabs[0].id;
    const url = tabs[0].url;
    
    // Skip injection for non-web pages
    if (!url || !isWebPage(url)) {
      console.log(`[Background] Skipping global search on non-web page: ${url}`);
      return;
    }
    
    // Show search overlay using the commands API via Comlink
    try {
      const success = await backgroundApi.commands.showSearchOverlay(tabId, 'toggle');
      if (success) {
        console.log(`[Background] Search overlay toggled for tab ${tabId}`);
      } else {
        console.warn(`[Background] Failed to toggle search overlay for tab ${tabId}`);
      }
    } catch (error) {
      console.error(`[Background] Error toggling search overlay:`, error);
    }
  } 
  else if (command === 'toggle-side-panel') {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs || !tabs[0] || !tabs[0].id) {
      console.error('[Background] No active tab found for side panel');
      return;
    }
    
    try {
      await chrome.sidePanel.open({ tabId: tabs[0].id });
      console.log('[Background] Side panel opened via keyboard shortcut');
    } catch (err) {
      console.error('[Background] Error opening side panel:', err);
    }
  }
  else if (command === 'toggle-cluster-view') {
    // Find the active New Tab page (if any)
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

/**
 * Helper to get the title for a given tab
 */
async function getTabTitle(tabId: number): Promise<string | null> {
  try {
    const tab = await chrome.tabs.get(tabId);
    return tab.title || null;
  } catch (err) {
    console.warn(`[Background] Failed to get title for tab ${tabId}:`, err);
    return null;
  }
}

/**
 * End a visit and update state tracking
 */
async function endCurrentVisit(tabId: number, visitId?: string): Promise<void> {
  const visitIdToEnd = visitId || tabToVisitId[tabId];
  if (!visitIdToEnd) {
    return;
  }
  
  console.log(`[Background] Ending visit => tab: ${tabId}, visitId: ${visitIdToEnd}`);
  
  try {
    const now = Date.now();
    // Use navigation service through backgroundApi - it already handles tracking internally
    await backgroundApi.navigation.endVisit(visitIdToEnd, now);
  } catch (error) {
    console.error('[Background] Error ending visit:', error);
  }
}

/**
 * Start a new visit and update tab state
 */
async function startNewVisit(
  tabId: number,
  pageId: string,
  fromPageId?: string,
  isBackNav?: boolean
): Promise<string> {
  try {
    // Get session ID through navigation service
    const sessionId = await backgroundApi.navigation.getCurrentSessionId();
    
    if (!sessionId) {
      console.error('[Background] Cannot start visit: no active session');
      throw new Error('No active session found for startNewVisit');
    }
    
    console.log(`[Background] Starting new visit: tab=${tabId}, page=${pageId}, from=${fromPageId}`);
    
    // Start visit through navigation service
    const visitId = await backgroundApi.navigation.startVisit(pageId, sessionId, fromPageId, isBackNav);
    
    // Update local state tracking
    tabToVisitId[tabId] = visitId;
    
    // Navigation service already tracks visit starts internally
    
    console.log(`[Background] New visit started: ${visitId}`);
    return visitId;
  } catch (error) {
    console.error(`[Background] Error starting visit to page ${pageId}:`, error);
    throw error;
  }
}

/**
 * Process a navigation event from any source (committed, history state, fragment)
 */
async function processNavigationEvent(details: {
  tabId: number;
  url: string;
  timeStamp: number;
  frameId?: number;
  transitionType?: string;
  transitionQualifiers?: string[];
}): Promise<void> {
  // Skip non-main frames
  if (details.frameId !== undefined && details.frameId !== 0) return;
  
  const { tabId, url, timeStamp } = details;
  
  // Basic validity checks
  if (tabId < 0 || !isWebPage(url)) {
    console.log(`[Background] Skipping navigation: invalid tab or non-web page (${url})`);
    return;
  }
  
  try {
    // Get context for the new page
    const title = (await getTabTitle(tabId)) || url;
    
    // Get previous state
    const previousVisitId = tabToVisitId[tabId];
    const pageIdFromPreviousVisit = tabToPageId[tabId];
    const previousUrl = tabToCurrentUrl[tabId];
    
    // Only process if URL has meaningfully changed
    if (!previousUrl || previousUrl !== url) {
      console.log(`[Background] Navigation in tab ${tabId}: ${previousUrl || 'None'} → ${url}`);
      
      // End previous visit if it existed
      if (previousVisitId) {
        await endCurrentVisit(tabId, previousVisitId);
      }
      
      // Clear current visit state
      delete tabToVisitId[tabId];
      delete tabToPageId[tabId];
      
      // Check if the new page should be recorded
      const isValid = shouldRecordHistoryEntry(url, title, 'processNavigationEvent');
      
      // Always update the current URL
      tabToCurrentUrl[tabId] = url;
      
      // Skip invalid pages
      if (!isValid) {
        console.log(`[Background] Filtered navigation: skipping recording for ${url}`);
        delete extractionRequestedForVisitId[tabId];
        return;
      }
      
      // For valid pages, check auth and session
      console.log(`[Background] Valid navigation: recording ${url}`);
      const authState = authService.getAuthState();
      
      if (!authState.isAuthenticated) {
        console.warn(`[Background] Skipping valid navigation: not authenticated`);
        return;
      }
      
      // Ensure session is active
      const sessionActive = await backgroundApi.navigation.ensureActiveSession();
      if (!sessionActive) {
        console.warn(`[Background] Skipping valid navigation: no active session`);
        return;
      }
      
      // Create/get page record
      const newPageId = await backgroundApi.navigation.createOrGetPage(url, title, timeStamp);
      
      // Create edge if applicable
      const isBackNav = details.transitionQualifiers?.includes('forward_back') || false;
      const sessionId = await backgroundApi.navigation.getCurrentSessionId();
      
      if (sessionId && pageIdFromPreviousVisit && pageIdFromPreviousVisit !== newPageId) {
        try {
          console.log(`[Background] Creating edge: ${pageIdFromPreviousVisit} → ${newPageId}`);
          await backgroundApi.navigation.createOrUpdateEdge(
            pageIdFromPreviousVisit,
            newPageId,
            sessionId,
            timeStamp,
            isBackNav
          );
        } catch (error) {
          console.error(`[Background] Failed to create edge:`, error);
        }
      }
      
      // Start new visit
      const newVisitId = await startNewVisit(tabId, newPageId, pageIdFromPreviousVisit, isBackNav);
      
      // Update state for new visit
      tabToPageId[tabId] = newPageId;
      tabToVisitId[tabId] = newVisitId;
      
      console.log(`[Background] State updated: pageId=${newPageId}, visitId=${newVisitId}`);
      
      // Trigger content extraction if needed
      if (extractionRequestedForVisitId[tabId] !== newVisitId) {
        console.log(`[Background] Requesting content extraction for visit ${newVisitId}`);
        try {
          // Request content extraction through API
          await backgroundApi.content.extractAndSendContent(tabId, {
            pageId: newPageId,
            visitId: newVisitId,
            sessionId: sessionId
          });
          extractionRequestedForVisitId[tabId] = newVisitId;
        } catch (error) {
          console.error(`[Background] Content extraction request failed:`, error);
        }
      }
    } else {
      console.log(`[Background] Skipping navigation: URL unchanged (${url})`);
    }
  } catch (error) {
    console.error(`[Background] Error processing navigation:`, error);
  }
}

// -------------------- Navigation Event Listeners --------------------

// Process all committed main-frame navigations
chrome.webNavigation.onCommitted.addListener(async (details) => {
  await processNavigationEvent(details);
});

// Process SPA navigations
chrome.webNavigation.onHistoryStateUpdated.addListener(async (details) => {
  await processNavigationEvent(details);
});

// Process hash fragment navigations
chrome.webNavigation.onReferenceFragmentUpdated.addListener(async (details) => {
  await processNavigationEvent(details);
});

// Handle new tabs created from existing tabs
chrome.webNavigation.onCreatedNavigationTarget.addListener(async (details) => {
  const { sourceTabId, tabId, timeStamp, url } = details;
  console.log(`[Background] Created navigation target: source=${sourceTabId}, target=${tabId}, url=${url}`);
  
  // Check if target URL should be recorded
  if (!shouldRecordHistoryEntry(url, null, 'onCreatedNavigationTarget')) {
    console.log(`[Background] Filtered navigation target: skipping ${url}`);
    return;
  }
  
  // Check auth
  const authState = authService.getAuthState();
  if (!authState.isAuthenticated) return;
  
  try {
    // Ensure active session
    const sessionActive = await backgroundApi.navigation.ensureActiveSession();
    if (!sessionActive) {
      console.warn(`[Background] Skipping navigation target: no active session`);
      return;
    }
    
    // Track relationship between source and target tabs
    const oldUrl = tabToCurrentUrl[sourceTabId];
    // Ensure sourceTitle is always a string, with a fallback to URL or a default value
    const sourceTitle = (await getTabTitle(sourceTabId)) || oldUrl || 'Unknown Page';
    
    if (oldUrl && shouldRecordHistoryEntry(oldUrl, sourceTitle, 'onCreatedNavigationTarget_SourceCheck')) {
      // Create/get page for source URL
      const fromPageId = await backgroundApi.navigation.createOrGetPage(oldUrl, sourceTitle, timeStamp);
      // Store pending navigation state
      tabToCurrentUrl[tabId] = `pending:${fromPageId}`;
      console.log(`[Background] Stored pending navigation from pageId: ${fromPageId}`);
    } else {
      console.log(`[Background] Source tab URL unknown or invalid (${oldUrl})`);
      tabToCurrentUrl[tabId] = url;
    }
  } catch (error) {
    console.error(`[Background] Error handling navigation target:`, error);
  }
});

// -------------------- Browser Event Handlers --------------------

// Handle extension icon clicks to open the side panel
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) {
    console.error('[Background] No tab ID => cannot interact with tab');
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

// Handle tab removal
chrome.tabs.onRemoved.addListener((tabId) => {
  console.log(`[Background] Tab ${tabId} removed`);
  
  // Unregister content extractor for closed tabs
  backgroundApi.content.unregisterContentExtractor(tabId);
  
  // Clean up navigation tracking state
  delete tabToCurrentUrl[tabId];
  delete tabToPageId[tabId];
  delete tabToVisitId[tabId];
  delete extractionRequestedForVisitId[tabId];
});

// Track tab creation
chrome.tabs.onCreated.addListener((tab) => {
  if (tab.id !== undefined && tab.url) {
    tabToCurrentUrl[tab.id] = tab.url;
  }
});

// -------------------- Global Search Integration --------------------

/**
 * Helper function to inject global search content script into a tab
 */
async function injectGlobalSearch(tabId: number): Promise<boolean> {
  try {
    console.log(`[Background] Injecting global search into tab ${tabId}`);
    
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['src/content/globalSearch.js']
    });
    
    return true;
  } catch (error) {
    console.error(`[Background] Failed to inject global search into tab ${tabId}:`, error);
    return false;
  }
}

/**
 * Function to inject global search into all existing tabs
 */
async function injectGlobalSearchIntoExistingTabs(): Promise<void> {
  try {
    const tabs = await chrome.tabs.query({});
    console.log(`[Background] Injecting global search into ${tabs.length} existing tabs`);
    
    let injectedCount = 0;
    for (const tab of tabs) {
      if (tab.id && tab.url && isWebPage(tab.url)) {
        try {
          const success = await injectGlobalSearch(tab.id);
          if (success) injectedCount++;
        } catch (err) {
          console.log(`[Background] Could not inject into tab ${tab.id} (${tab.url}):`, err);
        }
      }
    }
    console.log(`[Background] Successfully injected global search into ${injectedCount}/${tabs.length} tabs`);
  } catch (error) {
    console.error('[Background] Error injecting global search into existing tabs:', error);
  }
}

// -------------------- Session Management --------------------

/**
 * Check for session inactivity
 */
async function checkSessionInactivity() {
  if (!isSessionActive) return;
  
  try {
    // Use auth service to check if still authenticated
    const authState = authService.getAuthState();
    if (!authState.isAuthenticated) {
      console.log('[Background] No longer authenticated, ending session');
      cleanupServices();
      return;
    }
    
    // Update session activity tracking
    console.log('[Background] Checking session activity...');
  } catch (error) {
    console.error('[Background] Error checking session activity:', error);
  }
}

/**
 * Clean up services on session end or extension shutdown
 */
function cleanupServices() {
  console.log('[Background] Cleaning up services...');
  
  // Clear the idle interval
  if (idleCheckInterval) {
    clearInterval(idleCheckInterval);
    idleCheckInterval = null;
  }
  
  isSessionActive = false;
  console.log('[Background] Services cleaned up');
}

/**
 * Set up scheduled tasks like cold storage sync
 */
function setupScheduledTasks() {
  // Set up an alarm for cold storage sync
  chrome.alarms.create('doryColdStorageSync', {
    periodInMinutes: 5 // Every 5 minutes
  });
  
  // Listen for alarms
  chrome.alarms.onAlarm.addListener(handleAlarm);
  
  console.log('[Background] Scheduled tasks set up');
}

/**
 * Handle alarm triggers
 */
async function handleAlarm(alarm: chrome.alarms.Alarm) {
  console.log(`[Background] Alarm triggered: ${alarm.name}`);
  
  if (alarm.name === 'doryColdStorageSync') {
    const authState = authService.getAuthState();
    if (!authState.isAuthenticated) {
      console.log('[Background] Skipping task: Not authenticated');
      return;
    }
    
    console.log('[Background] Initiating cold storage sync task');
    // Would delegate to a service via background API in the full implementation
  }
}

// -------------------- Extension Lifecycle --------------------

// Handle install/update
chrome.runtime.onInstalled.addListener((details) => {
  console.log(`[Background] Extension ${details.reason}:`, details);
  
  // Inject global search on install/update
  injectGlobalSearchIntoExistingTabs();
});

// Handle suspension (service worker termination)
chrome.runtime.onSuspend.addListener(() => {
  console.log('[Background] Service worker suspending...');
  cleanupServices();
});

console.log('[Background] Service worker initialized.');

