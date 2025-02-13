// src/services/queueManager.ts
console.log('[QueueManager] Starting initialization...');

console.log('[QueueManager] About to import queueDB...');
import { getDB } from '@/services/queueDB';
console.log('[QueueManager] queueDB imported successfully');

interface QueueEntry {
  url: string;
  addedAt: number;           // Timestamp when the URL was first added to the queue
  visitTimestamps: number[]; // Array of timestamps for each visit
  processed: boolean;        // Flag indicating if the URL has been processed
}

console.log('[QueueManager] About to define QueueManager class...');
class QueueManager {
  constructor() {
    console.log('[QueueManager] Instance created');
  }

  /**
   * Adds a single URL to the queue.
   * - If the URL already exists, update its visitTimestamps.
   * - Otherwise, create a new entry.
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
      await tx.store.put(existing);
      console.log('[QueueManager] Updated existing entry with new timestamp:', existing);
    } else {
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
   * Uses addUrl internally for each URL.
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
   */
  async markIndexed(url: string): Promise<void> {
    console.log('[QueueManager] Marking URL as processed:', url);
    const db = await getDB();
    const tx = db.transaction('queue', 'readwrite');
    const entry: QueueEntry | undefined = await tx.store.get(url);
    
    if (entry) {
      console.log('[QueueManager] Found entry to mark as processed:', entry);
      entry.processed = true;
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