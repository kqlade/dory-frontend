/**
 * @file uiCommandService.ts
 *
 * Service for handling UI commands between background and content scripts
 * via direct Chrome messaging.
 */

import preferencesService from './preferencesService';

/**
 * A literal type for overlay actions.
 */
type OverlayAction = 'show' | 'hide' | 'toggle';

/**
 * Service for handling UI commands between contexts using direct Chrome messaging.
 */
export class UICommandService {
  /**
   * Registers a tab's command handler.
   * (Stub method for API compatibility: does nothing for direct messaging.)
   * @param tabId The tab ID to register.
   * @returns Always returns true.
   */
  registerCommandHandler(tabId: number): boolean {
    console.log(`[UICommandService] Tab ${tabId} noted. No registration needed for direct messaging.`);
    return true;
  }

  /**
   * Unregisters a tab's command handler.
   * (Stub method for API compatibility: does nothing for direct messaging.)
   * @param tabId The tab ID to unregister.
   * @returns Always returns true.
   */
  unregisterCommandHandler(tabId: number): boolean {
    console.log(`[UICommandService] Tab ${tabId} unregistration noted. No action needed for direct messaging.`);
    return true;
  }

  /**
   * Shows or toggles the search overlay in a tab using a simple direct messaging approach.
   * If the content script is not yet loaded in the tab, it attempts to inject it first.
   * @param tabId The ID of the target tab.
   * @param action The overlay action ('show', 'hide', or 'toggle'). Defaults to 'toggle'.
   * @returns A promise resolving to true on success, or false on failure.
   */
  async showSearchOverlay(tabId: number, action: OverlayAction = 'toggle'): Promise<boolean> {
    console.log(`[UICommandService] Attempting to show search overlay in tab ${tabId} with action: ${action}`);

    try {
      // Check if content script is already loaded
      await this.pingTab(tabId);
      console.log(`[UICommandService] Content script present in tab ${tabId}. Sending show overlay command...`);
      return this.sendShowOverlayMessage(tabId, action);

    } catch (noScriptError) {
      // If content script wasn't found, inject it
      console.log(`[UICommandService] No content script found in tab ${tabId}. Attempting injection...`);
      const scriptPath = 'src/content/globalSearch.tsx'; // Adjust path to your actual build output

      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: [scriptPath],
        });
        console.log(`[UICommandService] Script injected into tab ${tabId}. Will attempt to show overlay after short delay.`);

        // Give the script a moment to load fully before sending the message
        await new Promise((resolve) => setTimeout(resolve, 300));
        return this.sendShowOverlayMessage(tabId, action);

      } catch (injectionError) {
        console.error(`[UICommandService] Failed to inject content script into tab ${tabId}:`, injectionError);
        return false;
      }
    }
  }

  /**
   * Pings a tab to check if the content script is loaded.
   * @param tabId The ID of the tab to ping.
   * @returns A promise that resolves if the script responds, rejects otherwise.
   */
  private async pingTab(tabId: number): Promise<void> {
    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, { type: 'PING' }, (response) => {
        if (chrome.runtime.lastError) {
          return reject(chrome.runtime.lastError);
        }
        if (response?.pong) {
          return resolve();
        }
        reject(new Error('Invalid ping response'));
      });

      // Prevent long hangs by timing out after 500ms
      setTimeout(() => reject(new Error('Ping timed out')), 500);
    });
  }

  /**
   * Sends a message to show/hide/toggle the search overlay in a tab.
   * Retrieves the current theme from preferencesService and includes it in the message.
   * @param tabId The ID of the target tab.
   * @param action The overlay action to perform.
   * @returns A promise resolving to true if successful, or false on error.
   */
  private async sendShowOverlayMessage(tabId: number, action: OverlayAction): Promise<boolean> {
    const theme = await preferencesService.getTheme();

    return new Promise((resolve) => {
      chrome.tabs.sendMessage(
        tabId,
        {
          type: 'SHOW_SEARCH_OVERLAY',
          action,
          theme,
        },
        () => {
          if (chrome.runtime.lastError) {
            console.error(`[UICommandService] Error sending overlay command to tab ${tabId}:`, chrome.runtime.lastError);
            return resolve(false);
          }
          resolve(true);
        },
      );

      // Fallback if there's no response within 1 second
      setTimeout(() => resolve(false), 1000);
    });
  }
}

// Export a singleton instance of the UICommandService
export const uiCommandService = new UICommandService();
export default uiCommandService;