/**
 * Cold Storage Sync Service
 * 
 * This service handles syncing local IndexedDB data to backend cold storage.
 * It runs once per day to efficiently batch-upload browsing data.
 * 
 * Design principles:
 * - KISS: Simple implementation with clear scheduling and error handling
 * - DRY: Reuses existing IndexedDB access code
 * - Efficient: Uses batching and low-priority background processing
 */

import { getDB } from './dexieDB';
import { getUserInfo } from '../auth/googleAuth';

// Configuration
const SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const BATCH_SIZE = 500; // Number of records to send in a single batch
const API_ENDPOINT = '/api/cold-storage'; // Update with your actual endpoint
const LAST_SYNC_KEY = 'lastColdStorageSync';

/**
 * Cold Storage Sync Service
 */
export class ColdStorageSync {
  private syncTimeoutId: number | null = null;
  private isSyncing = false;

  constructor() {
    console.log('[ColdStorageSync] Service initialized');
  }

  /**
   * Initialize the sync service and schedule the first sync
   */
  public initialize(): void {
    this.scheduleNextSync();
    console.log('[ColdStorageSync] Scheduled first sync');
  }

  /**
   * Schedule the next sync based on the last sync time
   */
  private scheduleNextSync(): void {
    // Clear any existing timeout
    if (this.syncTimeoutId !== null) {
      clearTimeout(this.syncTimeoutId);
    }

    // Get the last sync time
    const lastSync = localStorage.getItem(LAST_SYNC_KEY);
    const lastSyncTime = lastSync ? parseInt(lastSync, 10) : 0;
    const now = Date.now();

    // Calculate the time until next sync
    const timeSinceLastSync = now - lastSyncTime;
    const timeUntilNextSync = Math.max(0, SYNC_INTERVAL_MS - timeSinceLastSync);

    // Schedule the next sync
    this.syncTimeoutId = window.setTimeout(() => {
      this.performSync();
    }, timeUntilNextSync);

    const nextSyncDate = new Date(now + timeUntilNextSync);
    console.log(`[ColdStorageSync] Next sync scheduled for ${nextSyncDate.toLocaleString()}`);
  }

  /**
   * Perform the sync operation
   */
  public async performSync(): Promise<void> {
    if (this.isSyncing) {
      console.log('[ColdStorageSync] Sync already in progress, skipping');
      return;
    }

    try {
      this.isSyncing = true;
      console.log('[ColdStorageSync] Starting sync');

      // Use IdleCallback if available to minimize impact on user experience
      if ('requestIdleCallback' in window) {
        await new Promise<void>(resolve => {
          window.requestIdleCallback(
            () => {
              this.syncData().then(resolve);
            },
            { timeout: 60000 } // 1 minute timeout
          );
        });
      } else {
        // Fall back to direct execution if IdleCallback is not available
        await this.syncData();
      }

      // Record the successful sync time
      localStorage.setItem(LAST_SYNC_KEY, Date.now().toString());
      console.log('[ColdStorageSync] Sync completed successfully');
    } catch (error) {
      console.error('[ColdStorageSync] Sync failed:', error);
    } finally {
      this.isSyncing = false;
      this.scheduleNextSync();
    }
  }

  /**
   * Actually perform the data sync to cold storage
   */
  private async syncData(): Promise<void> {
    const db = await getDB();
    
    // Get the last sync timestamp or use a very old date as the default
    const lastSync = localStorage.getItem(LAST_SYNC_KEY);
    const lastSyncTime = lastSync ? parseInt(lastSync, 10) : 0;
    
    // Get current user ID for attaching to all records
    const userId = await this.getCurrentUserId();
    
    // Sync pages
    await this.syncCollection(
      'pages', 
      await db.pages.where('lastModified').above(lastSyncTime).toArray(),
      userId
    );
    
    // Sync visits
    await this.syncCollection(
      'visits',
      await db.visits.where('startTime').above(lastSyncTime).toArray(),
      userId
    );
    
    // Sync sessions
    await this.syncCollection(
      'sessions',
      await db.sessions.where('startTime').above(lastSyncTime).toArray(),
      userId
    );
    
    // Note: Content extraction events are sent directly to the backend
    // in real-time, so they are NOT included in the cold storage sync process.
    // According to payload.md, we are only syncing pages, visits, and sessions
    // collections, not events.
  }

  /**
   * Get the current user ID, with fallback to anonymous
   */
  private async getCurrentUserId(): Promise<string> {
    try {
      const userInfo = await getUserInfo();
      return userInfo?.id || 'anonymous';
    } catch (error) {
      console.warn('[ColdStorageSync] Failed to get user ID:', error);
      return 'anonymous';
    }
  }

  /**
   * Sync a collection of records to the backend
   */
  private async syncCollection(collectionName: string, records: any[], userId: string): Promise<void> {
    if (records.length === 0) {
      console.log(`[ColdStorageSync] No new ${collectionName} to sync`);
      return;
    }

    console.log(`[ColdStorageSync] Syncing ${records.length} ${collectionName} records`);
    
    // Ensure every record has a userId
    const enrichedRecords = records.map(record => ({
      ...record,
      userId: record.userId || userId // Use existing userId if present, otherwise add it
    }));
    
    // Split records into batches
    for (let i = 0; i < enrichedRecords.length; i += BATCH_SIZE) {
      const batch = enrichedRecords.slice(i, i + BATCH_SIZE);
      await this.sendBatch(collectionName, batch);
      console.log(`[ColdStorageSync] Synced batch ${Math.floor(i / BATCH_SIZE) + 1} of ${Math.ceil(enrichedRecords.length / BATCH_SIZE)}`);
    }
  }

  /**
   * Send a batch of records to the backend
   */
  private async sendBatch(collectionName: string, batch: any[]): Promise<void> {
    const endpoint = `${API_ENDPOINT}/${collectionName}`;
    
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(batch),
        // Ensure we include credentials for any cookies/auth headers
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error(`Server returned ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      console.error(`[ColdStorageSync] Failed to sync ${collectionName} batch:`, error);
      throw error; // Re-throw to handle in the calling function
    }
  }

  /**
   * Force an immediate sync
   */
  public async forceSyncNow(): Promise<void> {
    console.log('[ColdStorageSync] Forcing immediate sync');
    return this.performSync();
  }

  /**
   * Stop the sync service
   */
  public stop(): void {
    if (this.syncTimeoutId !== null) {
      clearTimeout(this.syncTimeoutId);
      this.syncTimeoutId = null;
    }
    console.log('[ColdStorageSync] Service stopped');
  }
}

// Export a singleton instance
export const coldStorageSync = new ColdStorageSync(); 