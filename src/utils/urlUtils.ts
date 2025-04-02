/**
 * @file urlUtils.ts
 * 
 * URL utilities for filtering and standardizing web URLs
 */

import { URL_FILTER_CONFIG } from '../config';

/**
 * Checks if a URL is a standard web page. 
 * This helps us skip internal pages like chrome://, devtools://, file://, etc.
 */
export function isWebPage(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://');
}

// Create Sets from config arrays for more efficient lookups
const IGNORED_URL_SCHEMES = URL_FILTER_CONFIG.IGNORED_URL_SCHEMES;
const GENERIC_TITLES = new Set(URL_FILTER_CONFIG.GENERIC_TITLES); 
const GOOGLE_SEARCH_DOMAINS = new Set(URL_FILTER_CONFIG.GOOGLE_SEARCH_DOMAINS);
const AUTH_PATH_ENDINGS = new Set(URL_FILTER_CONFIG.AUTH_PATH_ENDINGS);
const AUTH_TITLE_KEYWORDS = URL_FILTER_CONFIG.AUTH_TITLE_KEYWORDS;

/**
 * Checks if a given URL and title should be recorded or included in history results,
 * based on predefined filtering rules.
 *
 * @param url The URL of the page/history item.
 * @param title The title of the page/history item.
 * @param componentName Optional name of the calling component for logging.
 * @returns `true` if the entry should be included, `false` if it should be filtered out.
 */
export function shouldRecordHistoryEntry(
  url: string | undefined | null,
  title: string | undefined | null,
  componentName: string = 'HistoryFilter'
): boolean {
  // 1. Basic Existence Checks
  if (!url || !title) {
    // console.debug(`[${componentName}] Filtered due to missing URL or title:`, url, title);
    return false;
  }

  // 2. Filter out non-web pages
  if (!isWebPage(url)) {
    // console.debug(`[${componentName}] Filtered non-web page:`, url);
    return false;
  }

  // 3. Filter by URL Scheme
  const scheme = url.substring(0, url.indexOf(':') + 1).toLowerCase();
  if (IGNORED_URL_SCHEMES.includes(scheme)) {
    // console.debug(`[${componentName}] Filtered ignored scheme:`, url);
    return false;
  }

  // 4. Filter by Title
  const normalizedTitle = title.trim().toLowerCase();
  if (GENERIC_TITLES.has(normalizedTitle)) {
    // console.debug(`[${componentName}] Filtered generic title:`, url, title);
     return false;
  }

  // --- Updated Auth/Error Checks ---

  // 5. Filter Auth/Error Pages (URL Path and Title)
  try {
    const parsedUrl = new URL(url!);
    const pathname = parsedUrl.pathname.toLowerCase();
    const hostname = parsedUrl.hostname.toLowerCase();
    const searchParams = parsedUrl.searchParams;

    // Check URL Path Endings (handle potential trailing slash)
    const effectivePath = pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
    for (const ending of AUTH_PATH_ENDINGS) {
      if (effectivePath.endsWith(ending)) {
        // console.debug(`[${componentName}] Filtered auth/action path:`, url);
        return false;
      }
    }

    // Check Title Prefixes/Keywords (using the already normalized title)
    // This now checks if the normalized title *includes* any keyword for errors,
    // or *starts with* for auth/action prefixes.
    for (const keyword of AUTH_TITLE_KEYWORDS) {
      if (normalizedTitle.includes(keyword)) { // Changed to includes for broader matching (e.g., error codes)
        // Add specific startsWith check for auth terms if needed to avoid over-filtering
        // Example: if (keyword.includes('login') && !normalizedTitle.startsWith(keyword)) continue;
        // console.debug(`[${componentName}] Filtered auth/error title:`, url, title);
        return false;
      }
    }

    // --- End Updated Auth/Error Checks ---

    // 6. Filter Google SERPs
    if (GOOGLE_SEARCH_DOMAINS.has(hostname) && searchParams.has('q')) {
      // console.debug(`[${componentName}] Filtered Google SERP:`, url);
      return false;
    }
  } catch (e) {
     console.error(`[${componentName}] URL parsing error during filtering:`, url, e);
     return false; // Treat invalid URLs as filterable
  }

  // If all checks pass, include it
  return true;
}