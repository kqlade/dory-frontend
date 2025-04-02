/**
 * @file SessionRepository.ts
 * 
 * Repository for working with browsing sessions in the database.
 * Handles creating, ending, and managing browser sessions.
 */

import { DatabaseManager, isDatabaseInitialized } from '../DatabaseCore'; // Import checker
import { BrowsingSession } from '../../types';
import { generateSessionId } from '../../utils/idGenerator';

/**
 * Repository for managing browsing sessions
 */
export class SessionRepository {
  // Track the current session ID
  private currentSessionId: number | null = null;
  
  // Storage key for persisting session state
  private readonly SESSION_STORAGE_KEY = 'doryCurrentSession';
  
  private ensureDbReady(): void {
      if (!isDatabaseInitialized()) {
          console.error("[SessionRepository] Attempted operation before database was initialized.");
          throw new Error("Database not initialized");
      }
  }
  
  /**
   * Get the current active session ID
   * @returns The current session ID or null if no active session
   */
  getCurrentSessionId(): number | null {
    return this.currentSessionId;
  }
  
  /**
   * Start a new browsing session
   * @param idleThreshold Optional timeout in ms for session reuse
   * @returns The ID of the new or resumed session
   */
  async startNewSession(idleThreshold = 30 * 60 * 1000): Promise<number> {
    this.ensureDbReady(); // Check DB readiness first
    const db = DatabaseManager.getCurrentDatabase(); // Should not be null if ensureDbReady passed
    if (!db) throw new Error('No active database found despite initialization check.'); // Should not happen
    
    // Try to reuse a recent session if available
    const recentSession = await this.getRecentSession(idleThreshold);
    if (recentSession) {
      this.currentSessionId = recentSession;
      await this.updateSessionActivityTime(recentSession);
      return recentSession;
    }
    
    // End any existing session
    if (this.currentSessionId) {
      await this.endSession(this.currentSessionId);
    }
    
    const now = Date.now();
    
    // Create new session ID
    const sessionId = generateSessionId();
    
    // Add new session to database
    await db.sessions.add({
      sessionId,
      startTime: now,
      lastActivityAt: now,
      totalActiveTime: 0,
      isActive: true
    });
    
    // Update current session ID
    this.currentSessionId = sessionId;
    
    // Persist session state
    await this.persistSessionState(sessionId, now);
    
    return sessionId;
  }
  
  /**
   * End a browsing session
   * @param sessionId The ID of the session to end, defaults to current session
   */
  async endSession(sessionId?: number): Promise<void> {
    const targetId = sessionId || this.currentSessionId;
    if (!targetId) return;
    
    // No need to check DB readiness if just clearing local state
    if (this.currentSessionId === targetId) {
      this.currentSessionId = null;
      await chrome.storage.local.remove(this.SESSION_STORAGE_KEY);
    }
    
    // Check DB readiness before DB operation
    try {
      this.ensureDbReady(); 
      const db = DatabaseManager.getCurrentDatabase();
      if (!db) return; // DB gone somehow?
      
      const now = Date.now();
      const session = await db.sessions.get(targetId);
      if (!session) return;
      
      // Calculate total session time
      const totalActiveTime = Math.max(
        (session.totalActiveTime || 0),
        Math.ceil((now - session.startTime) / 1000)
      );
      
      // Update session as ended
      await db.sessions.update(targetId, {
        endTime: now,
        lastActivityAt: now,
        totalActiveTime,
        isActive: false
      });
      
    } catch (error) {
      // Don't throw if DB wasn't ready, just log
      if (!(error instanceof Error && error.message === "Database not initialized")) {
        console.error(`[SessionRepository] Error ending session ${targetId}:`, error);
        // Optionally re-throw if it's a different error
      } else {
        console.warn(`[SessionRepository] Could not end session ${targetId} in DB: Database not ready.`);
      }
    }
  }
  
  /**
   * Update a session's last activity time
   * @param sessionId The session ID to update, defaults to current session
   * @returns True if session was updated, false otherwise
   */
  async updateSessionActivityTime(sessionId?: number): Promise<boolean> {
    const targetId = sessionId || this.currentSessionId;
    if (!targetId) return false;
    
    try {
      this.ensureDbReady(); // Check DB
      const db = DatabaseManager.getCurrentDatabase();
      if (!db) return false;
      
      const now = Date.now();
      await db.sessions.update(targetId, { lastActivityAt: now });
      await this.persistSessionState(targetId, now); // Persist even if DB update fails? Maybe not.
      return true;
    } catch (error) {
      if (!(error instanceof Error && error.message === "Database not initialized")) {
        console.error(`[SessionRepository] Error updating session ${targetId}:`, error);
      } else {
        console.warn(`[SessionRepository] Could not update session ${targetId} activity: Database not ready.`);
      }
      return false;
    }
  }
  
  /**
   * Check if the current session is idle beyond the threshold
   * If idle, automatically end the session
   * @param thresholdMs Idle time threshold in milliseconds
   * @returns True if the session was ended due to idleness
   */
  async checkSessionIdle(thresholdMs = 30 * 60 * 1000): Promise<boolean> {
    if (!this.currentSessionId) return false;
    
    try {
      this.ensureDbReady();
      const db = DatabaseManager.getCurrentDatabase();
      if (!db) return false;
      
      const session = await db.sessions.get(this.currentSessionId);
      if (!session || !session.isActive) return false;
      
      const now = Date.now();
      const timeSinceActivity = now - session.lastActivityAt;
      
      if (timeSinceActivity > thresholdMs) {
        // Session has been idle too long, end it
        await this.endSession(this.currentSessionId);
        return true;
      }
      
      return false;
    } catch (error) {
      if (!(error instanceof Error && error.message === "Database not initialized")) {
        console.error(`[SessionRepository] Error checking session idle:`, error);
      } else {
        console.warn(`[SessionRepository] Could not check session idle: Database not ready.`);
      }
      return false;
    }
  }
  
  /**
   * Get a session by ID
   * @param sessionId The session ID
   * @returns The session or undefined if not found
   */
  async getSession(sessionId: number): Promise<BrowsingSession | undefined> {
    this.ensureDbReady();
    const db = DatabaseManager.getCurrentDatabase();
    if (!db) throw new Error('No active database found despite initialization check.');
    
    return db.sessions.get(sessionId);
  }
  
  /**
   * Get all active sessions
   * @returns Array of active session records
   */
  async getActiveSessions(): Promise<BrowsingSession[]> {
    this.ensureDbReady();
    const db = DatabaseManager.getCurrentDatabase();
    if (!db) throw new Error('No active database found despite initialization check.');
    
    return db.sessions
      .filter(session => session.isActive === true)
      .toArray();
  }
  
  /**
   * Get all sessions in the database
   * @returns Array of all session records
   */
  async getAllSessions(): Promise<BrowsingSession[]> {
    this.ensureDbReady();
    const db = DatabaseManager.getCurrentDatabase();
    if (!db) throw new Error('No active database found despite initialization check.');
    
    return db.sessions.toArray();
  }
  
  /**
   * Get the total count of session records
   * @returns Count of session records
   */
  async getCount(): Promise<number> {
    this.ensureDbReady();
    const db = DatabaseManager.getCurrentDatabase();
    if (!db) throw new Error('No active database found despite initialization check.');
    
    return db.sessions.count();
  }
  
  /**
   * Get sessions that started after a specific time
   * @param timestamp Only include sessions that started after this time
   * @returns Array of session records
   */
  async getSessionsAfterTime(timestamp: number): Promise<BrowsingSession[]> {
    this.ensureDbReady();
    const db = DatabaseManager.getCurrentDatabase();
    if (!db) throw new Error('No active database found despite initialization check.');
    
    return db.sessions
      .where('startTime')
      .above(timestamp)
      .toArray();
  }
  
  /**
   * Stores the current session state in chrome.storage.local for persistence
   * @param sessionId The session ID to store
   * @param lastActivity The timestamp of the last activity
   */
  private async persistSessionState(sessionId: number, lastActivity: number): Promise<void> {
    try {
      await chrome.storage.local.set({
        [this.SESSION_STORAGE_KEY]: {
          sessionId,
          lastActivityAt: lastActivity
        }
      });
    } catch (error) {
      console.error('[SessionRepository] Error persisting session state:', error);
    }
  }
  
  /**
   * Check if there's a recent active session we can reuse
   * @param idleThreshold The threshold in ms to consider a session still active
   * @returns The session ID if a recent session exists, null otherwise
   */
  private async getRecentSession(idleThreshold: number): Promise<number | null> {
    try {
      // Check for saved session in storage
      const storage = await chrome.storage.local.get(this.SESSION_STORAGE_KEY);
      const savedSession = storage[this.SESSION_STORAGE_KEY];
      
      if (savedSession && savedSession.sessionId && savedSession.lastActivityAt) {
        const now = Date.now();
        
        // If the last activity was within the idle threshold, session is still valid
        if (now - savedSession.lastActivityAt < idleThreshold) {
          try {
            // Check if this session is still marked as active in the database
            this.ensureDbReady();
            const db = DatabaseManager.getCurrentDatabase();
            if (!db) return null;
            
            const session = await db.sessions.get(savedSession.sessionId);
            if (session && session.isActive) {
              return savedSession.sessionId;
            }
          } catch (dbError) {
            if (dbError instanceof Error && dbError.message === "Database not initialized") {
              console.warn('[SessionRepository] Could not check recent session: Database not ready.');
            } else {
              throw dbError;
            }
          }
        }
      }
      
      return null;
    } catch (error) {
      console.error('[SessionRepository] Error getting recent session:', error);
      return null;
    }
  }
}

// Create and export a singleton instance
export const sessionRepository = new SessionRepository();

// Default export for convenience
export default SessionRepository;
