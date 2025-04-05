/**
 * @file urlUtils.ts
 * 
 * URL utilities for filtering and standardizing web URLs
 */

import { URL_FILTER_CONFIG } from '../config';
import { parse as parseTld } from 'tldts';

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
// Pre-compile the regex patterns for efficiency
const AUTH_TITLE_REGEXPS = AUTH_TITLE_KEYWORDS.map(pattern => new RegExp(pattern, 'i'));

/**
 * Extracts both the full domain (hostname without www.) and root domain (registrable domain) from a URL string.
 * Uses tldts library for accurate parsing based on the Public Suffix List.
 */
export function extractDomains(url: string): { fullDomain: string; rootDomain: string } {
  try {
    // tldts handles URLs without protocol reasonably well, but prepending ensures consistency.
    const urlWithProtocol = url.startsWith('http') ? url : `https://${url}`;
    const result = parseTld(urlWithProtocol);

    // Check if parsing was successful and we got a hostname
    if (!result.hostname) {
      console.warn('Could not parse hostname from URL:', url);
      return { fullDomain: '', rootDomain: '' };
    }

    // fullDomain: normalized hostname (remove www.)
    const fullDomain = result.hostname.replace(/^www\./, '');

    // rootDomain: registrable domain (e.g., example.com, example.co.uk)
    // Fallback to fullDomain if root domain isn't available (e.g., for IPs, localhost)
    const rootDomain = result.domain || fullDomain;

    if (!result.domain) {
      console.debug('Could not determine registrable domain via tldts for:', url, '- using hostname as fallback for root domain.');
    }

    return { fullDomain, rootDomain };

  } catch (error) {
    // Catch potential errors from URL parsing or other unexpected issues.
    console.error('Error in extractDomains:', error, 'URL:', url);
    return { fullDomain: '', rootDomain: '' };
  }
}

/**
 * Normalizes a URL into a canonical string representation suitable for generating a stable Page ID,
 * OR returns the original URL if normalization fails.
 * The format is typically: lowercase_hostname + pathname (with trailing slash removed unless root).
 * Ignores protocol, query parameters, and fragments during normalization.
 * @returns The normalized string, or the original URL string if normalization cannot be completed.
 */
export function normalizeUrlForId(url: string): string {
  try {
    // 1. Use standard URL API for initial parsing and path extraction
    const parsedURL = new URL(url);
    let pathname = parsedURL.pathname;

    // 2. Use tldts for robust hostname extraction
    const tldResult = parseTld(url);
    const hostname = tldResult.hostname;

    // Handle cases where tldts couldn't parse a hostname
    if (!hostname) {
      console.warn(`[normalizeUrlForId] Could not extract hostname using tldts for: ${url}. Falling back to original URL.`);
      return url; // <-- Fallback to original URL
    }

    // 3. Normalize Path: Remove trailing slash if desired (and not root)
    if (pathname !== '/' && pathname.endsWith('/')) {
      pathname = pathname.slice(0, -1);
    }

    // 4. Construct the canonical identifier (lowercase hostname for consistency)
    const canonicalIdentifier = `${hostname.toLowerCase()}${pathname}`;

    return canonicalIdentifier;

  } catch (error) {
    console.warn(`[normalizeUrlForId] Error normalizing URL "${url}": ${error}. Falling back to original URL.`);
    return url; // <-- Fallback to original URL on any error
  }
}

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

  // 4. Filter by Title (Exact Generic Titles)
  const normalizedTitle = title.trim().toLowerCase(); // Keep lowercasing for GENERIC_TITLES check
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

    // Check Title Keywords using Regex (Use original title for case-insensitive regex)
    // No need to lowercase the title here, regex flag 'i' handles it.
    for (const regex of AUTH_TITLE_REGEXPS) {
      if (regex.test(title)) { // Use regex.test() on the original title
        // console.debug(`[${componentName}] Filtered auth/error title via regex:`, regex.source, url, title);
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