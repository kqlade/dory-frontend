/**
 * @file ui.ts
 * Type definitions for UI-related functionality
 */

/**
 * API exposed by content scripts for UI command handling
 */
export interface ContentCommandAPI {
  /**
   * Show, hide, or toggle the search overlay
   * @param action The action to perform
   * @returns Promise resolving to success status
   */
  showSearchOverlay(action: 'show' | 'hide' | 'toggle'): Promise<boolean>;
}
