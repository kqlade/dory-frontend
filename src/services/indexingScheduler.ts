// src/services/indexingScheduler.ts

import { WINDOW_CONFIG } from '../background/config';
import queueManager from './queueManager';

// Global variables to track the processing window and its tab.
export let currentProcessingWindowId: number | null = null;
let currentProcessingTabId: number | null = null;
export let currentQueueUrl: string | null = null; // Track the exact URL from queue

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
            console.error('Chrome runtime error:', chrome.runtime.lastError.message);
            reject(new Error(chrome.runtime.lastError.message));
          } else if (newWindow && newWindow.id !== undefined && newWindow.tabs && newWindow.tabs.length > 0) {
            const windowId = newWindow.id;
            const tabId = newWindow.tabs[0].id!;
            resolve({ windowId, tabId });
          } else {
            reject(new Error('Failed to create processing window: window or tab ID undefined'));
          }
        }
      );
    } catch (error) {
      console.error('Error in window creation:', error);
      reject(error);
    }
  });
}

/**
 * Ensures that a processing window is active.
 * If a window is already open, it updates its tab with the next URL from the queue.
 */
export async function processQueue(): Promise<void> {
  console.log('[Scheduler] Starting processQueue');
  // Retrieve the next unprocessed URL from the queue.
  const url = await queueManager.getNextUrl();
  if (!url) {
    console.log("[Scheduler] No URL available to process.");
    currentQueueUrl = null;
    return;
  }
  
  // Store the exact URL we got from the queue
  currentQueueUrl = url;
  console.log('[Scheduler] Retrieved and stored queue URL:', currentQueueUrl);

  if (currentProcessingWindowId !== null && currentProcessingTabId !== null) {
    console.log('[Scheduler] Existing processing window found. Window ID:', currentProcessingWindowId, 'Tab ID:', currentProcessingTabId);
    // Update the current processing tab with the new URL.
    chrome.tabs.update(currentProcessingTabId, { url }, async (tab) => {
      if (chrome.runtime.lastError) {
        console.error("[Scheduler] Error updating tab:", chrome.runtime.lastError.message);
      } else {
        console.log(`[Scheduler] Successfully updated processing tab with new URL: ${url}`);
      }
    });
  } else {
    console.log('[Scheduler] No existing processing window. Creating new window for URL:', url);
    // No processing window exists; open a new one.
    try {
      const { windowId, tabId } = await openProcessingWindow(url);
      currentProcessingWindowId = windowId;
      currentProcessingTabId = tabId;
      console.log(`[Scheduler] Successfully opened new processing window. Window ID: ${windowId}, Tab ID: ${tabId}`);
    } catch (error) {
      console.error("[Scheduler] Error opening processing window:", error);
    }
  }
}

/**
 * Monitors for the processing window being closed.
 * If it is closed, the scheduler will attempt to reopen it after a delay.
 */
chrome.windows.onRemoved.addListener((removedWindowId) => {
  if (removedWindowId === currentProcessingWindowId) {
    console.log(`[Scheduler] Processing window ${removedWindowId} was closed.`);
    currentProcessingWindowId = null;
    currentProcessingTabId = null;
    setTimeout(() => {
      console.log('[Scheduler] Attempting to reopen processing window after closure');
      processQueue();
    }, WINDOW_CONFIG.REOPEN_DELAY_MS);
  }
});