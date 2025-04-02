/**
 * @file PreferencesRepository.ts
 * 
 * Repository for accessing and storing user preferences in Chrome storage
 */

import { STORAGE_KEYS } from '../../config';

// Type definition for user preferences
export interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  // Add other preferences as needed
}

// Default preferences when none are set
const DEFAULT_PREFERENCES: UserPreferences = {
  theme: 'system'
};

/**
 * Repository for managing user preferences in storage
 */
export class PreferencesRepository {
  /**
   * Get all user preferences
   * @returns Promise resolving to user preferences
   */
  async getPreferences(): Promise<UserPreferences> {
    return new Promise((resolve) => {
      chrome.storage.sync.get(STORAGE_KEYS.PREFERRED_THEME_KEY, (result) => {
        // If no preferences found, return defaults
        if (!result || !result[STORAGE_KEYS.PREFERRED_THEME_KEY]) {
          resolve(DEFAULT_PREFERENCES);
          return;
        }
        
        try {
          // Parse stored preferences
          const storedPrefs = result[STORAGE_KEYS.PREFERRED_THEME_KEY];
          resolve({
            ...DEFAULT_PREFERENCES,
            ...(typeof storedPrefs === 'string' ? { theme: storedPrefs } : storedPrefs)
          });
        } catch (e) {
          console.error('[PreferencesRepository] Error parsing preferences:', e);
          resolve(DEFAULT_PREFERENCES);
        }
      });
    });
  }

  /**
   * Get the current theme preference
   * @returns Promise resolving to the theme
   */
  async getTheme(): Promise<UserPreferences['theme']> {
    const prefs = await this.getPreferences();
    return prefs.theme;
  }

  /**
   * Save user preferences
   * @param preferences The preferences to save
   * @returns Promise resolving when saved
   */
  async savePreferences(preferences: UserPreferences): Promise<void> {
    return new Promise((resolve) => {
      chrome.storage.sync.set(
        { [STORAGE_KEYS.PREFERRED_THEME_KEY]: preferences }, 
        () => resolve()
      );
    });
  }

  /**
   * Update the theme preference
   * @param theme The theme to set
   * @returns Promise resolving when saved
   */
  async saveTheme(theme: UserPreferences['theme']): Promise<void> {
    const prefs = await this.getPreferences();
    return this.savePreferences({ ...prefs, theme });
  }
}

export default new PreferencesRepository();
