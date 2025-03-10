/**
 * Database module index file
 * 
 * This file exports the Dexie.js-based implementation of the Dory local database.
 * All database access should go through this module for consistent access patterns.
 */

// Re-export everything from the Dexie implementation
export * from './dexieDB';

// Re-export the example database operations for convenience
export * from './dexieExample';

// Import for default exports
import dexieDB from './dexieDB';
import dexieExample from './dexieExample';

// Export a combined default with both modules
export default {
  // Core database functionality
  ...dexieDB,
  // Example database operations
  ...dexieExample
}; 