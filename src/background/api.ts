/**
 * @file api.ts
 * Exposes a background API (via Comlink) that content scripts can call.
 */

import { authService } from '../services/authService';
import { contentService } from '../services/contentService';
import { clusteringService } from '../services/clusteringService';
import { searchService, SearchOptions } from '../services/searchService';
import { eventService } from '../services/eventService';
import preferencesService from '../services/preferencesService';
import navigationService from '../services/navigationService';
import uiCommandService from '../services/uiCommandService';
import { ExtractedContent, ContentData } from '../types';
import * as Comlink from 'comlink';

export interface ContentExtractorAPI {
  extractContent(options?: { retryCount?: number }): Promise<ExtractedContent>;
  isPageReady(): boolean;
}

// Tracks content extractor connections by tab ID
const contentExtractors: Record<number, Comlink.Remote<ContentExtractorAPI> | null> = {};

export const backgroundApi = {
  auth: {
    login: () => authService.login(),
    logout: () => authService.logout(),
    getAuthState: () => authService.getAuthState(),
  },

  clusters: {
    getClusterSuggestions: (options?: { forceRefresh?: boolean; count?: number }) => 
      clusteringService.getClusterSuggestions(options),
    triggerClustering: () => clusteringService.triggerClustering(),
  },
  
  search: {
    /**
     * Perform a local search using browser history and local database
     */
    searchLocal: (query: string) => 
      searchService.searchLocal(query),
      
    /**
     * Perform a semantic search via the backend API
     */
    searchSemantic: (query: string, options?: SearchOptions) => 
      searchService.searchSemantic(query, options),
      
    /**
     * Perform both local and semantic search in parallel
     */
    searchHybrid: (query: string, options?: SearchOptions) => 
      searchService.searchHybrid(query, options),
  },
  
  events: {
    /**
     * Track a search result click event
     */
    trackSearchClick: (searchSessionId: string, pageId: string, position: number, url: string, query: string) => 
      eventService.trackSearchClick(searchSessionId, pageId, position, url, query),
      
    /**
     * Track that a user performed a search
     */
    trackSearchPerformed: (query: string, resultCount: number, searchType: 'local' | 'semantic' | 'hybrid' = 'local') => 
      eventService.trackSearchPerformed(query, resultCount, searchType),
      
    /**
     * Track a generic navigation event
     */
    trackNavigationEvent: (fromUrl: string, toUrl: string, properties?: any) => 
      eventService.trackSearchPerformed(`Navigation: ${fromUrl} → ${toUrl}`, 0, "local"),
  },
  
  preferences: {
    /**
     * Get all user preferences
     */
    getPreferences: () => preferencesService.getPreferences(),
    
    /**
     * Get the current theme preference
     */
    getTheme: () => preferencesService.getTheme(),
    
    /**
     * Toggle between light and dark mode
     */
    toggleTheme: () => preferencesService.toggleTheme(),
    
    /**
     * Set the theme preference
     */
    setTheme: (theme: 'light' | 'dark' | 'system') => preferencesService.setTheme(theme),
  },

  content: {
    /**
     * Extracts content from a specified tab. Returns null on failure.
     */
    async extractContent(tabId: number): Promise<ExtractedContent | null> {
      try {
        const extractor = contentExtractors[tabId];
        if (!extractor) return null;
        if (!(await extractor.isPageReady())) return null;
        return await extractor.extractContent();
      } catch (err) {
        console.error(`[BackgroundAPI] extractContent failed (tab ${tabId}):`, err);
        return null;
      }
    },

    /**
     * Extracts content from a tab and sends it directly to the backend.
     * @param tabId The tab ID to extract content from
     * @param contextData Additional context data like pageId, visitId, sessionId
     * @returns True if extraction and sending was successful
     */
    async extractAndSendContent(tabId: number, contextData: { 
      pageId: string; 
      visitId: string; 
      sessionId: string | null;
    }): Promise<boolean> {
      try {
        console.log(`[BackgroundAPI] Extracting and sending content for tab ${tabId}`);
        
        // First extract the content
        const content = await this.extractContent(tabId);
        if (!content) {
          console.warn(`[BackgroundAPI] Failed to extract content from tab ${tabId}`);
          return false;
        }
        
        // Combine extracted content with context data
        const contentData: ContentData = {
          ...contextData,
          url: content.url,
          title: content.title,
          markdown: content.markdown,
          metadata: content.metadata
        };
        
        // Send the content to the backend
        return await contentService.sendContent(contentData);
      } catch (err) {
        console.error(`[BackgroundAPI] extractAndSendContent failed (tab ${tabId}):`, err);
        return false;
      }
    },

    /**
     * Sends already extracted content to the backend
     * @param content The content data to send
     * @returns True if sending was successful
     */
    async sendContent(content: ContentData): Promise<boolean> {
      try {
        return await contentService.sendContent(content);
      } catch (err) {
        console.error('[BackgroundAPI] sendContent failed:', err);
        return false;
      }
    },

    registerContentExtractor(tabId: number, port: MessagePort) {
      contentExtractors[tabId] = Comlink.wrap<ContentExtractorAPI>(port);
      return true;
    },

    unregisterContentExtractor(tabId: number) {
      delete contentExtractors[tabId];
      return true;
    },
  },

  activity: {
    /**
     * Reports activity from content scripts.
     * Insert your own handling logic here.
     */
    reportActivity(data: { isActive: boolean; pageUrl: string; duration: number }) {
      console.log('[BackgroundAPI] Activity reported:', data);
      return true;
    },
  },

  navigation: {
    /**
     * Create or get a page record by URL
     */
    createOrGetPage: (url: string, title: string, timestamp: number) => 
      navigationService.createOrGetPage(url, title, timestamp),
    
    /**
     * Start a visit to a page
     */
    startVisit: (pageId: string, sessionId: string, fromPageId?: string, isBackNav?: boolean) => 
      navigationService.startVisit(pageId, sessionId, fromPageId, isBackNav),
    
    /**
     * End a visit to a page
     */
    endVisit: (visitId: string, timestamp: number) => 
      navigationService.endVisit(visitId, timestamp),
    
    /**
     * Get a visit by ID
     */
    getVisit: (visitId: string) => 
      navigationService.getVisit(visitId),
    
    /**
     * Create or update a navigation edge between pages
     */
    createOrUpdateEdge: (fromPageId: string, toPageId: string, sessionId: string, timestamp: number, isBackNav: boolean) => 
      navigationService.createOrUpdateEdge(fromPageId, toPageId, sessionId, timestamp, isBackNav),
    
    /**
     * Ensure an active session exists, creating one if needed
     */
    ensureActiveSession: () => 
      navigationService.ensureActiveSession(),
    
    /**
     * Get the current session ID
     */
    getCurrentSessionId: () => 
      navigationService.getCurrentSessionId(),
      
    /**
     * Update the session activity time
     */
    updateSessionActivityTime: (duration: number) => 
      navigationService.updateSessionActivityTime(duration),
      
    /**
     * End the current session
     */
    endCurrentSession: () => 
      navigationService.endCurrentSession(),
  },

  commands: {
    /**
     * Register a content script's command handler
     * @param tabId The tab ID to register
     * @param port The MessagePort to use for communication
     * @returns Success status
     */
    registerCommandHandler: (tabId: number, port: MessagePort) => 
      uiCommandService.registerCommandHandler(tabId, port),
    
    /**
     * Unregister a command handler
     * @param tabId The tab ID to unregister
     * @returns Success status
     */
    unregisterCommandHandler: (tabId: number) => 
      uiCommandService.unregisterCommandHandler(tabId),
    
    /**
     * Shows or toggles the search overlay in a specific tab
     * @param tabId Target tab ID for showing overlay
     * @param action 'show', 'hide', or 'toggle'
     * @returns Promise resolving to success status
     */
    showSearchOverlay: (tabId: number, action: 'show' | 'hide' | 'toggle' = 'toggle') => 
      uiCommandService.showSearchOverlay(tabId, action),
  },
};

export type BackgroundAPI = typeof backgroundApi;