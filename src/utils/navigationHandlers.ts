/**
 * @file navigationHandlers.ts
 * 
 * Logic for handling onCommitted & onCreatedNavigationTarget 
 * in a separate module for clarity.
 */

import { createOrGetPage, createOrUpdateEdge } from './dexieBrowsingStore';
import { getCurrentSessionId } from './dexieSessionManager';
import { isWebPage } from '../utils/urlUtils';

export interface TabTracking {
  tabToCurrentUrl: Record<number, string | undefined>;
  tabToPageId: Record<number, string>;
  tabToVisitId: Record<number, string>;
  startNewVisit: (
    tabId: number,
    pageId: string,
    fromPageId?: string,
    isBackNav?: boolean
  ) => Promise<string>;
  ensureActiveSession: () => Promise<void>;
  getTabTitle: (tabId: number) => Promise<string | null>;
}

/**
 * Handle completed navigations in the main frame.
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
  if (details.frameId !== 0) return; // only main frame

  const { tabId, url, timeStamp, transitionType, transitionQualifiers } = details;
  console.log('[DORY] onCommitted =>', { tabId, url, transitionType, transitionQualifiers });

  // Filter out non-web pages (chrome://, extension://, file://, etc.)
  if (!isWebPage(url)) {
    console.log('[DORY] Not a web page => skipping navigation tracking =>', url);
    return;
  }

  try {
    await tracking.ensureActiveSession();

    const isBackNav = transitionQualifiers.includes('forward_back');
    console.log('[DORY] => Navigation type:', isBackNav ? 'BACK/FORWARD' : transitionType.toUpperCase());
    
    const title = (await tracking.getTabTitle(tabId)) || url;
    const currentTabValue = tracking.tabToCurrentUrl[tabId];
    
    // Create the "toPageId"
    const toPageId = await createOrGetPage(url, title, timeStamp);
    tracking.tabToCurrentUrl[tabId] = url;

    if (currentTabValue && currentTabValue.startsWith('pending:')) {
      // new tab scenario
      const fromPageId = currentTabValue.substring(8);
      const sessionId = await getCurrentSessionId();
      if (sessionId) {
        await createOrUpdateEdge(fromPageId, toPageId, sessionId, timeStamp, isBackNav);
        await tracking.startNewVisit(tabId, toPageId, fromPageId, isBackNav);
      }
    } else if (currentTabValue && currentTabValue !== url) {
      // same tab navigation scenario
      const fromPageId = await createOrGetPage(currentTabValue, currentTabValue, timeStamp);
      const sessionId = await getCurrentSessionId();
      if (sessionId) {
        await createOrUpdateEdge(fromPageId, toPageId, sessionId, timeStamp, isBackNav);
        await tracking.startNewVisit(tabId, toPageId, fromPageId, isBackNav);
      }
    } else {
      // Direct or typed nav
      await tracking.startNewVisit(tabId, toPageId);
    }
  } catch (err) {
    console.error('[DORY] handleOnCommitted error =>', err);
  }
}

/**
 * Handle new tab creation from a link (target="_blank", etc.).
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
  const { sourceTabId, tabId, timeStamp, url } = details;
  console.log('[DORY] onCreatedNavigationTarget =>', { sourceTabId, tabId, url });

  // Filter out non-web pages (chrome://, extension://, file://, etc.)
  if (!isWebPage(url)) {
    console.log('[DORY] Not a web page => skipping new tab tracking =>', url);
    return;
  }

  try {
    await tracking.ensureActiveSession();

    const oldUrl = tracking.tabToCurrentUrl[sourceTabId];
    if (oldUrl && !oldUrl.startsWith('pending:')) {
      const fromPageId = await createOrGetPage(oldUrl, oldUrl, timeStamp);
      tracking.tabToCurrentUrl[tabId] = `pending:${fromPageId}`;
      console.log('[DORY] => stored pending nav from pageId:', fromPageId);
    }
  } catch (err) {
    console.error('[DORY] handleOnCreatedNavigationTarget error =>', err);
  }
}