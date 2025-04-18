/**
 * @file api.ts
 * Exposes a background API (via Comlink) that UI components can call.
 * Content script communication (UI commands) uses direct Chrome messaging instead.
 */

import { authService } from '../services/authService';
import { searchService } from '../services/searchService';
import { eventService } from '../services/eventService';
import preferencesService from '../services/preferencesService';
import navigationService from '../services/navigationService';
import uiCommandService from '../services/uiCommandService';
import { isDatabaseInitialized } from '../db/DatabaseCore';
import { pageRepository } from '../db/repositories/PageRepository';

import type {
  SystemServiceAPI,
  AuthServiceAPI,
  SearchServiceAPI,
  EventServiceAPI,
  PreferencesServiceAPI,
  ActivityServiceAPI,
  NavigationServiceAPI,
  UICommandServiceAPI,
  BackgroundAPI
} from '../types';

/**
 * The main background API object exposed via Comlink. Content scripts interact with
 * these methods to perform authentication, search,
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
   * Search-related methods.
   */
  search: {
    /**
     * Perform a local search using browser history and the local database.
     * @param {string} query The search term.
     * @returns {Promise<any>} The search results.
     */
    searchLocal: (query: string) => searchService.searchLocal(query),
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
     * @param {'local'} [searchType='local'] The type of search performed.
     */
    trackSearchPerformed: (
      query: string,
      resultCount: number,
      searchType: 'local' = 'local'
    ) => eventService.trackSearchPerformed(query, resultCount, searchType),

    /**
     * Track a generic navigation event as a special "search" event for consistency.
     * @param {string} fromUrl The URL the user navigated from.
     * @param {string} toUrl The URL the user navigated to.
     * @param {object} [properties] Additional properties or metadata for the event.
     */
    trackNavigationEvent: (fromUrl: string, toUrl: string, properties?: any) =>
      eventService.trackSearchPerformed(`Navigation: ${fromUrl} → ${toUrl}`, 0, 'local'),

    /**
     * Track a note added to a page.
     */
    trackNote: (
      pageId: string,
      url: string,
      selectionText: string,
      noteText: string
    ) => eventService.trackNote(pageId, url, selectionText, noteText),

    /** Fetch recent notes for a page */
    getNotesForPage: (pageId: string, limit = 20) => eventService.getNotesForPage(pageId, limit),
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