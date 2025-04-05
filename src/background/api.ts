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

        // Ping the content script to confirm it's available
        const pingSuccess = await this.pingContentScript(tabId, { maxAttempts: QUEUE_CONFIG.PING.MAX_ATTEMPTS });
        if (!pingSuccess) {
          console.log(
            `[BackgroundAPI] Content script not available in tab ${tabId}. 
             This might be due to page restrictions or the page is still loading.`
          );
          return null;
        }

        // Ask the content script to extract content
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
     * Pings the content script to check if it's available and responsive, with retries.
     * @param {number} tabId The tab ID to ping.
     * @param {object} [options] Retry configuration (maxAttempts, initialDelay, timeoutPerAttempt).
     * @returns {Promise<boolean>} True if the content script is available.
     */
    async pingContentScript(
      tabId: number,
      options: {
        maxAttempts?: number;
        initialDelay?: number;
        timeoutPerAttempt?: number;
      } = {}
    ): Promise<boolean> {
      const {
        maxAttempts = QUEUE_CONFIG.PING.MAX_ATTEMPTS,
        initialDelay = QUEUE_CONFIG.PING.INITIAL_DELAY,
        timeoutPerAttempt = QUEUE_CONFIG.PING.TIMEOUT_PER_ATTEMPT,
      } = options;

      const singlePingAttempt = async (): Promise<boolean> => {
        try {
          const response = await Promise.race([
            new Promise<any>((resolve) => {
              chrome.tabs.sendMessage(tabId, { type: 'PING' }, (result) => {
                if (chrome.runtime.lastError) {
                  resolve({ success: false });
                  return;
                }
                resolve(result);
              });
            }),
            new Promise<{ success: false }>((resolve) =>
              setTimeout(() => resolve({ success: false }), timeoutPerAttempt)
            ),
          ]);
          return response?.success && response?.pong === true;
        } catch (err) {
          return false;
        }
      };

      const delay = (ms: number): Promise<void> =>
        new Promise((resolve) => setTimeout(resolve, ms));

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        console.log(`[BackgroundAPI] Ping attempt ${attempt}/${maxAttempts} for tab ${tabId}`);
        const backoffDelay = initialDelay * Math.pow(2, attempt - 1);
        await delay(backoffDelay);
        const success = await singlePingAttempt();
        if (success) {
          console.log(
            `[BackgroundAPI] Successfully connected to content script in tab ${tabId} after ${attempt} attempts`
          );
          return true;
        }
      }
      console.log(`[BackgroundAPI] Failed to connect to content script in tab ${tabId} after ${maxAttempts} attempts`);
      return false;
    },
  },

  /**
   * Activity reporting methods.
   */
  activity: {
    /**
     * Reports activity from content scripts.
     * @param {object} data Activity data (isActive, pageUrl, duration).
     * @returns {Promise<boolean>} Always resolves to true for demonstration/logging.
     */
    reportActivity: (data: { isActive: boolean; pageUrl: string; duration: number }): Promise<boolean> => {
      console.log('[BackgroundAPI] Activity reported:', data);
      return Promise.resolve(true);
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