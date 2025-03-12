// src/background/serviceWorker.ts

import { messageRouter, MessageType, createMessage, ContentDataMessage } from '../utils/messageSystem';
import {
  startNewSession, endCurrentSession, getCurrentSessionId,
  checkSessionIdle, updateSessionActivityTime
} from '../utils/dexieSessionManager';
import {
  createOrGetPage, endVisit, startVisit,
  updateActiveTimeForPage, updateVisitActiveTime, getDB
} from '../utils/dexieBrowsingStore';
import { initDexieSystem } from '../utils/dexieInit';
import { initEventService, sendContentEvent } from '../services/eventService';
import { logEvent } from '../utils/dexieEventLogger';
import { EventType } from '../api/types';
import { getUserInfo } from '../auth/googleAuth';
import { isWebPage } from '../utils/urlUtils';

// Navigation handlers
import {
  handleOnCommitted,
  handleOnCreatedNavigationTarget
} from '../utils/navigationHandlers';

console.log('[DORY] Service Worker starting up...');

// Idle threshold, session state
const SESSION_IDLE_THRESHOLD = 15 * 60 * 1000; // 15 min
let isSessionActive = false;
let isAuthenticated = false;
let idleCheckInterval: ReturnType<typeof setInterval> | null = null;

// Maps for tab tracking
const tabToCurrentUrl: Record<number, string> = {};
const tabToPageId: Record<number, string> = {};
const tabToVisitId: Record<number, string> = {};

async function initialize() {
  console.log('[DORY] Initializing extension...');

  try {
    const user = await getUserInfo();
    if (!user || !user.id) {
      console.log('[DORY] Not authenticated => disabling extension');
      isAuthenticated = false;
      chrome.action.onClicked.addListener(handleUnauthClick);
      chrome.action.setIcon({
        path: {
          16: '/icons/dory_logo_gray_16x16.png',
          48: '/icons/dory_logo_gray_48x48.png',
          128: '/icons/dory_logo_gray_128x128.png'
        }
      });
      return;
    }
    isAuthenticated = true;
    console.log('[DORY] Authenticated =>', user.email);
    chrome.action.setIcon({
      path: {
        16: '/icons/dory_logo_16x16.png',
        48: '/icons/dory_logo_48x48.png',
        128: '/icons/dory_logo_128x128.png'
      }
    });
  } catch (err) {
    console.error('[DORY] Auth error =>', err);
    return;
  }

  const dbOk = await initDexieSystem();
  if (!dbOk) {
    console.log('[DORY] Dexie init failed => disabling');
    chrome.action.onClicked.removeListener(handleExtIconClick);
    chrome.action.onClicked.addListener(handleUnauthClick);
    chrome.action.setIcon({
      path: {
        16: '/icons/dory_logo_gray_16x16.png',
        48: '/icons/dory_logo_gray_48x48.png',
        128: '/icons/dory_logo_gray_128x128.png'
      }
    });
    return;
  }
  console.log('[DORY] Dexie DB system ready');

  messageRouter.initialize();
  registerMessageHandlers();

  const sid = await startNewSession();
  isSessionActive = true;
  console.log('[DORY] Started session =>', sid);

  await initEventService();
  console.log('[DORY] Event streaming init done');

  idleCheckInterval = setInterval(checkSessionInactivity, 60_000);

  chrome.action.onClicked.removeListener(handleUnauthClick);
  chrome.action.onClicked.addListener(handleExtIconClick);
}

async function handleUnauthClick() {
  console.log('[DORY] Unauth icon => start auth flow');
  try {
    const user = await getUserInfo();
    if (user?.id) {
      console.log('[DORY] Auth success => re-init');
      await initialize();
    } else {
      console.log('[DORY] Auth canceled or failed');
    }
  } catch (err) {
    console.error('[DORY] handleUnauthClick error =>', err);
  }
}

function handleExtIconClick() {
  chrome.tabs.create({});
}

async function checkSessionInactivity() {
  const ended = await checkSessionIdle(SESSION_IDLE_THRESHOLD);
  if (ended) {
    isSessionActive = false;
    console.log('[DORY] Session ended due to inactivity');
  }
}

async function ensureActiveSession() {
  if (!isSessionActive) {
    const newId = await startNewSession();
    isSessionActive = true;
    console.log('[DORY] new session =>', newId);
  }
}

async function endCurrentVisit(tabId: number) {
  const visitId = tabToVisitId[tabId];
  if (!visitId) return;
  
  const now = Date.now();
  try {
    await endVisit(visitId, now);
    const db = await getDB();
    const visit = await db.visits.get(visitId);
    const sessId = await getCurrentSessionId();
    if (sessId && visit) {
      const user = await getUserInfo();
      const timeSpent = Math.round((now - visit.startTime) / 1000);
      await logEvent({
        operation: EventType.PAGE_VISIT_ENDED,
        sessionId: String(sessId),
        timestamp: now,
        userId: user?.id,
        userEmail: user?.email,
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

/** Listen for messages from content script */
function registerMessageHandlers() {
  // ACTIVITY_EVENT => track usage
  messageRouter.registerHandler(MessageType.ACTIVITY_EVENT, async (msg, sender) => {
    const { isActive, pageUrl, duration } = msg.data;
    console.log('[DORY] ACTIVITY_EVENT =>', msg.data);

    if (isActive) await ensureActiveSession();
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

  // EXTRACTION_COMPLETE => final logging
  messageRouter.registerHandler(MessageType.EXTRACTION_COMPLETE, async (msg) => {
    console.log('[DORY] EXTRACTION_COMPLETE =>', msg.data);
    const { title, url, timestamp } = msg.data;
    await ensureActiveSession();
    const pageId = await createOrGetPage(url, title, timestamp);
    const sessId = await getCurrentSessionId();
    console.log('[DORY] ✅ Extraction finished =>', title, url, ' => pageId=', pageId, 'session=', sessId);
    return true;
  });

  // EXTRACTION_ERROR => just log
  messageRouter.registerHandler(MessageType.EXTRACTION_ERROR, async (msg) => {
    console.error('[DORY] ❌ EXTRACTION FAILED =>', msg.data);
    return true;
  });

  // CONTENT_DATA => send to API
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

  // Default fallback
  messageRouter.setDefaultHandler((m, s, resp) => {
    console.warn('[DORY] Unhandled message =>', m);
    resp({ error: 'Unhandled' });
  });
}

// Kick off init
initialize();

/**
 * On navigation => use your navigationHandlers for onCommitted
 */
chrome.webNavigation.onCommitted.addListener(async (details) => {
  if (!details || details.frameId !== 0) return;
  await handleOnCommitted(details, {
    tabToCurrentUrl,
    tabToPageId,
    tabToVisitId,
    startNewVisit: async (tabId, pageId, fromPageId, isBackNav) => {
      await ensureActiveSession();
      const sessId = await getCurrentSessionId();
      if (!sessId) throw new Error('No active session');
      const visitId = await startVisit(pageId, sessId, fromPageId, isBackNav);
      tabToVisitId[tabId] = visitId;
      tabToPageId[tabId] = pageId;
      return visitId;
    },
    ensureActiveSession: async () => ensureActiveSession(),
    getTabTitle: async (tid) => {
      try {
        const tab = await chrome.tabs.get(tid);
        return tab.title || null;
      } catch {
        return null;
      }
    }
  });
});

/** handle new tab creation => handleOnCreatedNavigationTarget */
chrome.webNavigation.onCreatedNavigationTarget.addListener(async (details) => {
  await handleOnCreatedNavigationTarget(details, {
    tabToCurrentUrl,
    tabToPageId,
    tabToVisitId,
    startNewVisit: async (tabId, pageId, fromPageId, isBackNav) => {
      await ensureActiveSession();
      const sessId = await getCurrentSessionId();
      if (!sessId) throw new Error('No active session');
      const visitId = await startVisit(pageId, sessId, fromPageId, isBackNav);
      tabToVisitId[tabId] = visitId;
      tabToPageId[tabId] = pageId;
      return visitId;
    },
    ensureActiveSession: async () => ensureActiveSession(),
    getTabTitle: async (tid) => {
      try {
        const tab = await chrome.tabs.get(tid);
        return tab.title || null;
      } catch {
        return null;
      }
    }
  });
});

/**
 * On page load complete => if it's a valid web page, send two-step message:
 * 1) SET_EXTRACTION_CONTEXT => once acked, 2) TRIGGER_EXTRACTION
 */
chrome.webNavigation.onCompleted.addListener(async (details) => {
  if (details.frameId !== 0) return;
  console.log('[DORY] onCompleted =>', details.tabId, details.url);

  if (!isWebPage(details.url)) {
    console.log('[DORY] Not a web page => skip extraction =>', details.url);
    return;
  }
  const visitId = tabToVisitId[details.tabId];
  if (!visitId) {
    console.log('[DORY] No visit => skip extraction => tabId=', details.tabId);
    return;
  }
  const pageId = tabToPageId[details.tabId];
  const sessionId = await getCurrentSessionId();

  console.log('[DORY] onCompleted => sending SET_EXTRACTION_CONTEXT =>', { pageId, visitId, sessionId });

  // Step 1) SET_EXTRACTION_CONTEXT
  chrome.tabs.sendMessage(
    details.tabId,
    createMessage(MessageType.SET_EXTRACTION_CONTEXT, { pageId, visitId, sessionId }, 'background'),
    {},
    (resp) => {
      console.log('[DORY] SET_EXTRACTION_CONTEXT ack =>', resp);
      // Step 2) TRIGGER_EXTRACTION
      console.log('[DORY] Now triggering extraction => tabId=', details.tabId);
      chrome.tabs.sendMessage(
        details.tabId,
        createMessage(MessageType.TRIGGER_EXTRACTION, {}, 'background')
      );
    }
  );
});

/** onRemoved => end visit */
chrome.tabs.onRemoved.addListener(async (tabId) => {
  await endCurrentVisit(tabId);
  delete tabToCurrentUrl[tabId];
  delete tabToPageId[tabId];
  delete tabToVisitId[tabId];
});

/** store initial URL if any */
chrome.tabs.onCreated.addListener((tab) => {
  if (tab.id !== undefined && tab.url) {
    tabToCurrentUrl[tab.id] = tab.url;
  }
});

self.addEventListener('activate', () => {
  console.log('[DORY] service worker activated');
});

chrome.runtime.onSuspend.addListener(async () => {
  console.log('[DORY] onSuspend => end session');
  await endCurrentSession();
  if (idleCheckInterval) clearInterval(idleCheckInterval);
});

/** signInChanged => re-init or cleanup */
chrome.identity.onSignInChanged.addListener(async (account, signedIn) => {
  console.log('[DORY] signInChanged =>', signedIn, account);
  if (signedIn && !isAuthenticated) {
    initialize();
  } else if (!signedIn && isAuthenticated) {
    isAuthenticated = false;
    if (idleCheckInterval) clearInterval(idleCheckInterval);
    if (isSessionActive) {
      endCurrentSession();
      isSessionActive = false;
    }
    chrome.action.setIcon({
      path: {
        16: '/icons/dory_logo_gray_16x16.png',
        48: '/icons/dory_logo_gray_48x48.png',
        128: '/icons/dory_logo_gray_128x128.png'
      }
    });
    chrome.action.onClicked.removeListener(handleExtIconClick);
    chrome.action.onClicked.addListener(handleUnauthClick);
  }
});