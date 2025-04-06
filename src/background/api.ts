/**
 * @file api.ts
 * Exposes a background API (via Comlink) that UI components can call.
 * Content script communication (content extraction and UI commands) uses direct Chrome messaging instead.
 */

import { authService } from '../services/authService';
import { contentService } from '../services/contentService';
import { clusteringService } from '../services/clusteringService';
import { searchService } from '../services/searchService';
import { eventService } from '../services/eventService';
import preferencesService from '../services/preferencesService';
import navigationService from '../services/navigationService';
import uiCommandService from '../services/uiCommandService';
import { isDatabaseInitialized } from '../db/DatabaseCore';
import { isWebPage } from '../utils/urlUtils';
import { QUEUE_CONFIG } from '../config';
import { pageRepository } from '../db/repositories/PageRepository';

import type { ContentData, ExtractedContent } from '../types';
import type { SearchOptions } from '../services/searchService';
import type {
  SystemServiceAPI,
  AuthServiceAPI,
  ClusteringServiceAPI,
  SearchServiceAPI,
  EventServiceAPI,
  PreferencesServiceAPI,
  ContentExtractorAPI,
  ContentServiceAPI,
  ActivityServiceAPI,
  NavigationServiceAPI,
  UICommandServiceAPI,
  BackgroundAPI
} from '../types';

/**
 * The main background API object exposed via Comlink. Content scripts interact with
 * these methods to perform authentication, content extraction, clustering, search,
 * event tracking, preference management, navigation, and UI command operations.
 */
export const backgroundApi = {
  /**
   * System service - status and initialization checks.
   */
  system: {
    /**
     * Check if the database is ready for use.
     * @returns {boolean} True if database is properly initialized.
     */
    isReady: () => isDatabaseInitialized(),
  },

  /**
   * Authentication methods for the extension.
   */
  auth: {
    /**
     * Initiates the login flow.
     */
    login: () => authService.login(),

    /**
     * Logs the user out.
     */
    logout: () => authService.logout(),

    /**
     * Retrieves the current authentication state.
     */
    getAuthState: () => authService.getAuthState(),
  },

  /**
   * Clustering-related methods.
   */
  clusters: {
    /**
     * Gets cluster suggestions.
     * @param {object} [options] Optional config for force refresh or limiting suggestion count.
     * @returns {Promise<any>} The cluster suggestions.
     */
    getClusterSuggestions: (options?: { forceRefresh?: boolean; count?: number }) =>
      clusteringService.getClusterSuggestions(options),

    /**
     * Triggers the clustering process.
     */
    triggerClustering: () => clusteringService.triggerClustering(),
  },

  /**
   * Search-related methods.
   */
  search: {
    /**
     * Perform a local search using browser history and the local database.
     * @param {string} query The search term.
     * @returns {Promise<any>} The search results.
     */
    searchLocal: (query: string) => searchService.searchLocal(query),

    /**
     * Perform a semantic search via the backend API.
     * @param {string} query The search term.
     * @param {SearchOptions} [options] Additional search options.
     * @returns {Promise<any>} The search results.
     */
    searchSemantic: (query: string, options?: SearchOptions) => searchService.searchSemantic(query, options),

    /**
     * Perform both local and semantic search in parallel.
     * @param {string} query The search term.
     * @param {SearchOptions} [options] Additional search options.
     * @returns {Promise<any>} The combined or aggregated search results.
     */
    searchHybrid: (query: string, options?: SearchOptions) => searchService.searchHybrid(query, options),
  },

  /**
   * Event tracking methods.
   */
  events: {
    /**
     * Track a user click on a search result.
     * @param {string} searchSessionId Unique search session identifier.
     * @param {string} pageId Unique page identifier.
     * @param {number} position Position of the clicked result in the results list.
     * @param {string} url The URL of the clicked result.
     * @param {string} query The original search query.
     */
    trackSearchClick: (
      searchSessionId: string,
      pageId: string,
      position: number,
      url: string,
      query: string
    ) => eventService.trackSearchClick(searchSessionId, pageId, position, url, query),

    /**
     * Track a user performing a search action.
     * @param {string} query The search term.
     * @param {number} resultCount The number of results returned.
     * @param {'local' | 'semantic' | 'hybrid'} [searchType='local'] The type of search performed.
     */
    trackSearchPerformed: (
      query: string,
      resultCount: number,
      searchType: 'local' | 'semantic' | 'hybrid' = 'local'
    ) => eventService.trackSearchPerformed(query, resultCount, searchType),

    /**
     * Track a generic navigation event as a special "search" event for consistency.
     * @param {string} fromUrl The URL the user navigated from.
     * @param {string} toUrl The URL the user navigated to.
     * @param {object} [properties] Additional properties or metadata for the event.
     */
    trackNavigationEvent: (fromUrl: string, toUrl: string, properties?: any) =>
      eventService.trackSearchPerformed(`Navigation: ${fromUrl} → ${toUrl}`, 0, 'local'),
  },

  /**
   * User preferences methods.
   */
  preferences: {
    /**
     * Retrieves all user preferences.
     * @returns {Promise<any>} The current user preferences.
     */
    getPreferences: () => preferencesService.getPreferences(),

    /**
     * Retrieves the current theme preference.
     * @returns {Promise<'light' | 'dark' | 'system'>} The current theme.
     */
    getTheme: () => preferencesService.getTheme(),

    /**
     * Toggles between light and dark mode.
     */
    toggleTheme: () => preferencesService.toggleTheme(),

    /**
     * Sets the current theme preference explicitly.
     * @param {'light' | 'dark' | 'system'} theme The theme to set.
     */
    setTheme: (theme: 'light' | 'dark' | 'system') => preferencesService.setTheme(theme),
  },

  /**
   * Content-related methods (extract, send, ping).
   */
  content: {
    /**
     * Extracts content from a specified tab. Returns null on failure.
     * @param {number} tabId The ID of the Chrome tab.
     * @returns {Promise<ExtractedContent|null>} The extracted content or null if extraction fails.
     */
    async extractContent(tabId: number): Promise<ExtractedContent | null> {
      try {
        let tab;
        try {
          tab = await chrome.tabs.get(tabId);
          if (!tab.url || !isWebPage(tab.url)) {
            console.log(`[BackgroundAPI] Tab ${tabId} is not a regular web page, skipping extraction`);
            return null;
          }
        } catch (err) {
          console.log(`[BackgroundAPI] Tab ${tabId} does not exist or cannot be accessed`);
          return null;
        }

        // Send extraction request directly without pinging first
        console.log(`[BackgroundAPI] Sending extraction request to tab ${tabId}`);
        const response = await new Promise<any>((resolve) => {
          chrome.tabs.sendMessage(tabId, { type: 'EXTRACT_CONTENT' }, (result) => {
            if (chrome.runtime.lastError) {
              console.error(`[BackgroundAPI] Error sending message to tab ${tabId}:`, chrome.runtime.lastError);
              resolve({ success: false, error: chrome.runtime.lastError.message });
              return;
            }
            resolve(result);
          });
        });

        if (!response || !response.success) {
          console.error(
            `[BackgroundAPI] Content extraction failed for tab ${tabId}:`,
            response?.error || 'Unknown error'
          );
          return null;
        }

        return response.content;
      } catch (err) {
        console.error(`[BackgroundAPI] extractContent failed (tab ${tabId}):`, err);
        return null;
      }
    },

    /**
     * Extracts content from a tab and sends it directly to the backend.
     * @param {number} tabId The ID of the Chrome tab.
     * @param {object} contextData Additional context data like pageId, visitId, sessionId.
     * @returns {Promise<boolean>} True if the operation was successful, false otherwise.
     */
    async extractAndSendContent(
      tabId: number,
      contextData: {
        pageId: string;
        visitId: string;
        sessionId: string | null;
      }
    ): Promise<boolean> {
      try {
        console.log(`[BackgroundAPI] Extracting and sending content for tab ${tabId}`);
        const content = await backgroundApi.content.extractContent(tabId);
        if (!content) {
          console.warn(`[BackgroundAPI] Failed to extract content from tab ${tabId}`);
          return false;
        }

        // Create content data using normalized URL from extraction
        const contentData: ContentData = {
          ...contextData,
          url: content.url, // Normalized URL (hostname+path)
          title: content.title,
          markdown: content.markdown,
          metadata: content.metadata,
        };

        return await contentService.sendContent(contentData);
      } catch (err) {
        console.error(`[BackgroundAPI] extractAndSendContent failed (tab ${tabId}):`, err);
        return false;
      }
    },

    /**
     * Sends already extracted content to the backend.
     * @param {ContentData} content The content data to send.
     * @returns {Promise<boolean>} True if sending was successful, false otherwise.
     */
    async sendContent(content: ContentData): Promise<boolean> {
      try {
        return await contentService.sendContent(content);
      } catch (err) {
        console.error('[BackgroundAPI] sendContent failed:', err);
        return false;
      }
    },

    /**
     * Injects the content extractor script into a tab.
     * @param tabId The ID of the tab to inject the script into
     * @returns A promise resolving to true if injection was successful
     */
    async injectContentExtractor(tabId: number): Promise<boolean> {
      const scriptPath = 'src/content/contentExtractor.ts';

      try {
        console.log(`[BackgroundAPI] Injecting content extractor script (${scriptPath}) into tab ${tabId}`);
        await chrome.scripting.executeScript({
          target: { tabId },
          files: [scriptPath]
        });
        console.log(`[BackgroundAPI] Successfully injected content extractor into tab ${tabId}`);
        return true;
      } catch (error: any) {
        if (error.message?.includes('Cannot access') || error.message?.includes('extension context')) {
          console.warn(`[BackgroundAPI] Cannot inject script into tab ${tabId}: ${error.message}`);
        } else if (error.message?.includes('No tab with id')) {
          console.warn(`[BackgroundAPI] Tab ${tabId} not found (closed?).`);
        } else if (error.message?.includes('Could not load file')) {
          console.error(`[BackgroundAPI] Check your build output path for ${scriptPath}. Error: ${error.message}`);
        } else {
          console.error(`[BackgroundAPI] Failed to inject content extractor into tab ${tabId}:`, error);
        }
        return false;
      }
    },
  },

  /**
   * Activity reporting methods.
   */
  activity: {
    /**
     * Reports activity from content scripts and updates active time.
     * @param {object} data Activity data (isActive, pageUrl, duration).
     * @returns {Promise<boolean>} True if activity was processed.
     */
    reportActivity: async (data: { isActive: boolean; pageUrl: string; duration: number }, sender?: chrome.runtime.MessageSender): Promise<boolean> => {
      // Only process when tab becomes inactive with positive duration
      if (!data.isActive && data.duration > 0 && data.pageUrl) {
        try {
          // First check if database is initialized before attempting operations
          if (!isDatabaseInitialized()) {
            console.warn("[BackgroundAPI] Skipping activity update: Database not initialized yet");
            return false;
          }
          
          // Find the page by URL
          const page = await pageRepository.getByUrl(data.pageUrl);
          if (page) {
            // Update the page's active time based on visibility
            await pageRepository.updateActiveTime(page.pageId, data.duration);
            
            // Update session activity time
            await navigationService.updateSessionActivityTime(data.duration);
            
            console.log(`[BackgroundAPI] Updated active time: +${data.duration}s for ${data.pageUrl}`);
            return true;
          } else {
            console.log(`[BackgroundAPI] Page not found for URL: ${data.pageUrl}`);
          }
        } catch (error) {
          console.error('[BackgroundAPI] Error updating active time:', error);
        }
      }
      return true;
    },
  },

  /**
   * Navigation and session management methods.
   */
  navigation: {
    /**
     * Create or get a page record by URL.
     * @param {string} url The page URL.
     * @param {string} title The page title.
     * @param {number} timestamp The timestamp of creation.
     * @returns {Promise<any>} The page record.
     */
    createOrGetPage: (url: string, title: string, timestamp: number) =>
      navigationService.createOrGetPage(url, title, timestamp),

    /**
     * Start a visit to a page.
     * @param {string} pageId The page identifier.
     * @param {string} sessionId The session identifier.
     * @param {string} [fromPageId] The referring page identifier.
     * @param {boolean} [isBackNav] Whether this visit is from a browser back navigation.
     * @returns {Promise<any>} The visit record.
     */
    startVisit: (pageId: string, sessionId: string, fromPageId?: string, isBackNav?: boolean) =>
      navigationService.startVisit(pageId, sessionId, fromPageId, isBackNav),

    /**
     * End a visit to a page.
     * @param {string} visitId The unique visit identifier.
     * @param {number} timestamp The timestamp of ending the visit.
     * @returns {Promise<boolean>} True if successful.
     */
    endVisit: (visitId: string, timestamp: number) => navigationService.endVisit(visitId, timestamp),

    /**
     * Retrieve a visit by its ID.
     * @param {string} visitId The visit identifier.
     * @returns {Promise<any>} The visit record or null if not found.
     */
    getVisit: (visitId: string) => navigationService.getVisit(visitId),

    /**
     * Create or update a navigation edge between two pages.
     * @param {string} fromPageId The originating page ID.
     * @param {string} toPageId The destination page ID.
     * @param {string} sessionId The current session ID.
     * @param {number} timestamp The timestamp of navigation.
     * @param {boolean} isBackNav Flag indicating a back navigation.
     * @returns {Promise<any>} The updated navigation edge record.
     */
    createOrUpdateEdge: (fromPageId: string, toPageId: string, sessionId: string, timestamp: number, isBackNav: boolean) =>
      navigationService.createOrUpdateEdge(fromPageId, toPageId, sessionId, timestamp, isBackNav),

    /**
     * Ensure an active session exists, creating one if necessary.
     * @returns {Promise<any>} The active session record.
     */
    ensureActiveSession: () => navigationService.ensureActiveSession(),

    /**
     * Get the current session ID.
     * @returns {Promise<string|null>} The current session ID or null if none.
     */
    getCurrentSessionId: () => navigationService.getCurrentSessionId(),

    /**
     * Update the session activity time.
     * @param {number} duration The duration to add to session activity time.
     * @returns {Promise<void>}
     */
    updateSessionActivityTime: (duration: number) => navigationService.updateSessionActivityTime(duration),

    /**
     * Start a new session by ensuring one is active.
     * @returns {Promise<any>} The active session record (existing or newly created).
     */
    startSession: () => navigationService.ensureActiveSession(),

    /**
     * Get the current session record, if any.
     * @returns {Promise<any|null>} The current session record or null if none.
     */
    async getCurrentSession() {
      const sessionId = await navigationService.getCurrentSessionId();
      if (!sessionId) return null;
      return navigationService.getVisit(sessionId);
    },

    /**
     * End the current session, if one is active.
     * @returns {Promise<boolean>} True if successfully ended or no session was active.
     */
    endCurrentSession: () => navigationService.endCurrentSession(),
  },

  /**
   * UI command methods.
   */
  commands: {
    /**
     * Registers a content script's command handler.
     * @param {number} tabId The tab ID to register the command handler for.
     * @returns {boolean} True if registration was successful.
     */
    registerCommandHandler: (tabId: number) => uiCommandService.registerCommandHandler(tabId),

    /**
     * Unregister a command handler for a specific tab.
     * @param {number} tabId The tab ID to unregister.
     * @returns {boolean} True if unregistration was successful.
     */
    unregisterCommandHandler: (tabId: number) => uiCommandService.unregisterCommandHandler(tabId),

    /**
     * Shows, hides, or toggles the search overlay in a specific tab.
     * @param {number} tabId Target tab ID for the overlay.
     * @param {'show' | 'hide' | 'toggle'} [action='toggle'] Action to perform.
     * @returns {Promise<boolean>} True if the request was successfully processed.
     */
    showSearchOverlay: (tabId: number, action: 'show' | 'hide' | 'toggle' = 'toggle') =>
      uiCommandService.showSearchOverlay(tabId, action),
  },
};

export type { BackgroundAPI } from '../types';