/**
 * @file MetadataRepository.ts
 * 
 * Repository for working with application metadata in the database.
 * Provides methods to save and retrieve key-value pairs.
 */

import { DatabaseManager } from '../DatabaseCore';
import { MetadataRecord } from '../../types';

/**
 * Repository for managing metadata records in the database
 */
export class MetadataRepository {
  /**
   * Get a metadata record by its key
   * @param key The metadata key to look up
   * @returns The metadata record if found, undefined otherwise
   */
  async getByKey(key: string): Promise<MetadataRecord | undefined> {
    const db = DatabaseManager.getCurrentDatabase();
    if (!db) throw new Error('No active database');
    
    return db.metadata.get(key);
  }
  
  /**
   * Save a value with the specified key
   * @param key The metadata key
   * @param value The value to store
   * @returns The updated metadata record
   */
  async saveValue(key: string, value: string): Promise<void> {
    const db = DatabaseManager.getCurrentDatabase();
    if (!db) throw new Error('No active database');
    
    await db.metadata.put({
      key,
      value,
      updatedAt: Date.now()
    });
  }
  
  /**
   * Get all metadata records
   * @returns Array of all metadata records
   */
  async getAllMetadata(): Promise<MetadataRecord[]> {
    const db = DatabaseManager.getCurrentDatabase();
    if (!db) throw new Error('No active database');
    
    return db.metadata.toArray();
  }
  
  /**
   * Delete a metadata record by key
   * @param key The key to delete
   * @returns True if deleted, false if not found
   */
  async deleteByKey(key: string): Promise<boolean> {
    const db = DatabaseManager.getCurrentDatabase();
    if (!db) throw new Error('No active database');
    
    try {
      await db.metadata.delete(key);
      return true;
    } catch (error) {
      console.error(`[MetadataRepository] Error deleting metadata ${key}:`, error);
      return false;
    }
  }
}

// Create and export a singleton instance
export const metadataRepository = new MetadataRepository();

// Default export for convenience
export default MetadataRepository;
