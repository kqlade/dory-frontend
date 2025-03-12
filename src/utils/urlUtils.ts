// src/utils/urlUtils.ts

/**
 * Checks if a URL is a standard web page. 
 * This helps us skip internal pages like chrome://, devtools://, file://, etc.
 */
export function isWebPage(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://');
}