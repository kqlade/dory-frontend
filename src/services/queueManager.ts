// src/services/queueManager.ts

console.log('[QueueManager] Starting initialization...');

console.log('[QueueManager] About to import queueDB...');
import { getDB } from '@/services/queueDB';
import { DocumentMetadata } from '@/api/types';
console.log('[QueueManager] queueDB imported successfully');

interface QueueEntry {
  url: string;
  processed: boolean;
  lastProcessed?: number;
  metadata?: DocumentMetadata;
}

console.log('[QueueManager] About to define QueueManager class...');
class QueueManager {
  constructor() {
    console.log('[QueueManager] Instance created');
  }

  /**
   * Adds a single URL to the queue.
   * During initial load, skip if URL exists.
   * During normal operation (new visits), add to queue for processing.
   */
  async addUrl(url: string, isInitialLoad: boolean = false): Promise<void> {
    if (!url) return;
    console.log('[QueueManager] Adding URL:', url, 'Initial load:', isInitialLoad);
    
    const db = await getDB();
    const tx = db.transaction('queue', 'readwrite');
    const existing: QueueEntry | undefined = await tx.store.get(url);

    if (existing) {
      if (!isInitialLoad) {
        // For new visits, always queue for processing
        existing.processed = false;
        await tx.store.put(existing);
        console.log('[QueueManager] Marked for processing:', url);
      } else {
        console.log('[QueueManager] Skipping existing URL during initial load:', url);
      }
    } else {
      // New entry - add to queue
      const entry: QueueEntry = {
        url,
        processed: false
      };
      await tx.store.put(entry);
      console.log('[QueueManager] Added new URL:', url);
    }

    await tx.done;
  }

  /**
   * Adds multiple URLs to the queue.
   */
  async addUrls(urls: string[], isInitialLoad: boolean = false): Promise<void> {
    console.log('[QueueManager] Adding URLs, count:', urls.length);
    for (const url of urls) {
      await this.addUrl(url, isInitialLoad);
    }
  }

  /**
   * Gets the next unprocessed URL from the queue.
   * Returns null if no unprocessed URLs exist.
   */
  async getNextUrl(): Promise<string | null> {
    const db = await getDB();
    const entries: QueueEntry[] = await db.getAll('queue');
    
    // Get first unprocessed URL
    const unprocessed = entries.find(entry => !entry.processed);
    if (!unprocessed) {
      console.log('[QueueManager] No unprocessed URLs in queue');
      return null;
    }

    console.log('[QueueManager] Next URL to process:', unprocessed.url);
    return unprocessed.url;
  }

  /**
   * Marks a URL as processed, regardless of success or failure.
   * This ensures we always move forward in the queue.
   */
  async markIndexed(url: string, metadata?: DocumentMetadata): Promise<void> {
    console.log('[QueueManager] Marking as processed:', url);
    const db = await getDB();
    const tx = db.transaction('queue', 'readwrite');
    const entry: QueueEntry | undefined = await tx.store.get(url);
    
    if (entry) {
      entry.processed = true;
      entry.lastProcessed = Date.now();
      if (metadata) {
        entry.metadata = metadata;
      }
      await tx.store.put(entry);
      console.log('[QueueManager] Marked as processed:', url);
    }
    
    await tx.done;
  }

  /**
   * Gets the count of unprocessed URLs in the queue.
   */
  async getQueueSize(): Promise<number> {
    const db = await getDB();
    const entries: QueueEntry[] = await db.getAll('queue');
    const count = entries.filter(entry => !entry.processed).length;
    console.log('[QueueManager] Unprocessed URLs in queue:', count);
    return count;
  }
}

export default new QueueManager();