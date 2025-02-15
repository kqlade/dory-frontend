// src/services/queueDB.ts

console.log("[QueueDB] Starting initialization...");

import { openDB, DBSchema, IDBPDatabase } from "idb";
console.log("[QueueDB] idb imported successfully");

/**
 * We bump the version of the DB from 1 to 2 (or higher),
 * and in the interface we add optional fields lastProcessed, contentHash.
 * Because they are optional, we don't necessarily need to do a big migration step.
 */
interface QueueDB extends DBSchema {
  queue: {
    key: string; // Using the URL as the key
    value: {
      url: string;
      addedAt: number;
      visitTimestamps: number[];
      processed: boolean;

      // NEW optional fields
      lastProcessed?: number;  // Timestamp of last index
      contentHash?: string;    // For content-change detection
    };
  };
}

let dbPromise: Promise<IDBPDatabase<QueueDB>>;

/**
 * getDB function returns a promise that resolves to the IDB Database instance.
 */
export function getDB() {
  console.log("[QueueDB] getDB called");
  if (!dbPromise) {
    console.log("[QueueDB] Initializing database...");

    // Bump to version 2 (or higher) to reflect new fields in the schema
    dbPromise = openDB<QueueDB>("QueueDatabase", 2, {
      upgrade(db, oldVersion, newVersion, tx) {
        console.log("[QueueDB] Running upgrade function...", { oldVersion, newVersion });
        if (!db.objectStoreNames.contains("queue")) {
          console.log("[QueueDB] Creating queue store...");
          db.createObjectStore("queue", { keyPath: "url" });
        } else {
          // If we had to do something for existing records, we'd do it here.
          // For optional fields, no change is strictly necessary.
          console.log("[QueueDB] queue store already exists. Checking for migrations...");
          if (oldVersion < 2) {
            // If needed, you could do data migration logic:
            // e.g., read all items, add default lastProcessed or contentHash
            // But if optional, you can skip.
            console.log("[QueueDB] Migrating to version 2 - optional fields added.");
          }
        }
      },
    });
  }
  return dbPromise;
}