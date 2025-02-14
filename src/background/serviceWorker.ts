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
import { processQueue, currentQueueUrl } from '../services/indexingScheduler';
console.log(`${LOGGING_CONFIG.PREFIX} indexingScheduler imported successfully`);

// Import only what we need from the API client
import { apiRequest } from '../api/client';

console.log('Service Worker loaded');

let lastCheckedTime: number = Date.now() - HISTORY_CONFIG.DAYS_OF_HISTORY * 24 * 60 * 60 * 1000;

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
  
  if (message.type === 'EXTRACTION_COMPLETE') {
    console.log(`${LOGGING_CONFIG.PREFIX} Processing extraction complete for content URL:`, message.data.url);
    
    if (!currentQueueUrl) {
      console.error(`${LOGGING_CONFIG.PREFIX} No currentQueueUrl found. This should not happen.`);
      return true;
    }
    
    console.log(`${LOGGING_CONFIG.PREFIX} Will mark queued URL as processed:`, currentQueueUrl);
    queueManager.markIndexed(currentQueueUrl)
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

  } else if (message.type === 'EXTRACTION_ERROR') {
    console.error(`${LOGGING_CONFIG.PREFIX} Extraction error:`, message.error);
    // The current URL might be retried or removed. Not calling processQueue here to avoid collisions.
  } else if (message.type === 'API_REQUEST') {
    // Generic API forwarding
    apiRequest(message.endpoint, message.options)
      .then((data) => sendResponse({ success: true, data }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
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