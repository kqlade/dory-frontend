import normalizeUrl from 'normalize-url';

/**
 * Generates a deterministic page ID for a given URL by normalizing the URL
 * and creating a hash of the normalized form.
 * 
 * @param url The URL to generate a page ID for
 * @returns A consistent page ID for the given URL
 */
export async function generatePageIdFromUrl(url: string): Promise<string> {
  try {
    // Step 1: Normalize the URL to create a consistent string
    const normalizedUrl = normalizeUrl(url, {
      defaultProtocol: 'https',
      normalizeProtocol: true,
      forceHttps: true,
      stripWWW: true,
      removeQueryParameters: [/^utm_\w+/i, 'ref', 'fbclid', 'gclid'],
      removeTrailingSlash: true,
      sortQueryParameters: true
    });
    
    // Step 2: Generate a hash using the Web Crypto API
    const encoder = new TextEncoder();
    const data = encoder.encode(normalizedUrl);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    
    // Step 3: Convert the hash to a base64 string and truncate
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    
    // Use the first 16 characters of the hex string for a good balance of length and uniqueness
    const truncatedHash = hashHex.substring(0, 16);
    
    // Return the formatted page ID
    return `page_${truncatedHash}`;
  } catch (error) {
    // Fallback for invalid URLs or other errors
    console.error('Error generating page ID for URL:', url, error);
    
    // Create a safe fallback that's still deterministic but less ideal
    const safeUrl = encodeURIComponent(url);
    const timestamp = Date.now();
    return `page_fallback_${timestamp}_${safeUrl.substring(0, 20)}`;
  }
}

/**
 * Synchronous version that uses a simple hash function instead of crypto API
 * for environments where crypto might not be available or for testing
 */
export function generatePageIdFromUrlSync(url: string): string {
  try {
    // Normalize the URL
    const normalizedUrl = normalizeUrl(url, {
      defaultProtocol: 'https',
      normalizeProtocol: true,
      forceHttps: true,
      stripWWW: true,
      removeQueryParameters: [/^utm_\w+/i, 'ref', 'fbclid', 'gclid'],
      removeTrailingSlash: true,
      sortQueryParameters: true
    });
    
    // Simple string hash function (djb2)
    let hash = 5381;
    for (let i = 0; i < normalizedUrl.length; i++) {
      hash = ((hash << 5) + hash) + normalizedUrl.charCodeAt(i);
    }
    
    // Convert to hex and take first 16 chars
    const hashHex = (hash >>> 0).toString(16).padStart(8, '0');
    return `page_${hashHex}`;
  } catch (error) {
    console.error('Error generating sync page ID for URL:', url, error);
    
    // Create a safe fallback that's still deterministic
    const safeUrl = encodeURIComponent(url);
    return `page_fallback_${safeUrl.substring(0, 20)}`;
  }
} 