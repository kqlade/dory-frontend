/**
 * @file dexieInit.ts
 * 
 * Dexie Database Initialization
 * Ensures a user is authenticated before fully initializing the Dexie system.
 */

import { initializeDexieDB } from '../db/dexieDB';
import { getUserInfo } from '../auth/googleAuth';

/**
 * Initialize Dexie if user is authenticated.
 * @returns Promise<boolean> => true if successful and user is authenticated, else false.
 */
export async function initDexieSystem(): Promise<boolean> {
  try {
    console.log('[DexieInit] Checking user auth before Dexie init...');
    const userInfo = await getUserInfo();

    if (!userInfo?.id) {
      console.log('[DexieInit] No user or missing user ID => Dexie init aborted.');
      return false;
    }

    await initializeDexieDB();
    console.log('[DexieInit] Dexie DB initialized for user:', userInfo.email);
    return true;
  } catch (err) {
    console.error('[DexieInit] Dexie initialization error:', err);
    return false;
  }
}

export default {
  initDexieSystem
};