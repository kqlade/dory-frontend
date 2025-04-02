/**
 * @file activityTracker.ts
 * Tracks user activity (tab visibility) and notifies the background script.
 */

import { getBackgroundAPI } from '../utils/comlinkSetup';
import type { BackgroundAPI } from '../background/api';

/** Timestamp of the last time the page became active. */
let lastActiveTime: number | null = document.hidden ? null : Date.now();

/**
 * Reports activity data to the background script using Comlink.
 */
async function notifyActivity(isActive: boolean, duration: number): Promise<void> {
  try {
    const api = await getBackgroundAPI<BackgroundAPI>();
    await api.activity.reportActivity({
      isActive,
      pageUrl: window.location.href,
      duration,
    });
  } catch (err) {
    console.error('[ActivityTracker] Error reporting activity:', err);
  }
}

/**
 * Handles visibility changes (document.hidden).
 */
function handleVisibilityChange(): void {
  if (document.hidden && lastActiveTime !== null) {
    // Transitioning from active to inactive
    const now = Date.now();
    const diffSec = (now - lastActiveTime) / 1000;
    lastActiveTime = null;
    notifyActivity(false, diffSec);
  } else if (!document.hidden) {
    // Transitioning from inactive to active
    lastActiveTime = Date.now();
    notifyActivity(true, 0);
  }
}

/** Listen for visibility changes. */
document.addEventListener('visibilitychange', handleVisibilityChange);

/**
 * Handle pagehide (for when the user actually leaves the page,
 * not just bfcache).
 */
window.addEventListener('pagehide', event => {
  if (!event.persisted && lastActiveTime !== null) {
    const now = Date.now();
    const diffSec = (now - lastActiveTime) / 1000;
    notifyActivity(false, diffSec);
    lastActiveTime = null;
  }
});