// src/services/indexingScheduler.ts

import { WINDOW_CONFIG, QUEUE_CONFIG } from '../background/config';
import queueManager from './queueManager';

// Track the current processing state
export let currentProcessingWindowId: number | null = null;
let currentProcessingTabId: number | null = null;
export let currentQueueUrl: string | null = null;
let currentExtractionTimeout: NodeJS.Timeout | null = null;

/**
 * Opens a new processing window for the specified URL.
 */
function openProcessingWindow(url: string): Promise<{ windowId: number; tabId: number }> {
  return new Promise((resolve, reject) => {
    try {
      chrome.windows.create(
        {
          url,
          ...WINDOW_CONFIG.PROCESSING_WINDOW_CONFIG
        },
        async (newWindow) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (newWindow && newWindow.id !== undefined && newWindow.tabs && newWindow.tabs.length > 0) {
            const windowId = newWindow.id;
            const tabId = newWindow.tabs[0].id!;
            
            // Mute the tab
            try {
              await chrome.tabs.update(tabId, { muted: true });
            } catch (error) {
              console.error(`[Scheduler] Error muting tab:`, error);
            }
            
            resolve({ windowId, tabId });
          } else {
            reject(new Error('Failed to create processing window'));
          }
        }
      );
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Clear the current extraction timeout if it exists
 */
function clearExtractionTimeout() {
  if (currentExtractionTimeout) {
    clearTimeout(currentExtractionTimeout);
    currentExtractionTimeout = null;
  }
}

/**
 * Handle extraction timeout for a URL
 */
async function handleExtractionTimeout(url: string) {
  console.error(`[Scheduler] Processing timed out for URL: ${url}`);
  
  try {
    // Mark as processed with failed status and move on
    await queueManager.markIndexed(url, {
      url,
      title: 'Processing Timeout',
      visitedAt: Date.now(),
      processedAt: Date.now(),
      status: 'failed'
    });
  } catch (error) {
    console.error(`[Scheduler] Error marking timed out URL:`, error);
  }
  
  // Always try to move forward
  processQueue();
}

/**
 * Process the next URL in the queue.
 * If a processing window exists, reuse it.
 * Otherwise, create a new one.
 */
export async function processQueue(): Promise<void> {
  console.log('[Scheduler] Processing next URL');
  
  // Clear any existing timeout
  clearExtractionTimeout();
  
  // Get next URL to process
  const url = await queueManager.getNextUrl();
  if (!url) {
    console.log("[Scheduler] Queue is empty");
    currentQueueUrl = null;
    return;
  }
  
  // Update current URL being processed
  currentQueueUrl = url;
  console.log('[Scheduler] Processing URL:', url);

  // Set processing timeout
  currentExtractionTimeout = setTimeout(() => {
    handleExtractionTimeout(url);
  }, QUEUE_CONFIG.PROCESSING_TIMEOUT_MS);

  try {
    if (currentProcessingWindowId && currentProcessingTabId) {
      // Reuse existing window
      await chrome.tabs.update(currentProcessingTabId, { url, muted: true });
    } else {
      // Create new window
      const { windowId, tabId } = await openProcessingWindow(url);
      currentProcessingWindowId = windowId;
      currentProcessingTabId = tabId;
    }
  } catch (error) {
    console.error("[Scheduler] Error processing URL:", error);
    handleExtractionTimeout(url);
  }
}

/**
 * Handle processing window being closed
 */
chrome.windows.onRemoved.addListener((removedWindowId) => {
  if (removedWindowId === currentProcessingWindowId) {
    console.log(`[Scheduler] Processing window closed`);
    currentProcessingWindowId = null;
    currentProcessingTabId = null;
    clearExtractionTimeout();
    
    // If we have a current URL, mark it as failed and move on
    if (currentQueueUrl) {
      handleExtractionTimeout(currentQueueUrl);
    }
    
    // Try to continue processing after a delay
    setTimeout(processQueue, WINDOW_CONFIG.REOPEN_DELAY_MS);
  }
});