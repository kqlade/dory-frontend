/**
 * @file EdgeRepository.ts
 * 
 * Repository for working with navigation edges in the database.
 * Edges represent connections between pages, forming the navigation graph.
 */

import { DatabaseManager } from '../DatabaseCore';
import { EdgeRecord } from '../../types';
import { generateEdgeId } from '../../utils/idGenerator';

/**
 * Repository for managing navigation edges between pages
 */
export class EdgeRepository {
  /**
   * Create or update an edge between two pages
   * If an edge already exists in the same session, increments its count
   * Otherwise, creates a new edge
   * 
   * @param fromPageId The source page ID
   * @param toPageId The destination page ID
   * @param sessionId The session ID when this navigation occurred
   * @param timestamp When the navigation happened
   * @param isBackNavigation Whether this was a back/forward navigation
   * @returns The edge ID
   */
  async createOrUpdate(
    fromPageId: string,
    toPageId: string,
    sessionId: number,
    timestamp: number = Date.now(),
    isBackNavigation: boolean = false
  ): Promise<number> {
    const db = DatabaseManager.getCurrentDatabase();
    if (!db) throw new Error('No active database');
    
    if (!fromPageId || !toPageId || !sessionId) {
      throw new Error('Missing required parameters for edge creation');
    }
    
    try {
      // Try to find an existing edge with the same fromPageId, toPageId, and sessionId
      const existingEdge = await db.edges
        .where('[fromPageId+toPageId+sessionId]')
        .equals([fromPageId, toPageId, sessionId])
        .first();
      
      if (existingEdge) {
        // Update the existing edge
        await db.edges.update(existingEdge.edgeId, {
          count: (existingEdge.count || 0) + 1,
          lastTraversal: timestamp,
          isBackNavigation: isBackNavigation || existingEdge.isBackNavigation
        });
        
        return existingEdge.edgeId;
      }
      
      // Create a new edge
      const edgeId = generateEdgeId();
      
      await db.edges.add({
        edgeId,
        fromPageId,
        toPageId,
        sessionId,
        timestamp,
        count: 1,
        firstTraversal: timestamp,
        lastTraversal: timestamp,
        isBackNavigation
      });
      
      return edgeId;
    } catch (error) {
      console.error('[EdgeRepository] Error creating/updating edge:', error);
      throw error;
    }
  }
  
  /**
   * Get edges starting from a specific page
   * @param fromPageId The source page ID
   * @param limit Maximum number of edges to return
   * @returns Array of edges originating from the page
   */
  async getOutgoingEdges(fromPageId: string, limit = 50): Promise<EdgeRecord[]> {
    const db = DatabaseManager.getCurrentDatabase();
    if (!db) throw new Error('No active database');
    
    return db.edges
      .where('fromPageId')
      .equals(fromPageId)
      .limit(limit)
      .toArray();
  }
  
  /**
   * Get edges pointing to a specific page
   * @param toPageId The destination page ID
   * @param limit Maximum number of edges to return
   * @returns Array of edges pointing to the page
   */
  async getIncomingEdges(toPageId: string, limit = 50): Promise<EdgeRecord[]> {
    const db = DatabaseManager.getCurrentDatabase();
    if (!db) throw new Error('No active database');
    
    return db.edges
      .where('toPageId')
      .equals(toPageId)
      .limit(limit)
      .toArray();
  }
  
  /**
   * Get the most frequently traversed edges
   * @param limit Maximum number of edges to return
   * @returns Array of edges sorted by count (descending)
   */
  async getTopEdges(limit = 20): Promise<EdgeRecord[]> {
    const db = DatabaseManager.getCurrentDatabase();
    if (!db) throw new Error('No active database');
    
    // This needs to load all edges and sort in memory since IndexedDB
    // doesn't support sorting by non-indexed fields
    return db.edges
      .toArray()
      .then(edges => edges
        .sort((a, b) => (b.count || 0) - (a.count || 0))
        .slice(0, limit)
      );
  }
  
  /**
   * Get all edges within a specific session
   * @param sessionId The session ID
   * @returns Array of edges within the session
   */
  async getEdgesBySession(sessionId: number): Promise<EdgeRecord[]> {
    const db = DatabaseManager.getCurrentDatabase();
    if (!db) throw new Error('No active database');
    
    return db.edges
      .where('sessionId')
      .equals(sessionId)
      .toArray();
  }
  
  /**
   * Delete edges related to a specific page
   * @param pageId The page ID
   * @returns Number of edges deleted
   */
  async deleteEdgesForPage(pageId: string): Promise<number> {
    const db = DatabaseManager.getCurrentDatabase();
    if (!db) throw new Error('No active database');
    
    // Delete incoming edges
    const incomingCount = await db.edges
      .where('toPageId')
      .equals(pageId)
      .delete();
    
    // Delete outgoing edges
    const outgoingCount = await db.edges
      .where('fromPageId')
      .equals(pageId)
      .delete();
    
    return incomingCount + outgoingCount;
  }
  
  /**
   * Check if a direct connection exists between two pages
   * @param fromPageId The source page ID
   * @param toPageId The destination page ID
   * @returns True if a connection exists
   */
  async hasConnection(fromPageId: string, toPageId: string): Promise<boolean> {
    const db = DatabaseManager.getCurrentDatabase();
    if (!db) throw new Error('No active database');
    
    const count = await db.edges
      .where('fromPageId')
      .equals(fromPageId)
      .and(edge => edge.toPageId === toPageId)
      .count();
    
    return count > 0;
  }
  
  /**
   * Get all edges in the database
   * @returns Array of all edge records
   */
  async getAllEdges(): Promise<EdgeRecord[]> {
    const db = DatabaseManager.getCurrentDatabase();
    if (!db) throw new Error('No active database');
    
    return db.edges.toArray();
  }
}

// Create and export a singleton instance
export const edgeRepository = new EdgeRepository();

// Default export for convenience
export default EdgeRepository;
