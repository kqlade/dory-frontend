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
 * Checks if the URL protocol is HTTP/HTTPS.
 */
function isHttpUrl(urlObj: URL): boolean {
  return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
}

/**
 * Checks if a URL is a Google search page or ephemeral Google page.
 */
function isGoogleSearch(urlObj: URL): boolean {
  const { hostname, pathname, searchParams } = urlObj;
  if (!hostname.includes('google.')) return false;

  // Basic search
  if (pathname.includes('/search') || (pathname === '/' && searchParams.has('q'))) {
    return true;
  }

  // Optionally skip ephemeral Google paths, like /maps or /imgres
  const ephemeralPaths = ['/maps', '/imgres', '/travel', '/flights'];
  if (ephemeralPaths.some(path => pathname.startsWith(path))) {
    return true;
  }

  return false;
}

/**
 * Checks if a URL is a Reddit listing page (but not a comments/post page).
 */
function isRedditListing(urlObj: URL): boolean {
  const { hostname, pathname } = urlObj;
  // e.g., reddit.com, old.reddit.com, new.reddit.com, i.redd.it, etc.
  // and also the shortened redd.it domain
  const isRedditDomain =
    hostname === 'reddit.com' ||
    hostname.endsWith('.reddit.com') ||
    hostname === 'redd.it' ||
    hostname.endsWith('.redd.it');

  if (!isRedditDomain) return false;

  // If it’s a comments/post page, we skip marking it as listing
  // We want to process actual posts, so let’s not skip these:
  // /r/something/comments/...
  const isCommentsPage = pathname.includes('/comments/');
  if (isCommentsPage) {
    return false;
  }

  // Typical listing endpoints
  const listingPaths = [
    '/r/all',
    '/r/popular',
    '/new',
    '/hot',
    '/rising',
    '/controversial',
    '/top'
  ];

  // Check if it's a subreddit listing pattern (e.g., /r/programming/, /r/programming/new)
  const subredditPattern = /^\/r\/[^/]+\/?$/;
  const subredditSortPattern = /^\/r\/[^/]+\/(new|hot|rising|controversial|top)/;
  const isSubredditListing =
    subredditPattern.test(pathname) || subredditSortPattern.test(pathname);

  return (
    pathname === '/' || // reddit.com home
    listingPaths.some(path => pathname.startsWith(path)) ||
    isSubredditListing
  );
}

/**
 * Checks if a URL is likely an authentication page (login/signup/etc.).
 */
function isAuthPage(urlObj: URL): boolean {
  const { pathname, searchParams } = urlObj;

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

  const pathLower = pathname.toLowerCase();
  const hasAuthPath = authPaths.some(auth =>
    pathLower === `/${auth}` ||
    pathLower.includes(`/${auth}/`) ||
    pathLower.endsWith(`/${auth}`)
  );

  const hasAuthParams =
    searchParams.has('login') ||
    searchParams.has('signup') ||
    searchParams.has('signin') ||
    searchParams.has('auth') ||
    searchParams.has('token');

  return hasAuthPath || hasAuthParams;
}

/**
 * Checks if the URL ends with a file extension we want to skip.
 * (Optional - customize if desired.)
 */
function hasSkipFileExtension(urlObj: URL): boolean {
  // Add whatever file types you want to skip
  const skipExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.pdf', '.zip', '.svg'];

  const pathnameLower = urlObj.pathname.toLowerCase();
  return skipExtensions.some(ext => pathnameLower.endsWith(ext));
}

/**
 * Master skip function: determines whether a URL should be skipped.
 */
function shouldSkipUrl(url: string): boolean {
  let urlObj: URL;
  try {
    urlObj = new URL(url);
  } catch (err) {
    // Malformed or invalid URL
    return true;
  }

  // Check protocol (skip non-HTTP(S) links)
  if (!isHttpUrl(urlObj)) return true;

  // Evaluate all domain/page-specific skip checks
  if (
    isGoogleSearch(urlObj) ||
    isRedditListing(urlObj) ||
    isAuthPage(urlObj) ||
    hasSkipFileExtension(urlObj)
  ) {
    return true;
  }

  // Extend with further skip checks as needed...
  return false;
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
    
    // Find the first unprocessed URL
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