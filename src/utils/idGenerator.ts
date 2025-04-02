/**
 * @file idGenerator.ts
 * 
 * Centralized utility for generating IDs across different database entities.
 * Each entity has its own specific ID format and generation requirements.
 */

import normalizeUrl from 'normalize-url';

// -------------------- Page ID Generator --------------------

/**
 * Generates a deterministic page ID from a URL.
 * Will always return the same ID for the same URL, even after normalization.
 * 
 * @param url The URL to generate a page ID for
 * @returns A consistent page ID for the given URL
 */
export function generatePageId(url: string): string {
  try {
    // Normalize the URL to create a consistent string
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
    console.error('[IdGenerator] Error generating page ID for URL:', url, error);
    
    // Create a safe fallback that's still deterministic
    const safeUrl = encodeURIComponent(url);
    return `page_fallback_${safeUrl.substring(0, 20)}`;
  }
}

// -------------------- Session ID Generator --------------------

/**
 * Generates a numeric UUID for session IDs.
 * Creates a random 47-bit positive integer (fits within JavaScript's safe integer range).
 * 
 * @returns A numeric ID for a browsing session
 */
export function generateSessionId(): number {
  // Get 6 random bytes (48 bits of randomness)
  const randomBytes = new Uint8Array(6);
  crypto.getRandomValues(randomBytes);
  
  // Convert to a numeric value
  let value = 0;
  for (let i = 0; i < randomBytes.length; i++) {
    value = (value << 8) | randomBytes[i];
  }
  
  // Mask to 47 bits to ensure it's a positive safe integer
  return value & 0x7FFFFFFFFFFF;
}

// -------------------- Edge ID Generator --------------------

/**
 * Generates a numeric UUID for edge IDs.
 * Creates a random 47-bit positive integer (fits within JavaScript's safe integer range).
 * 
 * @returns A numeric ID for a navigation edge
 */
export function generateEdgeId(): number {
  // Uses the same approach as session IDs
  return generateSessionId();
}

// -------------------- Visit ID Generator --------------------

/**
 * Generates a string UUID for visit IDs.
 * Format: v{timestamp}_{random}
 * 
 * @returns A string ID for a page visit record
 */
export function generateVisitId(): string {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
  return `v${timestamp}_${random}`;
}

// -------------------- Event ID Generator --------------------

/**
 * Generates a numeric UUID for event IDs.
 * Creates a random 47-bit positive integer (fits within JavaScript's safe integer range).
 * 
 * @returns A numeric ID for an event record
 */
export function generateEventId(): number {
  // Uses the same approach as session IDs
  return generateSessionId();
}

// -------------------- Generic ID Generator --------------------

/**
 * Enum of ID types for use with the generic generator
 */
export enum IdType {
  PAGE = 'page',
  SESSION = 'session',
  EDGE = 'edge',
  VISIT = 'visit',
  EVENT = 'event'
}

/**
 * Generic ID generator that can create IDs for any entity type.
 * 
 * @param type The type of entity to generate an ID for
 * @param params Additional parameters needed for certain ID types (e.g., URL for pages)
 * @returns An ID of the appropriate type for the specified entity
 */
export function generateId(type: IdType, params?: any): string | number {
  switch (type) {
    case IdType.PAGE:
      if (!params?.url) {
        throw new Error('[IdGenerator] URL is required for generating page IDs');
      }
      return generatePageId(params.url);
      
    case IdType.SESSION:
      return generateSessionId();
      
    case IdType.EDGE:
      return generateEdgeId();
      
    case IdType.VISIT:
      return generateVisitId();
      
    case IdType.EVENT:
      return generateEventId();
      
    default:
      throw new Error(`[IdGenerator] Unknown ID type: ${type}`);
  }
}

// Export default object with all generators
export default {
  generatePageId,
  generateSessionId,
  generateEdgeId,
  generateVisitId,
  generateEventId,
  generateId,
  IdType
};
