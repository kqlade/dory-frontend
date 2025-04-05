/**
 * @file idGenerator.ts
 * 
 * Centralized utility for generating IDs across different database entities.
 * Each entity has its own specific ID format and generation requirements.
 */

import { parse as parseTld } from 'tldts'; // Keep tldts if needed elsewhere, or remove if not.

// Helper function to convert ArrayBuffer to hex string
function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// -------------------- Page ID Generator --------------------

/**
 * Generates a deterministic page ID (SHA-256 hash) from a pre-normalized URL identifier
 * or the original URL if normalization failed.
 * The input should be the output of normalizeUrlForId.
 * 
 * @param identifier The canonical string representation or original URL.
 * @returns A Promise resolving to a consistent page ID string (e.g., "page_sha256hex"), or null on hashing error.
 */
export async function generatePageId(identifier: string): Promise<string | null> {
  try {
    // 1. Encode the identifier string to UTF-8 bytes
    const encoder = new TextEncoder();
    const data = encoder.encode(identifier);

    // 2. Calculate SHA-256 hash
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);

    // 3. Convert hash to hex string
    const hashHex = bufferToHex(hashBuffer);

    // 4. Return prefixed ID
    return `page_${hashHex}`;

  } catch (error) {
    console.error(`[IdGenerator] Error generating page ID hash for identifier "${identifier}":`, error);
    return null; // Return null only on hashing error
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
 * Now handles async page ID generation.
 * 
 * @param type The type of entity to generate an ID for
 * @param params Additional parameters needed for certain ID types (e.g., normalizedIdentifier for pages)
 * @returns A Promise resolving to an ID (string | number) or the ID directly for sync types.
 */
export async function generateId(type: IdType, params?: any): Promise<string | number | null> {
  switch (type) {
    case IdType.PAGE:
      if (!params?.normalizedIdentifier) {
        throw new Error('[IdGenerator] normalizedIdentifier is required for generating page IDs');
      }
      // generatePageId is now async
      return generatePageId(params.normalizedIdentifier);
      
    case IdType.SESSION:
      // generateSessionId is sync
      return Promise.resolve(generateSessionId()); 
      
    case IdType.EDGE:
      // generateEdgeId is sync
      return Promise.resolve(generateEdgeId()); 
      
    case IdType.VISIT:
      // generateVisitId is sync
      return Promise.resolve(generateVisitId()); 
      
    case IdType.EVENT:
      // generateEventId is sync
      return Promise.resolve(generateEventId()); 
      
    default:
      // Use Promise.reject for consistency in async function
      return Promise.reject(new Error(`[IdGenerator] Unknown ID type: ${type}`));
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
