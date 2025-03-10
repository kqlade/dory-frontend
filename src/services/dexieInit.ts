/**
 * Dexie Database Initialization
 * 
 * This file handles initializing the Dexie.js database and setting up event logging.
 */

import { initializeDexieDB } from './dexieDB';
import { getUserInfo } from '../auth/googleAuth';

/**
 * Initialize the Dexie.js database and related services
 * @returns {Promise<boolean>} True if initialization succeeded and user is authenticated
 */
export async function initDexieSystem(): Promise<boolean> {
  try {
    console.log('[DexieInit] Starting Dexie.js database initialization...');
    
    // First, check if user is authenticated
    const userInfo = await getUserInfo();
    
    // If not authenticated, fail initialization
    if (!userInfo || !userInfo.id) {
      console.log('[DexieInit] Authentication required before initializing Dexie');
      return false;
    }
    
    // Initialize the database
    await initializeDexieDB();
    
    console.log('[DexieInit] Dexie.js database initialized successfully', 
      `for user: ${userInfo.email}`);
    
    return true;
  } catch (error) {
    console.error('[DexieInit] Error initializing Dexie.js database:', error);
    return false;
  }
}

export default {
  initDexieSystem
}; 