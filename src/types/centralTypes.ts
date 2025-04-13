/**
 * @file centralTypes.ts
 * 
 * Centralized type definitions for all service interfaces used with Comlink.
 * This file consolidates all service interfaces to ensure consistent typing across
 * background API and related hooks.
 */

import type { UserPreferences } from '../types/user'; // Fixed import for UserPreferences
import type { 
  AuthState, 
  SearchResult, 
  BrowsingSession, 
  VisitRecord 
} from './index';

// System Service API for initialization and status checks
export interface SystemServiceAPI {
  isReady(): Promise<boolean>;
}

// Auth Service API
export interface AuthServiceAPI {
  login(): Promise<void>; 
  logout(): Promise<void>;
  getAuthState(): Promise<AuthState>; 
  onStateChange(listener: (newState: AuthState) => void): Promise<() => void>;
}

// Search Service API
export interface SearchServiceAPI {
  searchLocal(query: string): Promise<SearchResult[]>;
}

// Event Service API
export interface EventServiceAPI {
  trackSearchClick(searchSessionId: string, pageId: string, position: number, url: string, query: string): Promise<void>; 
  trackSearchPerformed(query: string, resultCount: number, searchType: 'local'): Promise<{ searchSessionId: string }>; 
  trackNavigationEvent(fromUrl: string, toUrl: string, properties?: any): Promise<void>;
}

// Preferences Service API
export interface PreferencesServiceAPI {
  getPreferences(): Promise<UserPreferences>;
  getTheme(): Promise<UserPreferences['theme']>;
  toggleTheme(): Promise<UserPreferences['theme']>; 
  setTheme(theme: UserPreferences['theme']): Promise<UserPreferences['theme']>; 
}

// Activity Service API
export interface ActivityServiceAPI {
  reportActivity(data: { isActive: boolean; pageUrl: string; duration: number }): Promise<boolean>; 
}

// Navigation Service API
export interface NavigationServiceAPI {
  createOrGetPage(url: string, title: string, timestamp: number): Promise<string>;
  startVisit(pageId: string, sessionId: string, fromPageId?: string, isBackNav?: boolean): Promise<string>;
  endVisit(visitId: string, timestamp: number): Promise<void>; 
  getVisit(visitId: string): Promise<VisitRecord | null>;
  createOrUpdateEdge(fromPageId: string, toPageId: string, sessionId: string, timestamp: number, isBackNav: boolean): Promise<void>;
  ensureActiveSession(): Promise<string>;
  getCurrentSessionId(): Promise<string | null>;
  updateSessionActivityTime(duration: number): Promise<boolean>;
  startSession(): Promise<string>; 
  getCurrentSession(): Promise<BrowsingSession | null>; 
  endCurrentSession(): Promise<void>; 
}

// UI Command Service API
export interface UICommandServiceAPI {
  registerCommandHandler(tabId: number, port: MessagePort): Promise<boolean>; 
  unregisterCommandHandler(tabId: number): Promise<boolean>; 
  showSearchOverlay(tabId: number, action: 'show' | 'hide' | 'toggle'): Promise<boolean>; 
}

// Main Background API type
export interface BackgroundAPI {
  system: SystemServiceAPI;
  auth: AuthServiceAPI;
  search: SearchServiceAPI;
  events: EventServiceAPI;
  preferences: PreferencesServiceAPI;
  activity: ActivityServiceAPI;
  navigation: NavigationServiceAPI;
  commands: UICommandServiceAPI;
}
