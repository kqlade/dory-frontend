/**
 * @file coldStorageSync.ts
 * 
 * Cold Storage Sync Service
 * Runs roughly once per day to batch-upload data from IndexedDB to the backend.
 */

import { getDB } from '../db/dexieDB';
import { API_BASE_URL, ENDPOINTS } from '../config';
import { EventType } from '../api/types';

// Typical daily interval in minutes
const SYNC_INTERVAL_MINUTES = 24 * 60; // 24 hours
const LAST_SYNC_KEY = 'lastColdStorageSync';
const BATCH_SIZE = 500; // Number of records per batch
const DEBUG_MODE = process.env.NODE_ENV === 'development';

/**
 * Service worker safe method to get user ID from storage directly
 */
async function getUserIdFromStorage(): Promise<string | undefined> {
  try {
    const data = await chrome.storage.local.get(['user']);
    return data.user?.id || undefined;
  } catch (error) {
    console.error('[ColdStorageSync] Error getting user ID from storage:', error);
    return undefined;
  }
}

/**
 * A class that orchestrates cold-storage syncing in a background context.
 * In Manifest V3, you likely won't keep it instantiated; rather,
 * you might create it on-demand in your service worker or have a static usage.
 */
export class ColdStorageSync {
  private isSyncing = false;

  constructor() {
    console.log('[ColdStorageSync] Service constructed');
  }

  /**
   * Initialize daily alarm-based scheduling for MV3
   * (called from the background service worker).
   */
  public static initializeScheduling(): void {
    // Clear any old alarm
    chrome.alarms.clear('doryColdStorageSync');
    // Create a new daily alarm
    chrome.alarms.create('doryColdStorageSync', {
      periodInMinutes: SYNC_INTERVAL_MINUTES,
      when: Date.now() + 60_000 // start ~1 min from now
    });
    console.log('[ColdStorageSync] Alarm scheduled for daily sync');
  }

  /**
   * This is your main entry point from the alarm listener or a manual trigger.
   */
  public async performSync(): Promise<void> {
    if (this.isSyncing) {
      console.log('[ColdStorageSync] Sync already in progress; skipping');
      return;
    }

    try {
      this.isSyncing = true;
      console.log('[ColdStorageSync] Starting sync operation...');

      // Update last sync time in storage when completed successfully
      await this.syncData();

      await chrome.storage.local.set({ [LAST_SYNC_KEY]: Date.now() });
      console.log('[ColdStorageSync] Sync completed successfully');
    } catch (error) {
      console.error('[ColdStorageSync] Sync failed:', error);
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * The core logic that fetches data from Dexie and sends it in batches.
   */
  private async syncData(): Promise<void> {
    const db = await getDB();

    // Get last sync time from chrome.storage.local
    const store = await chrome.storage.local.get(LAST_SYNC_KEY);
    const lastSyncTime: number = store[LAST_SYNC_KEY] ?? 0;

    // Current user ID for stamping records
    const userId = await this.getCurrentUserId();

    // Example: sync pages
    {
      const pages = await db.pages
        // Assuming you have a field like `updatedAt` or `lastModified`.
        // If you use `lastModified`, change below accordingly.
        .where('updatedAt')
        .above(lastSyncTime)
        .toArray();

      await this.syncCollection('pages', pages, userId);
    }

    // Example: sync visits
    {
      const visits = await db.visits
        .where('startTime')
        .above(lastSyncTime)
        .toArray();

      await this.syncCollection('visits', visits, userId);
    }

    // sessions, events, search clicks, etc.
    {
      const sessions = await db.sessions
        .where('startTime')
        .above(lastSyncTime)
        .toArray();

      await this.syncCollection('sessions', sessions, userId);
    }

    // Example: sync search click events
    {
      const clickEvents = await db.events
        .where('operation')
        .equals(EventType.SEARCH_CLICK)
        .and(e => e.timestamp > lastSyncTime)
        .toArray();

      await this.syncEvents(EventType.SEARCH_CLICK, clickEvents, userId);
    }

    // Add more collections as needed...
  }

  /**
   * Get the current user ID, throws error if not authenticated
   */
  private async getCurrentUserId(): Promise<string> {
    const userId = await getUserIdFromStorage();
    if (!userId) {
      throw new Error('User not authenticated');
    }
    return userId;
  }

  /**
   * Sync a collection by splitting into BATCH_SIZE chunks and sending.
   */
  private async syncCollection(collectionName: string, records: any[], userId: string): Promise<void> {
    if (!records.length) {
      console.log(`[ColdStorageSync] No new ${collectionName} records to sync`);
      return;
    }
    console.log(`[ColdStorageSync] Syncing ${records.length} ${collectionName} records`);

    const enriched = records.map(r => ({ ...r, userId: r.userId || userId }));

    for (let i = 0; i < enriched.length; i += BATCH_SIZE) {
      const batch = enriched.slice(i, i + BATCH_SIZE);
      await this.sendBatch(collectionName, batch);
      console.log(`[ColdStorageSync] Synced batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(enriched.length / BATCH_SIZE)} for ${collectionName}`);
    }
  }

  /**
   * Actually POST a batch of data to your cold-storage endpoints.
   */
  private async sendBatch(collectionName: string, batch: any[]): Promise<void> {
    if (!batch.length) return;

    let endpoint: string;
    let transformed: any[];

    switch (collectionName) {
      case 'sessions':
        endpoint = ENDPOINTS.COLD_STORAGE.SESSIONS;
        transformed = batch.map(s => ({
          sessionId: String(s.sessionId),
          userId: s.userId,
          startTime: s.startTime,
          endTime: s.endTime ?? null,
          totalActiveTime: s.totalActiveTime,
          isActive: s.isActive
        }));
        break;

      case 'visits':
        endpoint = ENDPOINTS.COLD_STORAGE.VISITS;
        transformed = batch.map(v => ({
          visitId: String(v.visitId),
          userId: v.userId,
          pageId: String(v.pageId),
          sessionId: String(v.sessionId),
          startTime: v.startTime,
          endTime: v.endTime ?? null,
          totalActiveTime: v.totalActiveTime,
          fromPageId: v.fromPageId ?? null,
          isBackNavigation: !!v.isBackNavigation
        }));
        break;

      case 'pages':
        endpoint = ENDPOINTS.COLD_STORAGE.PAGES;
        transformed = batch.map(p => ({
          pageId: String(p.pageId),
          userId: p.userId,
          url: p.url,
          title: p.title,
          domain: p.domain,
          firstVisit: p.firstVisit,
          lastVisit: p.lastVisit,
          visitCount: p.visitCount,
          totalActiveTime: p.totalActiveTime
          // etc...
        }));
        break;

      default:
        // Generic fallback if you have a catch-all
        endpoint = `${ENDPOINTS.COLD_STORAGE.BASE}/${collectionName}`;
        transformed = batch;
    }

    // Debug
    if (DEBUG_MODE) {
      console.log(`[ColdStorageSync] POSTing ${transformed.length} ${collectionName} items to ${endpoint}`, 
        transformed.length > 5 
          ? [transformed[0], '(...omitted...)', transformed[transformed.length - 1]]
          : transformed
      );
    }

    // Send
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(transformed)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} from server: ${response.statusText}`);
    }
    const respData = await response.json();
    console.log(`[ColdStorageSync] Synced batch => server ack:`, respData);
  }

  /**
   * Sync events of a specific type, e.g. SEARCH_CLICK
   */
  private async syncEvents(eventType: EventType, events: any[], userId: string): Promise<void> {
    if (!events.length) {
      console.log(`[ColdStorageSync] No ${eventType} events to sync`);
      return;
    }
    console.log(`[ColdStorageSync] Syncing ${events.length} ${eventType} events`);

    const enriched = events.map(e => ({ ...e, userId: e.userId || userId }));

    for (let i = 0; i < enriched.length; i += BATCH_SIZE) {
      const batch = enriched.slice(i, i + BATCH_SIZE);
      if (eventType === EventType.SEARCH_CLICK) {
        await this.sendSearchClickBatch(batch);
      } else {
        console.warn(`[ColdStorageSync] No direct sync logic for ${eventType}, skipping`);
      }
      console.log(`[ColdStorageSync] Synced ${eventType} batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(enriched.length / BATCH_SIZE)}`);
    }
  }

  /**
   * Example specialized method for search click events
   */
  private async sendSearchClickBatch(events: any[]): Promise<void> {
    const endpoint = ENDPOINTS.COLD_STORAGE.SEARCH_CLICKS;
    const transformed = events.map(e => ({
      clickId: `click_${e.data?.searchSessionId}_${e.data?.pageId}_${e.timestamp}`,
      userId: e.userId,
      pageId: e.data?.pageId,
      query: e.data?.query,
      position: e.data?.position,
      timestamp: e.timestamp
      // etc...
    }));

    if (DEBUG_MODE) {
      console.log('[ColdStorageSync] Posting search clicks =>', transformed);
    }

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(transformed)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} from server: ${response.statusText}`);
    }
    const data = await response.json();
    console.log(`[ColdStorageSync] Synced search clicks => server ack:`, data);
  }
}

/**
 * In your background service worker, you might do:
 *
 *  import { ColdStorageSync } from './coldStorageSync';
 *
 *  // On extension startup:
 *  ColdStorageSync.initializeScheduling();
 *
 *  // On alarm:
 *  chrome.alarms.onAlarm.addListener(alarm => {
 *    if (alarm.name === 'doryColdStorageSync') {
 *      const syncer = new ColdStorageSync();
 *      syncer.performSync();
 *    }
 *  });
 */

export const coldStorageSync = new ColdStorageSync(); // optional singleton