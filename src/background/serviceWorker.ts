// src/background/serviceWorker.ts

// History-related configuration
export const HISTORY_CONFIG = {
  DAYS_OF_HISTORY: 1,
  POLLING_INTERVAL_MIN: 60,
  MAX_HISTORY_RESULTS: 20
} as const;

// Window-related configuration
export const WINDOW_CONFIG = {
  REOPEN_DELAY_MS: 5000,
  PROCESSING_WINDOW_CONFIG: {
    type: 'normal' as const,
    state: 'normal' as const,
    focused: false,
    width: 1024,
    height: 768,
  }
} as const;

console.log('[ServiceWorker] Starting initialization...');

console.log('[ServiceWorker] About to import queueManager...');
import queueManager from '../services/queueManager';
console.log('[ServiceWorker] queueManager imported successfully');

console.log('[ServiceWorker] About to import indexingScheduler...');
import { processQueue, currentQueueUrl } from '../services/indexingScheduler';
console.log('[ServiceWorker] indexingScheduler imported successfully');

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
            console.log(`Queue size after adding history items: ${size}`);
          });
          processQueue();
        })
        .catch(error => {
          console.error('Error adding URLs to the queue:', error);
        });

      lastCheckedTime = now;
    }
  );
}

// Listen for messages from content scripts.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[ServiceWorker] Received message:', message.type, message);
  if (message.type === 'EXTRACTION_COMPLETE') {
    console.log('[ServiceWorker] Processing extraction complete for content URL:', message.data.url);
    
    if (!currentQueueUrl) {
      console.error('[ServiceWorker] No currentQueueUrl found. This should not happen.');
      return true;
    }
    
    console.log('[ServiceWorker] Will mark queued URL as processed:', currentQueueUrl);
    queueManager.markIndexed(currentQueueUrl)
      .then(() => {
        console.log('[ServiceWorker] Successfully marked queued URL as processed:', currentQueueUrl);
        // Get and log queue size before processing next URL
        queueManager.getQueueSize().then(size => {
          console.log('[ServiceWorker] URLs remaining in queue:', size);
          console.log('[ServiceWorker] Calling processQueue to handle next URL');
          processQueue();
        });
      })
      .catch(error => {
        console.error('[ServiceWorker] Error marking URL as processed:', error);
        // Don't call processQueue here as it might cause race conditions
      });
  } else if (message.type === 'EXTRACTION_ERROR') {
    console.error('[ServiceWorker] Extraction error:', message.error);
    // Don't call processQueue here, let the current URL be retried
  }
  return true;
});

// On installation, fetch initial history.
chrome.runtime.onInstalled.addListener(() => {
  console.log('Service Worker installed. Fetching initial history...');
  fetchHistoryAndQueue(lastCheckedTime);
});

// Set up periodic history refresh.
chrome.alarms.create('refreshHistory', { periodInMinutes: HISTORY_CONFIG.POLLING_INTERVAL_MIN });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'refreshHistory') {
    console.log('Alarm triggered. Fetching new history items...');
    fetchHistoryAndQueue(lastCheckedTime);
  }
});