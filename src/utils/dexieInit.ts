/**
 * @file dexieInit.ts
 * 
 * Dexie Database Initialization
 * Ensures database is properly initialized.
 */

import { initializeDexieDB } from '../db/dexieDB';

/**
 * Initialize Dexie database system.
 * @returns Promise<boolean> => true if successful, else false.
 */
export async function initDexieSystem(): Promise<boolean> {
  try {
    console.log('[DexieInit] Initializing Dexie database...');
    
    // Initialize database without authentication dependency
    await initializeDexieDB();
    console.log('[DexieInit] Dexie DB initialized successfully');
    return true;
  } catch (err) {
    console.error('[DexieInit] Dexie initialization error:', err);
    return false;
  }
}

export default {
  initDexieSystem
};