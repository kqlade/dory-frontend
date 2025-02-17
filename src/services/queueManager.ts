// src/services/queueManager.ts

console.log('[QueueManager] Starting initialization...');

console.log('[QueueManager] About to import queueDB...');
import { getDB } from '@/services/queueDB';
import { DocumentMetadata } from '@/api/types';
console.log('[QueueManager] queueDB imported successfully');

interface QueueEntry {
  url: string;
  addedAt: number;
  visitTimestamps: number[];
  processed: boolean;
  lastProcessed?: number;
  metadata?: DocumentMetadata;
}

const STALE_THRESHOLD = 7 * 24 * 60 * 60 * 1000; // e.g. 7 days in ms

console.log('[QueueManager] About to define QueueManager class...');
class QueueManager {
  constructor() {
    console.log('[QueueManager] Instance created');
  }

  /**
   * Adds a single URL to the queue.
   * - If the URL already exists, update its visitTimestamps.
   * - If 'processed' is true, we check if it's stale
   * - Otherwise, create a new entry with processed=false
   * 
   * @param url The URL to add or update
   */
  async addUrl(url: string): Promise<void> {
    if (!url) return;
    console.log('[QueueManager] Attempting to add URL:', url);
    const db = await getDB();
    const tx = db.transaction('queue', 'readwrite');
    const existing: QueueEntry | undefined = await tx.store.get(url);
    const now = Date.now();

    if (existing) {
      console.log('[QueueManager] URL exists, current state:', existing);
      existing.visitTimestamps.push(now);

      // If already processed, check if it's stale
      if (existing.processed) {
        // time-based approach: if it's older than threshold, we unmark
        if (
          existing.lastProcessed &&
          now - existing.lastProcessed > STALE_THRESHOLD
        ) {
          console.log(
            '[QueueManager] lastProcessed is stale, unmarking processed'
          );
          existing.processed = false;
        }
      }

      await tx.store.put(existing);
      console.log('[QueueManager] Updated existing entry:', existing);

    } else {
      // NEW ENTRY
      const entry: QueueEntry = {
        url,
        addedAt: now,
        visitTimestamps: [now],
        processed: false,
      };
      console.log('[QueueManager] Creating new entry:', entry);
      await tx.store.put(entry);
    }

    await tx.done;
    console.log('[QueueManager] Successfully added/updated URL:', url);
  }

  /**
   * Adds multiple URLs to the queue.
   */
  async addUrls(urls: string[]): Promise<void> {
    console.log('[QueueManager] Adding multiple URLs:', urls.length);
    for (const url of urls) {
      await this.addUrl(url);
    }
    console.log('[QueueManager] Finished adding all URLs');
  }

  /**
   * Retrieves the next unprocessed URL.
   * Returns null if no unprocessed URL exists.
   */
  async getNextUrl(): Promise<string | null> {
    console.log('[QueueManager] Getting next unprocessed URL');
    const db = await getDB();
    const entries: QueueEntry[] = await db.getAll('queue');
    console.log('[QueueManager] Total entries in queue:', entries.length);
    
    // Filter out processed entries
    const unprocessed = entries.filter((entry) => !entry.processed);
    console.log('[QueueManager] Unprocessed entries:', unprocessed.length);
    
    if (unprocessed.length === 0) {
      console.log('[QueueManager] No unprocessed URLs available');
      return null;
    }

    // Sort by addedAt ascending (oldest first)
    unprocessed.sort((a, b) => a.addedAt - b.addedAt);
    const nextUrl = unprocessed[0].url;
    console.log('[QueueManager] Next URL to process:', nextUrl);
    return nextUrl;
  }

  /**
   * Marks a URL as processed and updates its metadata.
   */
  async markIndexed(url: string, metadata?: DocumentMetadata): Promise<void> {
    console.log('[QueueManager] Marking URL as processed:', url);
    const db = await getDB();
    const tx = db.transaction('queue', 'readwrite');
    const entry: QueueEntry | undefined = await tx.store.get(url);
    
    if (entry) {
      console.log('[QueueManager] Found entry to mark as processed:', entry);
      entry.processed = true;
      entry.lastProcessed = Date.now();
      if (metadata) {
        entry.metadata = metadata;
      }
      await tx.store.put(entry);
      console.log('[QueueManager] Successfully marked as processed:', entry);
    } else {
      console.warn('[QueueManager] No entry found for URL:', url);
    }
    
    await tx.done;
  }

  /**
   * Returns the number of unprocessed entries in the queue.
   */
  async getQueueSize(): Promise<number> {
    const db = await getDB();
    const entries: QueueEntry[] = await db.getAll('queue');
    const unprocessed = entries.filter((entry) => !entry.processed);
    console.log('[QueueManager] Queue status - Total:', entries.length, 'Unprocessed:', unprocessed.length);
    return unprocessed.length;
  }
}

export default new QueueManager();