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

/**
 * Checks if a URL is a Google search page
 */
function isGoogleSearch(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.includes('google.') && 
           (urlObj.pathname.includes('/search') || 
            urlObj.pathname === '/' && urlObj.searchParams.has('q'));
  } catch {
    return false;
  }
}

/**
 * Checks if a URL is a Reddit listing page (but not a post)
 */
function isRedditListing(url: string): boolean {
  try {
    const urlObj = new URL(url);
    
    // Check for any Reddit domain variant
    // Handles: reddit.com, old.reddit.com, new.reddit.com, np.reddit.com, 
    // m.reddit.com, i.reddit.com, pay.reddit.com, de.reddit.com, etc.
    // But prevents fake domains like notreallyreddit.com
    const hostname = urlObj.hostname;
    const isRedditDomain = hostname === 'reddit.com' || 
                          hostname.endsWith('.reddit.com');
    if (!isRedditDomain) return false;
    
    // Skip these Reddit paths
    const listingPaths = [
      '/r/all',
      '/r/popular',
      '/new',
      '/hot',
      '/rising',
      '/controversial',
      '/top',
    ];

    // Check if it's a subreddit listing (e.g., /r/programming/, /r/programming/new)
    const subredditPattern = /^\/r\/[^/]+\/?$/;
    const subredditSortPattern = /^\/r\/[^/]+\/(new|hot|rising|controversial|top)/;
    const isSubredditListing = subredditPattern.test(urlObj.pathname) || 
                              subredditSortPattern.test(urlObj.pathname);

    // Check if it's a comments page
    const isCommentsPage = urlObj.pathname.includes('/comments/');
    
    return !isCommentsPage && (
      listingPaths.some(path => urlObj.pathname.startsWith(path)) ||
      urlObj.pathname === '/' || // Reddit home
      isSubredditListing
    );
  } catch {
    return false;
  }
}

/**
 * Checks if a URL is likely an authentication page (login/signup/etc)
 */
function isAuthPage(url: string): boolean {
  try {
    const urlObj = new URL(url);
    
    // Common auth-related paths
    const authPaths = [
      'login',
      'signin',
      'sign-in',
      'signup',
      'sign-up',
      'register',
      'authentication',
      'auth',
      'oauth',
      'sso',
      'forgot-password',
      'reset-password',
      'password/reset',
      'password/forgot',
      'verify',
      'verification',
      'confirm',
      'activate',
      '2fa',
      'mfa'
    ];

    // Check if any auth-related word is in the path
    const pathLower = urlObj.pathname.toLowerCase();
    const hasAuthPath = authPaths.some(path => 
      pathLower.includes(`/${path}`) || // Matches /login, /auth/login, etc.
      pathLower.includes(`/${path}/`) || // Matches /login/, /auth/login/, etc.
      pathLower === `/${path}` // Exact match for /login
    );

    // Check URL parameters for auth-related flags
    const hasAuthParams = urlObj.searchParams.has('login') ||
                         urlObj.searchParams.has('signup') ||
                         urlObj.searchParams.has('signin') ||
                         urlObj.searchParams.has('auth') ||
                         urlObj.searchParams.has('token');

    return hasAuthPath || hasAuthParams;
  } catch {
    return false;
  }
}

/**
 * Checks if a URL should be skipped for indexing
 */
function shouldSkipUrl(url: string): boolean {
  return isGoogleSearch(url) || 
         isRedditListing(url) || 
         isAuthPage(url);
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

    // Skip unwanted URLs early
    if (shouldSkipUrl(url)) {
      console.log('[QueueManager] Skipping unwanted URL:', url);
      return;
    }
    
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