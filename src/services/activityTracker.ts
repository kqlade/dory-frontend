// src/services/activityTracker.ts

import { createMessage, MessageType } from './messageSystem';

console.log('[ActivityTracker] Running...');

/**
 * Activity tracking:
 * "active" if the tab is visible,
 * "inactive" if the tab is hidden or closed.
 */
let lastActiveTime: number | null = null;

/** Send an ACTIVITY_EVENT to the background. */
function notifyActivity(isActive: boolean, duration: number) {
  const msg = createMessage(MessageType.ACTIVITY_EVENT, {
    isActive,
    pageUrl: window.location.href,
    duration
  });
  chrome.runtime.sendMessage(msg).catch(err => {
    console.error('[ActivityTracker] Error sending ACTIVITY_EVENT:', err);
  });
}

function handleVisibilityChange() {
  if (document.hidden) {
    // Going inactive
    if (lastActiveTime) {
      const now = Date.now();
      const diffSec = (now - lastActiveTime) / 1000;
      lastActiveTime = null;
      notifyActivity(false, diffSec);
    }
  } else {
    // Going active
    lastActiveTime = Date.now();
    notifyActivity(true, 0);
  }
}

// Watch for visibility changes
document.addEventListener('visibilitychange', handleVisibilityChange);

// Also if user leaves the page entirely
window.addEventListener('unload', () => {
  if (lastActiveTime) {
    const now = Date.now();
    const diffSec = (now - lastActiveTime) / 1000;
    notifyActivity(false, diffSec);
  }
});

// Set initial state
if (!document.hidden) {
  lastActiveTime = Date.now();
  notifyActivity(true, 0);
} 