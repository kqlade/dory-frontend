/**
 * Utility functions for working with website favicons
 */

/**
 * Extract the domain from a URL
 * @param url The full URL
 * @returns The domain part of the URL
 */
export function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch (e) {
    // Handle invalid URLs gracefully
    console.error('Invalid URL:', url);
    return '';
  }
}

/**
 * Get a favicon URL for a website URL
 * @param url The website URL to get the favicon for
 * @param size The size of the favicon (default: 16)
 * @returns The URL to the favicon
 */
export function getFaviconUrl(url: string, size: number = 16): string {
  if (!url) return '';
  
  try {
    // Check if we're in a Chrome extension context
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      // Use Chrome's internal favicon service
      return `chrome://favicon/size/${size}@1x/${url}`;
    }
  } catch (e) {
    console.error('Error using Chrome favicon API:', e);
  }
  
  // Fallback to Google's favicon service
  const domain = extractDomain(url);
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=${size}`;
} 