// src/services/queueDB.ts

console.log("[QueueDB] Starting initialization...");

import { openDB, DBSchema, IDBPDatabase } from "idb";
import { DocumentMetadata } from "@/api/types";
console.log("[QueueDB] idb imported successfully");

/**
 * We bump the version of the DB from 1 to 2 (or higher),
 * and in the interface we add optional fields lastProcessed and metadata.
 * Because they are optional, we don't necessarily need to do a big migration step.
 */
interface QueueDB extends DBSchema {
  queue: {
    key: string; // Using the URL as the key
    value: {
      url: string;
      processed: boolean;
      lastProcessed?: number;  // Timestamp of last processing
      metadata?: DocumentMetadata;  // Document metadata when processed
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

    dbPromise = openDB<QueueDB>("QueueDatabase", 3, {
      upgrade(db, oldVersion, newVersion, tx) {
        console.log("[QueueDB] Running upgrade function...", { oldVersion, newVersion });
        if (!db.objectStoreNames.contains("queue")) {
          console.log("[QueueDB] Creating queue store...");
          db.createObjectStore("queue", { keyPath: "url" });
        }
      },
    });
  }
  return dbPromise;
}