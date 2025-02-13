// src/services/queueDB.ts
console.log('[QueueDB] Starting initialization...');

console.log('[QueueDB] About to import idb...');
import { openDB, DBSchema, IDBPDatabase } from 'idb';
console.log('[QueueDB] idb imported successfully');

interface QueueDB extends DBSchema {
  queue: {
    key: string; // Using the URL as the key
    value: {
      url: string;
      addedAt: number;         // Timestamp when the URL was added to the queue
      visitTimestamps: number[]; // Array of visit timestamps
      processed: boolean;      // Flag indicating whether the URL has been processed
    };
  };
}

let dbPromise: Promise<IDBPDatabase<QueueDB>>;

export function getDB() {
  console.log('[QueueDB] getDB called');
  if (!dbPromise) {
    console.log('[QueueDB] Initializing database...');
    dbPromise = openDB<QueueDB>('QueueDatabase', 1, {
      upgrade(db) {
        console.log('[QueueDB] Running upgrade function...');
        if (!db.objectStoreNames.contains('queue')) {
          console.log('[QueueDB] Creating queue store...');
          db.createObjectStore('queue', { keyPath: 'url' });
        }
      },
    });
  }
  return dbPromise;
}