// src/background/serviceWorker.ts

import {
  HISTORY_CONFIG,
  WINDOW_CONFIG,
  QUEUE_CONFIG,
  LOGGING_CONFIG
} from './config';

console.log(`${LOGGING_CONFIG.PREFIX} Starting initialization...`);

console.log(`${LOGGING_CONFIG.PREFIX} About to import queueManager...`);
import queueManager from '../services/queueManager';
console.log(`${LOGGING_CONFIG.PREFIX} queueManager imported successfully`);

console.log(`${LOGGING_CONFIG.PREFIX} About to import indexingScheduler...`);
import { processQueue, currentQueueUrl, currentProcessingWindowId } from '../services/indexingScheduler';
console.log(`${LOGGING_CONFIG.PREFIX} indexingScheduler imported successfully`);

// Import only what we need from the API client
import { apiRequest, getDocument } from '../api/client';

console.log('Service Worker loaded');

// Track whether we're doing initial indexing
let isInitialIndexing = false;

// Ensure processing window stays muted
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.mutedInfo?.muted === false) {
    chrome.tabs.get(tabId, (tab) => {
      if (tab.windowId === currentProcessingWindowId) {
        chrome.tabs.update(tabId, { muted: true });
      }
    });
  }
});

let lastCheckedTime: number = Date.now() - HISTORY_CONFIG.DAYS_OF_HISTORY * 24 * 60 * 60 * 1000;

// Track retry counts for URLs
const extractionRetryCounts = new Map<string, number>();

/**
 * Fetches browser history starting from a given time and adds the URLs to the queue.
 */
async function loadHistory() {
  console.log('[ServiceWorker] Loading history...');
  isInitialIndexing = true;

  const startTime = new Date(
    Date.now() - HISTORY_CONFIG.DAYS_OF_HISTORY * 24 * 60 * 60 * 1000
  ).getTime();

  try {
    const historyItems = await chrome.history.search({
      text: '',
      startTime,
      maxResults: HISTORY_CONFIG.MAX_HISTORY_RESULTS,
    });

    console.log(
      `[ServiceWorker] Found ${historyItems.length} history items since ${new Date(
        startTime
      ).toLocaleString()}`
    );

    const urls = historyItems
      .map((item) => item.url)
      .filter((url): url is string => Boolean(url));
    await queueManager.addUrls(urls, true);
    console.log('[ServiceWorker] Successfully queued history items');
    
    // Start processing the queue
    processQueue();
  } catch (error) {
    console.error('[ServiceWorker] Error loading history:', error);
    isInitialIndexing = false;
  }
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
  
  if (message.type === 'EXTRACTION_COMPLETE') {
    console.log(`${LOGGING_CONFIG.PREFIX} Extraction complete for URL:`, message.data.url);
    
    if (!currentQueueUrl) {
      console.error(`${LOGGING_CONFIG.PREFIX} No currentQueueUrl found. This should not happen.`);
      return true;
    }
    
    // Mark as processed and move to next URL
    queueManager.markIndexed(currentQueueUrl, message.data.metadata)
      .then(async () => {
        // Check if we have more URLs to process
        const queueSize = await queueManager.getQueueSize();
        if (queueSize === 0 && isInitialIndexing) {
          // Initial indexing is complete
          console.log(`${LOGGING_CONFIG.PREFIX} Initial indexing complete`);
          isInitialIndexing = false;
        }
        processQueue();
      })
      .catch(error => {
        console.error(`${LOGGING_CONFIG.PREFIX} Error marking URL as processed:`, error);
        processQueue();
      });
  }
  
  if (message.type === 'EXTRACTION_ERROR') {
    console.error(`${LOGGING_CONFIG.PREFIX} Extraction error:`, message.error);

    if (!currentQueueUrl) {
      console.error(`${LOGGING_CONFIG.PREFIX} No currentQueueUrl found for error handling`);
      return true;
    }

    // On error, mark as processed with failed status and move on
    const failedMetadata = {
      ...message.metadata,
      status: 'failed' as const
    };

    queueManager.markIndexed(currentQueueUrl, failedMetadata)
      .then(async () => {
        // Check if we have more URLs to process
        const queueSize = await queueManager.getQueueSize();
        if (queueSize === 0 && isInitialIndexing) {
          // Initial indexing is complete
          console.log(`${LOGGING_CONFIG.PREFIX} Initial indexing complete`);
          isInitialIndexing = false;
        }
        processQueue();
      })
      .catch(error => {
        console.error(`${LOGGING_CONFIG.PREFIX} Error marking failed URL:`, error);
        processQueue();
      });
  }
  
  return true;
});

// On installation, fetch initial history.
chrome.runtime.onInstalled.addListener(() => {
  console.log(`${LOGGING_CONFIG.PREFIX} Service Worker installed. Fetching initial history...`);
  loadHistory();
});

// Set up periodic history refresh.
chrome.alarms.create('refreshHistory', { periodInMinutes: HISTORY_CONFIG.POLLING_INTERVAL_MIN });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'refreshHistory' && !isInitialIndexing) {
    console.log(`${LOGGING_CONFIG.PREFIX} Alarm triggered. Fetching new history items...`);
    loadHistory();
  }
});

// Add click handler for extension icon
chrome.action.onClicked.addListener((tab) => {
  if (tab.windowId) {
    chrome.sidePanel.open({ windowId: tab.windowId });
  }
});

// Handle history updates - only after initial indexing is complete
chrome.history.onVisited.addListener(async (historyItem) => {
  if (isInitialIndexing) {
    return; // Skip during initial indexing
  }

  console.log('[ServiceWorker] History item visited:', historyItem);
  if (!historyItem.url) {
    console.warn('[ServiceWorker] Visited history item has no URL');
    return;
  }

  try {
    await queueManager.addUrl(historyItem.url, false);
    console.log('[ServiceWorker] Successfully queued visited URL');
    processQueue(); // Start processing if not already running
  } catch (error) {
    console.error('[ServiceWorker] Error queueing visited URL:', error);
  }
});