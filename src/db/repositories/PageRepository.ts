/**
 * @file PageRepository.ts
 * 
 * Repository for working with page records in the database.
 * Provides methods to create, retrieve, update, and query web pages.
 */

import { DatabaseManager } from '../DatabaseCore';
import { PageRecord } from '../../types';
import { generatePageId } from '../../utils/idGenerator';

/**
 * Repository for managing page records in the database.
 */
export class PageRepository {
  /**
   * Get a page record by its URL
   * @param url The URL to look up
   * @returns The page record if found, undefined otherwise
   */
  async getByUrl(url: string): Promise<PageRecord | undefined> {
    const db = DatabaseManager.getCurrentDatabase();
    if (!db) throw new Error('No active database');
    
    return db.pages.where('url').equals(url).first();
  }
  
  /**
   * Get a page record by its ID
   * @param pageId The page ID to look up
   * @returns The page record if found, undefined otherwise
   */
  async getById(pageId: string): Promise<PageRecord | undefined> {
    const db = DatabaseManager.getCurrentDatabase();
    if (!db) throw new Error('No active database');
    
    return db.pages.get(pageId);
  }
  
  /**
   * Create or update a page record by URL
   * If the page exists, updates its visit count and last visit time
   * If the page doesn't exist, creates a new page record
   * 
   * @param url The URL of the page
   * @param title Optional title for the page
   * @param timestamp Optional timestamp for the visit (defaults to now)
   * @returns The page ID
   */
  async createOrUpdate(url: string, title?: string, timestamp?: number): Promise<string> {
    if (!url) {
      console.error('[PageRepository] Cannot create page record without URL');
      throw new Error('URL is required');
    }
    
    const now = timestamp || Date.now();
    const db = DatabaseManager.getCurrentDatabase();
    if (!db) throw new Error('No active database');
    
    try {
      // Check if we already have a page with this URL
      const existingPage = await this.getByUrl(url);
      
      if (existingPage) {
        // Update the existing page with new visit information
        await db.pages.update(existingPage.pageId, {
          lastVisit: now,
          visitCount: (existingPage.visitCount || 0) + 1,
          title: title || existingPage.title,
          updatedAt: now
        });
        
        return existingPage.pageId;
      }
      
      // Create a new page record
      const pageId = generatePageId(url);
      
      await db.pages.add({
        pageId,
        url,
        title: title || url,
        firstVisit: now,
        lastVisit: now,
        updatedAt: now,
        visitCount: 1,
        totalActiveTime: 0,
        domain: new URL(url).hostname,
        personalScore: 0.5,
        syncStatus: 'pending'
      });
      
      return pageId;
    } catch (error) {
      console.error('[PageRepository] Error creating/getting page:', error);
      throw error;
    }
  }
  
  /**
   * Update the active time for a page
   * @param pageId The ID of the page
   * @param duration The duration to add in seconds
   */
  async updateActiveTime(pageId: string, duration: number): Promise<void> {
    if (duration <= 0) return;
    
    const db = DatabaseManager.getCurrentDatabase();
    if (!db) throw new Error('No active database');
    
    const page = await this.getById(pageId);
    if (!page) {
      console.warn(`[PageRepository] Cannot update active time for unknown page: ${pageId}`);
      return;
    }
    
    await db.pages.update(pageId, {
      totalActiveTime: (page.totalActiveTime || 0) + duration,
      updatedAt: Date.now()
    });
  }
  
  /**
   * Get recently visited pages
   * @param limit Maximum number of pages to return
   * @returns Array of page records sorted by last visit time (descending)
   */
  async getRecentPages(limit = 10): Promise<PageRecord[]> {
    const db = DatabaseManager.getCurrentDatabase();
    if (!db) throw new Error('No active database');
    
    return db.pages
      .orderBy('lastVisit')
      .reverse()
      .limit(limit)
      .toArray();
  }
  
  /**
   * Find pages with a title or URL containing the search text
   * @param searchText The text to search for
   * @param limit Maximum number of results to return
   * @returns Array of matching page records
   */
  async search(searchText: string, limit = 20): Promise<PageRecord[]> {
    if (!searchText || searchText.trim().length < 2) {
      return [];
    }
    
    const db = DatabaseManager.getCurrentDatabase();
    if (!db) throw new Error('No active database');
    
    // Convert search text to lowercase for case-insensitive search
    const query = searchText.toLowerCase();
    
    // We have to do filtering in memory since IndexedDB 
    // doesn't support advanced text search
    return db.pages
      .filter(page => {
        const titleMatch = page.title?.toLowerCase().includes(query);
        const urlMatch = page.url?.toLowerCase().includes(query);
        return titleMatch || urlMatch;
      })
      .limit(limit)
      .toArray();
  }
  
  /**
   * Delete a page by ID
   * @param pageId The ID of the page to delete
   * @returns True if the page was deleted, false if it didn't exist
   */
  async deletePage(pageId: string): Promise<boolean> {
    const db = DatabaseManager.getCurrentDatabase();
    if (!db) throw new Error('No active database');
    
    try {
      await db.pages.delete(pageId);
      return true;
    } catch (error) {
      console.error(`[PageRepository] Error deleting page ${pageId}:`, error);
      return false;
    }
  }
  
  /**
   * Get all pages in the database
   * @returns Array of all page records
   */
  async getAllPages(): Promise<PageRecord[]> {
    const db = DatabaseManager.getCurrentDatabase();
    if (!db) throw new Error('No active database');
    
    return db.pages.toArray();
  }
  
  /**
   * Update a page's personal score
   * @param pageId The ID of the page
   * @param score The new personal score value
   */
  async updatePersonalScore(pageId: string, score: number): Promise<void> {
    const db = DatabaseManager.getCurrentDatabase();
    if (!db) throw new Error('No active database');
    
    await db.pages.update(pageId, {
      personalScore: score,
      updatedAt: Date.now()
    });
  }
  
  /**
   * Get the total count of page records
   * @returns Count of page records
   */
  async getCount(): Promise<number> {
    const db = DatabaseManager.getCurrentDatabase();
    if (!db) throw new Error('No active database');
    
    return db.pages.count();
  }
  
  /**
   * Get pages that were updated after a specific time
   * @param timestamp Only include pages updated after this time
   * @returns Array of page records
   */
  async getPagesUpdatedAfterTime(timestamp: number): Promise<PageRecord[]> {
    const db = DatabaseManager.getCurrentDatabase();
    if (!db) throw new Error('No active database');
    
    return db.pages
      .where('updatedAt')
      .above(timestamp)
      .toArray();
  }
}

// Create and export a singleton instance
export const pageRepository = new PageRepository();

// Default export for convenience
export default PageRepository;
