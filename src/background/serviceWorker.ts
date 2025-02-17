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
function fetchHistoryAndQueue(startTime: number): void {
  const now = Date.now();

  chrome.history.search(
    {
      text: '', // Match all history items.
      startTime,
      maxResults: HISTORY_CONFIG.MAX_HISTORY_RESULTS
    },
    (historyItems) => {
      const urls = historyItems
        .map(item => item.url)
        .filter((url): url is string => Boolean(url));

      queueManager.addUrls(urls)
        .then(() => {
          queueManager.getQueueSize().then(size => {
            console.log(`${LOGGING_CONFIG.PREFIX} Queue size after adding history items: ${size}`);
          });
          processQueue();
        })
        .catch(error => {
          console.error(`${LOGGING_CONFIG.PREFIX} Error adding URLs to the queue:`, error);
        });

      lastCheckedTime = now;
    }
  );
}

// Listen for messages from content scripts.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log(`${LOGGING_CONFIG.PREFIX} Received message:`, message.type, message);
  
  if (message.type === 'GET_VISIT_TIME') {
    chrome.history.getVisits({ url: message.url }, (historyItems) => {
      const visitTime = historyItems.length > 0 ? historyItems[historyItems.length - 1].visitTime : Date.now();
      sendResponse({ visitTime });
    });
    return true; // Keep the message channel open for async response
  }
  
  if (message.type === 'EXTRACTION_COMPLETE') {
    console.log(`${LOGGING_CONFIG.PREFIX} Processing extraction complete for content URL:`, message.data.url);
    
    if (!currentQueueUrl) {
      console.error(`${LOGGING_CONFIG.PREFIX} No currentQueueUrl found. This should not happen.`);
      return true;
    }
    
    console.log(`${LOGGING_CONFIG.PREFIX} Will mark queued URL as processed:`, currentQueueUrl);
    console.log(`${LOGGING_CONFIG.PREFIX} Document stored with ID:`, message.data.docId);
    
    // Update queue with metadata
    queueManager.markIndexed(currentQueueUrl, message.data.metadata)
      .then(() => {
        console.log(`${LOGGING_CONFIG.PREFIX} Successfully marked queued URL as processed:`, currentQueueUrl);
        // Get and log queue size before processing next URL
        queueManager.getQueueSize().then(size => {
          console.log(`${LOGGING_CONFIG.PREFIX} URLs remaining in queue:`, size);
          console.log(`${LOGGING_CONFIG.PREFIX} Calling processQueue to handle next URL`);
          processQueue();
        });
      })
      .catch(error => {
        console.error(`${LOGGING_CONFIG.PREFIX} Error marking URL as processed:`, error);
        // Don't call processQueue here as it might cause race conditions
      });
  }
  
  if (message.type === 'EXTRACTION_ERROR') {
    console.error(`${LOGGING_CONFIG.PREFIX} Extraction error:`, message.error);

    if (!currentQueueUrl) {
      console.error(`${LOGGING_CONFIG.PREFIX} No currentQueueUrl found. Cannot track retries.`);
      return true;
    }

    // Get the current retry count from the map, defaulting to 0
    const currentCount = extractionRetryCounts.get(currentQueueUrl) || 0;
    const newCount = currentCount + 1;
    extractionRetryCounts.set(currentQueueUrl, newCount);

    console.log(`${LOGGING_CONFIG.PREFIX} Retry count for ${currentQueueUrl} is now ${newCount}`);

    if (newCount >= QUEUE_CONFIG.MAX_RETRIES) {
      console.warn(`${LOGGING_CONFIG.PREFIX} Exceeded max retries for ${currentQueueUrl}. Skipping it.`);
      // Mark as failed in the queue
      queueManager.markIndexed(currentQueueUrl, message.metadata)
        .then(() => {
          processQueue();
        })
        .catch(error => {
          console.error(`${LOGGING_CONFIG.PREFIX} Error marking URL as failed:`, error);
          processQueue();
        });
    } else {
      // We'll try this URL again after a short delay
      console.log(`${LOGGING_CONFIG.PREFIX} Will retry ${currentQueueUrl} in ${QUEUE_CONFIG.RETRY_DELAY_MS} ms`);
      setTimeout(() => {
        processQueue();
      }, QUEUE_CONFIG.RETRY_DELAY_MS);
    }
  }
  
  return true;
});

// On installation, fetch initial history.
chrome.runtime.onInstalled.addListener(() => {
  console.log(`${LOGGING_CONFIG.PREFIX} Service Worker installed. Fetching initial history...`);
  fetchHistoryAndQueue(lastCheckedTime);
});

// Set up periodic history refresh.
chrome.alarms.create('refreshHistory', { periodInMinutes: HISTORY_CONFIG.POLLING_INTERVAL_MIN });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'refreshHistory') {
    console.log(`${LOGGING_CONFIG.PREFIX} Alarm triggered. Fetching new history items...`);
    fetchHistoryAndQueue(lastCheckedTime);
  }
});

// Add click handler for extension icon
chrome.action.onClicked.addListener((tab) => {
  if (tab.windowId) {
    chrome.sidePanel.open({ windowId: tab.windowId });
  }
});