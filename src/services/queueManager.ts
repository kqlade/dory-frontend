// src/services/queueManager.ts

console.log('[QueueManager] Starting initialization...');

console.log('[QueueManager] About to import queueDB...');
import { getDB } from '@/services/queueDB';
console.log('[QueueManager] queueDB imported successfully');

interface QueueEntry {
  url: string;
  addedAt: number;
  visitTimestamps: number[];
  processed: boolean;
  lastProcessed?: number;
  contentHash?: string;
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
   * - If 'processed' is true, we check if it's stale or the hash changed
   * - Otherwise, create a new entry with processed=false
   * 
   * @param url The URL to add or update
   * @param contentHash Optional. If you have a hash for the content, pass it.
   */
  async addUrl(url: string, contentHash?: string): Promise<void> {
    if (!url) return;
    console.log('[QueueManager] Attempting to add URL:', url);
    const db = await getDB();
    const tx = db.transaction('queue', 'readwrite');
    const existing: QueueEntry | undefined = await tx.store.get(url);
    const now = Date.now();

    if (existing) {
      console.log('[QueueManager] URL exists, current state:', existing);
      existing.visitTimestamps.push(now);

      // NEW: If already processed, check if the content changed or it's stale
      if (existing.processed) {
        // If a new contentHash is provided and it differs from the existing...
        if (contentHash && contentHash !== existing.contentHash) {
          console.log('[QueueManager] contentHash changed, unmarking processed');
          existing.processed = false;
          existing.contentHash = contentHash;
          // We might also clear lastProcessed or let it remain
        } else {
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
      } else {
        // If not processed, we can optionally update the contentHash if provided
        if (contentHash && contentHash !== existing.contentHash) {
          console.log('[QueueManager] Updating contentHash on unprocessed entry');
          existing.contentHash = contentHash;
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
        contentHash,
      };
      console.log('[QueueManager] Creating new entry:', entry);
      await tx.store.put(entry);
    }

    await tx.done;
    console.log('[QueueManager] Successfully added/updated URL:', url);
  }

  /**
   * Adds multiple URLs to the queue.
   * 
   * If you want to supply contentHash for each, you might accept an array of objects
   * or handle them individually. For now, just do the simple approach.
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
   * Marks a URL as processed. 
   * We also set lastProcessed = now, and optionally store the new contentHash if we have it.
   */
  async markIndexed(url: string, contentHash?: string): Promise<void> {
    console.log('[QueueManager] Marking URL as processed:', url);
    const db = await getDB();
    const tx = db.transaction('queue', 'readwrite');
    const entry: QueueEntry | undefined = await tx.store.get(url);
    
    if (entry) {
      console.log('[QueueManager] Found entry to mark as processed:', entry);
      entry.processed = true;
      entry.lastProcessed = Date.now();
      if (contentHash) {
        entry.contentHash = contentHash;
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