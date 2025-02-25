// src/background/serviceWorker.ts

import {
  HISTORY_CONFIG,
  WINDOW_CONFIG,
  QUEUE_CONFIG,
  LOGGING_CONFIG
} from './config';

console.log(`${LOGGING_CONFIG.PREFIX} Starting initialization...`);

// Disabled for demo
// import queueManager from '../services/queueManager';
// import { processQueue, currentQueueUrl, currentProcessingWindowId } from '../services/indexingScheduler';

// Import only what we need from the API client
import { apiRequest, getDocument } from '../api/client';

console.log('Service Worker loaded');

// Track whether we're doing initial indexing
let isInitialIndexing = false;

// Disabled for demo
// Ensure processing window stays muted
// chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
//   if (changeInfo.mutedInfo?.muted === false) {
//     chrome.tabs.get(tabId, (tab) => {
//       if (tab.windowId === currentProcessingWindowId) {
//         chrome.tabs.update(tabId, { muted: true });
//       }
//     });
//   }
// });

let lastCheckedTime: number = Date.now() - HISTORY_CONFIG.DAYS_OF_HISTORY * 24 * 60 * 60 * 1000;

// Track retry counts for URLs
const extractionRetryCounts = new Map<string, number>();

/**
 * Fetches browser history starting from a given time and adds the URLs to the queue.
 * Disabled for demo.
 */
async function loadHistory() {
  console.log('[ServiceWorker] Loading history disabled for demo');
}

// Listen for messages from content scripts.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log(`${LOGGING_CONFIG.PREFIX} Received message:`, message.type, message);
  
  if (message.type === 'GET_VISIT_TIME') {
    chrome.history.getVisits({ url: message.url }, (historyItems) => {
      const visitTime = historyItems.length > 0 ? historyItems[historyItems.length - 1].visitTime : Date.now();
      sendResponse({ visitTime });
    });
    return true;
  }
  
  // Disabled for demo
  // if (message.type === 'EXTRACTION_COMPLETE') {
  //   console.log(`${LOGGING_CONFIG.PREFIX} Extraction complete for URL:`, message.data.url);
  // }
  
  // if (message.type === 'EXTRACTION_ERROR') {
  //   console.error(`${LOGGING_CONFIG.PREFIX} Extraction error:`, message.error);
  // }
  
  return true;
});

// On installation, fetch initial history.
chrome.runtime.onInstalled.addListener(() => {
  console.log(`${LOGGING_CONFIG.PREFIX} Service Worker installed. Initial indexing disabled for demo.`);
});

// Add click handler for extension icon
chrome.action.onClicked.addListener((tab) => {
  if (tab.windowId) {
    chrome.sidePanel.open({ windowId: tab.windowId });
  }
});

// Disabled for demo
// Handle history updates
// chrome.history.onVisited.addListener(async (historyItem) => {
//   if (isInitialIndexing) {
//     return;
//   }

//   console.log('[ServiceWorker] History item visited:', historyItem);
//   if (!historyItem.url) {
//     console.warn('[ServiceWorker] Visited history item has no URL');
//     return;
//   }

//   try {
//     await queueManager.addUrl(historyItem.url, false);
//     console.log('[ServiceWorker] Successfully queued visited URL');
//     processQueue();
//   } catch (error) {
//     console.error('[ServiceWorker] Error queueing visited URL:', error);
//   }
// });