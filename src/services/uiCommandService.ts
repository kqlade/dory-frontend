/**
 * @file uiCommandService.ts
 * 
 * Service for handling UI commands between background and content scripts
 * using Comlink for type-safe RPC.
 */

import * as Comlink from 'comlink';
import type { ContentCommandAPI } from '../types';

/**
 * Service for handling UI commands between contexts
 */
export class UICommandService {
  // Store ContentCommandAPI proxies by tab ID
  private tabCommandProxies: Record<number, Comlink.Remote<ContentCommandAPI>> = {};
  
  /**
   * Register a tab's command handler
   * @param tabId The tab ID to register
   * @param port The MessagePort to use for communication
   * @returns Success status
   */
  registerCommandHandler(tabId: number, port: MessagePort): boolean {
    try {
      // Wrap the port with Comlink to create a proxy to the content script's API
      this.tabCommandProxies[tabId] = Comlink.wrap<ContentCommandAPI>(port);
      console.log(`[UICommandService] Registered command handler for tab ${tabId}`);
      return true;
    } catch (error) {
      console.error(`[UICommandService] Failed to register command handler for tab ${tabId}:`, error);
      return false;
    }
  }
  
  /**
   * Unregister a tab's command handler
   * @param tabId The tab ID to unregister
   * @returns Success status
   */
  unregisterCommandHandler(tabId: number): boolean {
    if (this.tabCommandProxies[tabId]) {
      delete this.tabCommandProxies[tabId];
      console.log(`[UICommandService] Unregistered command handler for tab ${tabId}`);
      return true;
    }
    return false;
  }
  
  /**
   * Show or toggle search overlay in a tab
   * @param tabId The tab ID to show the overlay in
   * @param action The action to perform ('show', 'hide', or 'toggle')
   * @returns Promise resolving to success status
   */
  async showSearchOverlay(tabId: number, action: 'show' | 'hide' | 'toggle' = 'toggle'): Promise<boolean> {
    try {
      const proxy = this.tabCommandProxies[tabId];
      if (!proxy) {
        console.warn(`[UICommandService] No command handler for tab ${tabId}`);
        return false;
      }
      
      return await proxy.showSearchOverlay(action);
    } catch (error) {
      console.error(`[UICommandService] Error showing search overlay in tab ${tabId}:`, error);
      return false;
    }
  }
}

// Create and export singleton instance
export const uiCommandService = new UICommandService();
export default uiCommandService;
