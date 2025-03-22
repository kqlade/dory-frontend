/**
 * @file coldStorageSync.ts
 * 
 * Cold Storage Sync Service
 * Runs every 10 minutes to batch-upload data from IndexedDB to the backend.
 */

import { getDB } from '../db/dexieDB';
import { API_BASE_URL, ENDPOINTS } from '../config';
import { EventType } from '../api/types';
import { getCurrentUserId } from '../services/userService';

// Typical daily interval in minutes
const SYNC_INTERVAL_MINUTES = 10; // Changed from 24 * 60 (24 hours) to 10 minutes
const LAST_SYNC_KEY = 'lastColdStorageSync';
const BATCH_SIZE = 500; // Number of records per batch
const DEBUG_MODE = process.env.NODE_ENV === 'development';

// Circuit breaker settings
const CIRCUIT_BREAKER_KEY = 'coldStorageSyncCircuitBreaker';
const MAX_CONSECUTIVE_FAILURES = 3;
const CIRCUIT_RESET_TIME_MS = 30 * 60 * 1000; // 30 minutes

// Telemetry settings
const TELEMETRY_KEY = 'coldStorageSyncTelemetry';
const SYNC_SOURCE = {
  ALARM: 'alarm',
  SESSION_END: 'session_end',
  MANUAL: 'manual'
};

/**
 * A class that orchestrates cold-storage syncing in a background context.
 * In Manifest V3, you likely won't keep it instantiated; rather,
 * you might create it on-demand in your service worker or have a static usage.
 */
export class ColdStorageSync {
  private isSyncing = false;
  private syncSource: string = SYNC_SOURCE.MANUAL;
  private totalSyncedRecords: number = 0;
  private syncStartTime: number = 0;

  constructor(source?: string) {
    this.syncSource = source || SYNC_SOURCE.MANUAL;
    console.log(`[ColdStorageSync] Service constructed, source: ${this.syncSource}`);
  }

  /**
   * Initialize 10-minute interval alarm-based scheduling for MV3
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
    console.log('[ColdStorageSync] Alarm scheduled for 10-minute sync intervals');
  }

  /**
   * This is your main entry point from the alarm listener or a manual trigger.
   */
  public async performSync(): Promise<void> {
    if (this.isSyncing) {
      console.log('[ColdStorageSync] Sync already in progress; skipping');
      return;
    }

    // Check if circuit breaker is open
    if (await this.isCircuitOpen()) {
      console.log('[ColdStorageSync] Circuit breaker open, skipping sync operation');
      return;
    }

    try {
      this.isSyncing = true;
      this.syncStartTime = Date.now();
      this.totalSyncedRecords = 0;
      
      console.log(`[ColdStorageSync] Starting sync operation... (source: ${this.syncSource})`);

      // Get the current database statistics for logging
      try {
        const db = await getDB();
        const pageCount = await db.pages.count();
        const visitCount = await db.visits.count();
        const sessionCount = await db.sessions.count();
        const eventCount = await db.events.count();
        
        console.log(
          `[ColdStorageSync] Database status - ` +
          `Pages: ${pageCount}, Visits: ${visitCount}, ` +
          `Sessions: ${sessionCount}, Events: ${eventCount}`
        );
      } catch (dbErr) {
        console.warn('[ColdStorageSync] Could not get database statistics:', dbErr);
      }

      // Perform the sync
      await this.syncData();

      // Record successful completion
      await chrome.storage.local.set({ [LAST_SYNC_KEY]: Date.now() });
      
      const syncDuration = Date.now() - this.syncStartTime;
      console.log(
        `[ColdStorageSync] Sync completed successfully in ${syncDuration}ms, ` +
        `synced ${this.totalSyncedRecords} records`
      );
      
      // Update circuit breaker and telemetry for success
      await this.recordSyncSuccess();
    } catch (error) {
      console.error('[ColdStorageSync] Sync failed:', error);
      
      // Report serious errors more prominently
      console.error('==========================================');
      console.error('DORY COLD STORAGE SYNC FAILED');
      if (error instanceof TypeError && error.message.includes('fetch')) {
        console.error('Network error - check internet connection');
      } else if (error instanceof Error && error.message.includes('HTTP 401')) {
        console.error('Authentication error - user may need to log in again');
      } else if (error instanceof Error && error.message.includes('HTTP 5')) {
        console.error('Server error - backend service may be down');
      }
      console.error('Error details:', error);
      console.error('==========================================');
      
      // Record failure in circuit breaker
      await this.recordSyncFailure(error);
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

    // First sync visits to have the data available for page duration calculations
    {
      const visits = await db.visits
        .where('startTime')
        .above(lastSyncTime)
        .toArray();

      // Create map of page durations using visit data
      const pageDurations: Record<string, number> = {};
      
      // Calculate total duration for each page by summing its visits
      for (const visit of visits) {
        const pageId = visit.pageId;
        const visitDuration = (visit.endTime || Date.now()) - visit.startTime;
        pageDurations[pageId] = (pageDurations[pageId] || 0) + visitDuration;
      }

      await this.syncCollection('visits', visits, userId);
      
      // Now sync pages with accurate duration data
      const pages = await db.pages
        .where('updatedAt')
        .above(lastSyncTime)
        .toArray();

      // Enhance pages with duration data before syncing
      const pagesWithDuration = pages.map(page => ({
        ...page,
        // Add calculated totalDuration if available, or fall back to estimate
        calculatedTotalDuration: pageDurations[page.pageId] || (page.lastVisit - page.firstVisit)
      }));

      await this.syncCollection('pages', pagesWithDuration, userId);
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
    const userId = await getCurrentUserId();
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
    let syncedCount = 0;

    for (let i = 0; i < enriched.length; i += BATCH_SIZE) {
      const batch = enriched.slice(i, i + BATCH_SIZE);
      
      try {
        const batchStartTime = Date.now();
        await this.sendBatch(collectionName, batch);
        const batchDuration = Date.now() - batchStartTime;
        
        syncedCount += batch.length;
        this.totalSyncedRecords += batch.length;
        
        console.log(
          `[ColdStorageSync] Synced ${collectionName} batch ` +
          `${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(enriched.length / BATCH_SIZE)} ` +
          `(${batch.length} records in ${batchDuration}ms)`
        );
      } catch (error: any) {
        console.error(`[ColdStorageSync] Error syncing ${collectionName} batch:`, error);
        
        // Check if we should stop entirely or continue with next batch
        if (error.message?.includes('HTTP 401') || error.message?.includes('HTTP 403')) {
          throw new Error(`Authentication error during ${collectionName} sync: ${error.message}`);
        }
        
        // For server errors, we'll throw to abort the entire sync
        if (error.message?.includes('HTTP 5')) {
          throw new Error(`Server error during ${collectionName} sync: ${error.message}`);
        }
        
        // For other errors, log but continue with next batch
        console.warn(`[ColdStorageSync] Continuing with next batch despite error in ${collectionName} sync`);
      }
    }
    
    console.log(
      `[ColdStorageSync] Completed ${collectionName} sync: ` +
      `${syncedCount}/${records.length} records synchronized`
    );
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
          totalActiveTime: p.totalActiveTime,
          // Use the accurately calculated total duration based on actual visits
          totalDuration: p.calculatedTotalDuration,
          lastModified: p.updatedAt
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

  /**
   * Checks if the circuit breaker is open (too many failures recently)
   */
  private async isCircuitOpen(): Promise<boolean> {
    const circuitData = await chrome.storage.local.get(CIRCUIT_BREAKER_KEY);
    const breakerState = circuitData[CIRCUIT_BREAKER_KEY];
    
    if (!breakerState) return false;
    
    // If we've had too many failures and we're within the reset time window
    if (
      breakerState.failureCount >= MAX_CONSECUTIVE_FAILURES && 
      Date.now() - breakerState.lastFailure < CIRCUIT_RESET_TIME_MS
    ) {
      console.log(`[ColdStorageSync] Circuit breaker open: ${breakerState.failureCount} consecutive failures`);
      return true;
    }
    
    // If the circuit reset time has passed, we can close the circuit
    if (Date.now() - breakerState.lastFailure >= CIRCUIT_RESET_TIME_MS) {
      console.log('[ColdStorageSync] Circuit breaker reset time reached, closing circuit');
      await this.resetCircuitBreaker();
    }
    
    return false;
  }
  
  /**
   * Record a failure in the circuit breaker
   */
  private async recordSyncFailure(error: any): Promise<void> {
    const circuitData = await chrome.storage.local.get(CIRCUIT_BREAKER_KEY);
    const breakerState = circuitData[CIRCUIT_BREAKER_KEY] || { failureCount: 0, lastFailure: 0 };
    
    breakerState.failureCount += 1;
    breakerState.lastFailure = Date.now();
    breakerState.lastError = error?.message || String(error);
    
    await chrome.storage.local.set({ [CIRCUIT_BREAKER_KEY]: breakerState });
    
    console.error(
      `[ColdStorageSync] Recorded sync failure #${breakerState.failureCount}: ${breakerState.lastError}`
    );
    
    // Update telemetry for failures
    await this.updateTelemetry(false, 0, error);
  }
  
  /**
   * Record a successful sync in the circuit breaker (resets failure count)
   */
  private async recordSyncSuccess(): Promise<void> {
    await chrome.storage.local.set({ 
      [CIRCUIT_BREAKER_KEY]: { 
        failureCount: 0, 
        lastFailure: 0,
        lastSuccess: Date.now()
      } 
    });
    
    // Update telemetry for success
    await this.updateTelemetry(true, this.totalSyncedRecords);
  }
  
  /**
   * Reset the circuit breaker
   */
  private async resetCircuitBreaker(): Promise<void> {
    await chrome.storage.local.set({ 
      [CIRCUIT_BREAKER_KEY]: { 
        failureCount: 0, 
        lastFailure: 0 
      } 
    });
    console.log('[ColdStorageSync] Circuit breaker reset');
  }
  
  /**
   * Track telemetry data about sync operations
   */
  private async updateTelemetry(
    success: boolean, 
    recordCount: number, 
    error?: any
  ): Promise<void> {
    const telemetryData = await chrome.storage.local.get(TELEMETRY_KEY);
    const telemetry = telemetryData[TELEMETRY_KEY] || {
      totalSyncs: 0,
      successfulSyncs: 0,
      failedSyncs: 0,
      recordsSynced: 0,
      lastSync: 0,
      syncSources: {}
    };
    
    // Update counts
    telemetry.totalSyncs += 1;
    if (success) {
      telemetry.successfulSyncs += 1;
      telemetry.recordsSynced += recordCount;
    } else {
      telemetry.failedSyncs += 1;
      telemetry.lastError = error?.message || String(error);
    }
    
    // Track by source
    telemetry.syncSources[this.syncSource] = 
      (telemetry.syncSources[this.syncSource] || 0) + 1;
    
    // Track timing
    const syncDuration = Date.now() - this.syncStartTime;
    telemetry.lastSync = Date.now();
    telemetry.lastSyncDuration = syncDuration;
    
    await chrome.storage.local.set({ [TELEMETRY_KEY]: telemetry });
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
 *  // On alarm (every 10 minutes):
 *  chrome.alarms.onAlarm.addListener(alarm => {
 *    if (alarm.name === 'doryColdStorageSync') {
 *      const syncer = new ColdStorageSync('alarm');
 *      syncer.performSync();
 *    }
 *  });
 */

// Export a singleton creator function to easily create a new instance with a source parameter
export const createColdStorageSyncer = (source?: string) => new ColdStorageSync(source);

// Export a default singleton for backward compatibility
export const coldStorageSync = new ColdStorageSync();

/**
 * Utility for development: resets the circuit breaker to allow sync to try again
 * after fixing schema issues.
 */
export async function resetColdStorageSyncCircuitBreaker(): Promise<void> {
  await chrome.storage.local.set({ 
    [CIRCUIT_BREAKER_KEY]: { 
      failureCount: 0, 
      lastFailure: 0,
      lastSuccess: Date.now() 
    } 
  });
  console.log('[ColdStorageSync] Circuit breaker has been reset');
}

/**
 * Manually trigger a cold storage sync for testing purposes
 */
export async function triggerManualColdStorageSync(): Promise<void> {
  console.log('[ColdStorageSync] Manually triggering cold storage sync...');
  await resetColdStorageSyncCircuitBreaker();
  return coldStorageSync.performSync();
}