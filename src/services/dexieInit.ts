/**
 * Dexie Database Initialization
 * 
 * This file handles initializing the Dexie.js database and setting up event logging.
 */

import { initializeDexieDB } from './dexieDB';
import { getUserInfo } from '../auth/googleAuth';

/**
 * Initialize the Dexie.js database and related services
 */
export async function initDexieSystem(): Promise<void> {
  try {
    console.log('[DexieInit] Starting Dexie.js database initialization...');
    
    // First, check if user is authenticated
    const userInfo = await getUserInfo();
    
    // Initialize the database
    await initializeDexieDB();
    
    console.log('[DexieInit] Dexie.js database initialized successfully', 
      userInfo ? `for user: ${userInfo.email}` : 'without user');
    
    // Register event handlers for authentication changes if needed
    
  } catch (error) {
    console.error('[DexieInit] Error initializing Dexie.js database:', error);
  }
}

export default {
  initDexieSystem
}; 