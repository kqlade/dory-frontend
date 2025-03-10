/**
 * @file navigationHandlers.ts
 * 
 * Houses logic for handling onCommitted and onCreatedNavigationTarget 
 * in a separate module to improve code organization and testability.
 */

import { createOrGetPage, createOrUpdateEdge } from './dexieBrowsingStore';
import { getCurrentSessionId } from './dexieSessionManager';

export interface TabTracking {
  tabToCurrentUrl: Record<number, string | undefined>;
  tabToPageId: Record<number, number>;
  tabToVisitId: Record<number, string>;
  startNewVisit: (
    tabId: number,
    pageId: number,
    fromPageId?: number,
    isBackNav?: boolean
  ) => Promise<string>;
  ensureActiveSession: () => Promise<void>;
  getTabTitle: (tabId: number) => Promise<string | null>;
}

/**
 * Handle completed navigations (after redirects).
 * Moved from the inline onCommitted listener.
 */
export async function handleOnCommitted(
  details: {
    frameId: number;
    tabId: number;
    url: string;
    timeStamp: number;
    transitionType: string;
    transitionQualifiers: string[];
  },
  tracking: TabTracking
): Promise<void> {
  // Only handle main frame
  if (details.frameId !== 0) return;

  try {
    const { tabId, url, timeStamp, transitionType, transitionQualifiers } = details;
    console.log('[DORY] INFO:', 'onCommitted => navigation', { tabId, url, transitionType, transitionQualifiers });

    await tracking.ensureActiveSession();

    // Check if it's a back/forward navigation
    const isBackNav = transitionQualifiers.includes('forward_back');
    console.log('[DORY] INFO:', 'Navigation type:', isBackNav ? 'BACK/FORWARD' : transitionType.toUpperCase());

    // Get title
    const title = await tracking.getTabTitle(tabId) || url;

    // Get current URL for this tab
    const currentTabValue = tracking.tabToCurrentUrl[tabId];
    
    // Create/get the destination page
    const toPageId = await createOrGetPage(url, title, timeStamp);

    // Update tab-URL mapping
    tracking.tabToCurrentUrl[tabId] = url;

    // 1. Handle pending navigation from a new tab
    if (currentTabValue && currentTabValue.startsWith('pending:')) {
      const fromPageId = parseInt(currentTabValue.substring(8));
      const sessionId = await getCurrentSessionId();
      if (sessionId) {
        await createOrUpdateEdge(fromPageId, toPageId, sessionId, timeStamp, isBackNav);
        console.log('[DORY] INFO:', 'Created/updated new-tab-edge', { fromPageId, toPageId, title, isBackNav });
        await tracking.startNewVisit(tabId, toPageId, fromPageId, isBackNav);
      }
    } 
    // 2. Handle same-tab navigation
    else if (currentTabValue && currentTabValue !== url) {
      const fromPageId = await createOrGetPage(currentTabValue, currentTabValue, timeStamp);
      const sessionId = await getCurrentSessionId();
      if (sessionId) {
        await createOrUpdateEdge(fromPageId, toPageId, sessionId, timeStamp, isBackNav);
        console.log('[DORY] INFO:', 'Created/updated same-tab-edge', { fromPageId, toPageId, title, isBackNav });
        await tracking.startNewVisit(tabId, toPageId, fromPageId, isBackNav);
      }
    }
    // 3. Otherwise direct nav (typed/bookmark/etc.)
    else {
      await tracking.startNewVisit(tabId, toPageId);
    }
  } catch (err) {
    console.error('[DORY] ERROR:', 'handleOnCommitted threw an error', { details, error: err });
  }
}

/**
 * Handle new tab creation from a link (target="_blank", etc.).
 * Moved from the inline onCreatedNavigationTarget listener.
 */
export async function handleOnCreatedNavigationTarget(
  details: {
    sourceTabId: number;
    tabId: number;
    timeStamp: number;
    url: string;
  },
  tracking: TabTracking
): Promise<void> {
  const { sourceTabId, tabId, timeStamp } = details;
  try {
    console.log('[DORY] INFO:', 'onCreatedNavigationTarget => details', { sourceTabId, tabId });

    await tracking.ensureActiveSession();

    const oldUrl = tracking.tabToCurrentUrl[sourceTabId];
    if (oldUrl && !oldUrl.startsWith('pending:')) {
      const fromPageId = await createOrGetPage(oldUrl, oldUrl, timeStamp);
      tracking.tabToCurrentUrl[tabId] = `pending:${fromPageId}`;
      console.log('[DORY] INFO:', 'Stored pending navigation', { fromPageId, tabId });
    }
  } catch (err) {
    console.error('[DORY] ERROR:', 'handleOnCreatedNavigationTarget threw an error', { details, error: err });
  }
}