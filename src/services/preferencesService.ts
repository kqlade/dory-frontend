/**
 * @file preferencesService.ts
 * 
 * Service for managing user preferences
 * Uses PreferencesRepository for data access
 */

import preferencesRepository, { UserPreferences } from '../db/repositories/PreferencesRepository';

/**
 * Service for managing user preferences
 */
class PreferencesService {
  /**
   * Get all user preferences
   * @returns Promise resolving to user preferences
   */
  async getPreferences(): Promise<UserPreferences> {
    return preferencesRepository.getPreferences();
  }

  /**
   * Get the current theme preference
   * @returns Promise resolving to the theme
   */
  async getTheme(): Promise<UserPreferences['theme']> {
    return preferencesRepository.getTheme();
  }

  /**
   * Toggle between light and dark mode
   * If current theme is 'system', switches to 'dark'
   * @returns Promise resolving to the new theme
   */
  async toggleTheme(): Promise<UserPreferences['theme']> {
    const currentTheme = await this.getTheme();
    let newTheme: UserPreferences['theme'];
    
    // Toggle between light and dark
    switch (currentTheme) {
      case 'light':
        newTheme = 'dark';
        break;
      case 'dark':
      case 'system':
      default:
        newTheme = 'light';
        break;
    }
    
    await preferencesRepository.saveTheme(newTheme);
    return newTheme;
  }

  /**
   * Set the theme preference
   * @param theme The theme to set
   * @returns Promise resolving to the new theme
   */
  async setTheme(theme: UserPreferences['theme']): Promise<UserPreferences['theme']> {
    await preferencesRepository.saveTheme(theme);
    return theme;
  }
}

export default new PreferencesService();
