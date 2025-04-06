/**
 * @file VisitRepository.ts
 * 
 * Repository for working with page visit records in the database.
 * Visits represent specific instances of viewing a page within a session.
 */

import { DatabaseManager } from '../DatabaseCore';
import { VisitRecord } from '../../types';
import { generateVisitId } from '../../utils/idGenerator';

/**
 * Repository for managing page visit records
 */
export class VisitRepository {
  /**
   * Start a new visit to a page
   * @param pageId The ID of the page being visited
   * @param sessionId The ID of the current browsing session
   * @param fromPageId Optional ID of the page navigated from
   * @param isBackNavigation Whether this is a back/forward navigation
   * @returns The new visit ID
   */
  async startVisit(
    pageId: string,
    sessionId: number,
    fromPageId?: string,
    isBackNavigation: boolean = false
  ): Promise<string> {
    const db = DatabaseManager.getCurrentDatabase();
    if (!db) throw new Error('No active database');
    
    if (!pageId || !sessionId) {
      throw new Error('Page ID and session ID are required to start a visit');
    }
    
    const now = Date.now();
    const visitId = generateVisitId();
    
    try {
      // Create a new visit record
      await db.visits.add({
        visitId,
        pageId,
        sessionId,
        fromPageId,
        startTime: now,
        totalActiveTime: 0,
        isBackNavigation
      });
      
      return visitId;
    } catch (error) {
      console.error('[VisitRepository] Error starting visit:', error);
      throw error;
    }
  }
  
  /**
   * End a visit by setting its end time
   * @param visitId The ID of the visit to end
   * @param endTime Optional timestamp when the visit ended (defaults to now)
   */
  async endVisit(visitId: string, endTime: number = Date.now()): Promise<void> {
    const db = DatabaseManager.getCurrentDatabase();
    if (!db) throw new Error('No active database');
    
    if (!visitId) {
      console.warn('[VisitRepository] Cannot end visit: no visit ID provided');
      return;
    }
    
    try {
      const visit = await db.visits.get(visitId);
      if (!visit) {
        console.warn(`[VisitRepository] Cannot end visit: visit ${visitId} not found`);
        return;
      }
      
      // If already ended, just update if the new end time is later
      if (visit.endTime && visit.endTime > endTime) {
        return;
      }
      
      // Only set the end time, preserve the existing totalActiveTime
      // which is accumulated through visibility events
      await db.visits.update(visitId, {
        endTime
      });
    } catch (error) {
      console.error(`[VisitRepository] Error ending visit ${visitId}:`, error);
      throw error;
    }
  }
  
  /**
   * Update the active time for a visit
   * @param visitId The ID of the visit
   * @param duration The duration to add in seconds
   */
  async updateActiveTime(visitId: string, duration: number): Promise<void> {
    if (duration <= 0) return;
    
    const db = DatabaseManager.getCurrentDatabase();
    if (!db) throw new Error('No active database');
    
    if (!visitId) {
      console.warn('[VisitRepository] Cannot update active time: no visit ID provided');
      return;
    }
    
    try {
      const visit = await db.visits.get(visitId);
      if (!visit) {
        console.warn(`[VisitRepository] Cannot update active time: visit ${visitId} not found`);
        return;
      }
      
      await db.visits.update(visitId, {
        totalActiveTime: (visit.totalActiveTime || 0) + duration
      });
    } catch (error) {
      console.error(`[VisitRepository] Error updating active time for visit ${visitId}:`, error);
      throw error;
    }
  }
  
  /**
   * Get a visit by its ID
   * @param visitId The visit ID
   * @returns The visit record or undefined if not found
   */
  async getVisit(visitId: string): Promise<VisitRecord | undefined> {
    const db = DatabaseManager.getCurrentDatabase();
    if (!db) throw new Error('No active database');
    
    return db.visits.get(visitId);
  }
  
  /**
   * Get all visits for a specific page
   * @param pageId The page ID
   * @param limit Maximum number of visits to return
   * @returns Array of visit records for the page
   */
  async getVisitsForPage(pageId: string, limit = 50): Promise<VisitRecord[]> {
    const db = DatabaseManager.getCurrentDatabase();
    if (!db) throw new Error('No active database');
    
    return db.visits
      .where('pageId')
      .equals(pageId)
      .reverse() // Most recent first
      .limit(limit)
      .toArray();
  }
  
  /**
   * Get all visits within a specific session
   * @param sessionId The session ID
   * @returns Array of visit records in the session
   */
  async getVisitsForSession(sessionId: number): Promise<VisitRecord[]> {
    const db = DatabaseManager.getCurrentDatabase();
    if (!db) throw new Error('No active database');
    
    return db.visits
      .where('sessionId')
      .equals(sessionId)
      .toArray();
  }
  
  /**
   * Get the most recent visits across all pages
   * @param limit Maximum number of visits to return
   * @returns Array of recent visit records
   */
  async getRecentVisits(limit = 20): Promise<VisitRecord[]> {
    const db = DatabaseManager.getCurrentDatabase();
    if (!db) throw new Error('No active database');
    
    // This requires loading all visits and sorting in memory
    // since IndexedDB doesn't support sorting by non-indexed fields
    // Consider adding an index if this becomes a performance issue
    return db.visits
      .toArray()
      .then(visits => visits
        .sort((a, b) => (b.startTime || 0) - (a.startTime || 0))
        .slice(0, limit)
      );
  }
  
  /**
   * Delete visits associated with a page
   * @param pageId The page ID
   * @returns Number of visits deleted
   */
  async deleteVisitsForPage(pageId: string): Promise<number> {
    const db = DatabaseManager.getCurrentDatabase();
    if (!db) throw new Error('No active database');
    
    return db.visits
      .where('pageId')
      .equals(pageId)
      .delete();
  }
  
  /**
   * Delete visits associated with a session
   * @param sessionId The session ID
   * @returns Number of visits deleted
   */
  async deleteVisitsForSession(sessionId: number): Promise<number> {
    const db = DatabaseManager.getCurrentDatabase();
    if (!db) throw new Error('No active database');
    
    return db.visits
      .where('sessionId')
      .equals(sessionId)
      .delete();
  }
  
  /**
   * Get all visits in the database
   * @returns Array of all visit records
   */
  async getAllVisits(): Promise<VisitRecord[]> {
    const db = DatabaseManager.getCurrentDatabase();
    if (!db) throw new Error('No active database');
    
    return db.visits.toArray();
  }
  
  /**
   * Get the total count of visit records
   * @returns Count of visit records
   */
  async getCount(): Promise<number> {
    const db = DatabaseManager.getCurrentDatabase();
    if (!db) throw new Error('No active database');
    
    return db.visits.count();
  }
  
  /**
   * Get visits that occurred after a specific time
   * @param timestamp Only include visits after this time
   * @returns Array of visit records
   */
  async getVisitsAfterTime(timestamp: number): Promise<VisitRecord[]> {
    const db = DatabaseManager.getCurrentDatabase();
    if (!db) throw new Error('No active database');
    
    return db.visits
      .where('startTime')
      .above(timestamp)
      .toArray();
  }
}

// Create and export a singleton instance
export const visitRepository = new VisitRepository();

// Default export for convenience
export default VisitRepository;
