// src/services/activityTracker.ts

import { createMessage, MessageType } from '../utils/messageSystem';

console.log('[ActivityTracker] Running...');

/**
 * Tracks user activity (tab visibility).
 * When tab is visible: "active",
 * when tab is hidden or closed: "inactive".
 */
let lastActiveTime: number | null = null;

/**
 * Send an ACTIVITY_EVENT to the background.
 */
function notifyActivity(isActive: boolean, duration: number) {
  const msg = createMessage(MessageType.ACTIVITY_EVENT, {
    isActive,
    pageUrl: window.location.href,
    duration
  });
  chrome.runtime.sendMessage(msg).catch((err) => {
    console.error('[ActivityTracker] Error sending ACTIVITY_EVENT:', err);
  });
}

/**
 * Handle changes in visibility (from document.hidden).
 */
function handleVisibilityChange() {
  if (document.hidden) {
    // Going inactive
    if (lastActiveTime !== null) {
      const now = Date.now();
      const diffSec = (now - lastActiveTime) / 1000;
      lastActiveTime = null;
      notifyActivity(false, diffSec);
    }
  } else {
    // Becoming active
    lastActiveTime = Date.now();
    notifyActivity(true, 0);
  }
}

// Listen for visibility changes
document.addEventListener('visibilitychange', handleVisibilityChange);

/**
 * Handle pagehide when user leaves the page.
 * Use this instead of unload for bfcache compatibility.
 */
window.addEventListener('pagehide', (event) => {
  // Only send final data if the page is truly unloading,
  // i.e. not just being put into bfcache.
  if (!event.persisted && lastActiveTime !== null) {
    const now = Date.now();
    const diffSec = (now - lastActiveTime) / 1000;
    notifyActivity(false, diffSec);
    lastActiveTime = null;
  }
});

// Initialize state on load
if (!document.hidden) {
  lastActiveTime = Date.now();
  notifyActivity(true, 0);
}