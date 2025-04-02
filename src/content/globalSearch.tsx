/**
 * @file globalSearch.tsx
 * Content script that, when triggered, shows a floating search overlay with React.
 * Uses direct Chrome messaging for communication with the background service worker.
 */

import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import SearchOverlay from '../pages/spotlight/SearchOverlay';
import '../pages/spotlight/spotlight.css';

console.log('[DORY] globalSearch.tsx loaded and initializing...');

let overlayContainer: HTMLDivElement | null = null;
let styleSheet: HTMLStyleElement | null = null;
let rootElement: HTMLElement | null = null;
let reactRoot: Root | null = null;
let previouslyFocusedElement: Element | null = null;

/**
 * Initialize content script to receive commands from the background script via direct Chrome messaging.
 * Sets up a message listener for the SHOW_SEARCH_OVERLAY and PING messages.
 */
function initBackgroundAPI(): void {
  try {
    console.log('[DORY] Setting up direct message listeners for commands');

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      console.log('[DORY] Message received:', message.type);

      // Handle ping message for content script detection
      if (message.type === 'PING') {
        console.log('[DORY] Received ping, responding with pong');
        sendResponse({ success: true, pong: true });
        return true;
      }

      // Handle search overlay commands
      if (message.type === 'SHOW_SEARCH_OVERLAY') {
        console.log('[DORY] Received command: showSearchOverlay:', message.action);
        const action = message.action || 'toggle';
        const theme = message.theme || 'system';
        handleToggleOverlay(action, theme);
        sendResponse({ success: true });
        return true;
      }

      return false;
    });

    // Register this content script with the background script
    getCurrentTabId().then((tabId) => {
      if (!tabId) {
        console.warn('[DORY] Could not determine current tab ID, skipping registration');
        return;
      }

      chrome.runtime.sendMessage({ 
        type: 'CONTENT_SCRIPT_READY',
        tabId,
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.warn('[DORY] Error registering with background:', chrome.runtime.lastError);
          return;
        }
        console.log('[DORY] Successfully registered with background script:', response);
      });
    });

  } catch (error) {
    console.error('[DORY] Error initializing listeners:', error);
  }
}

/**
 * Helper function to get the current tab ID.
 * @returns Promise that resolves to the current tab ID or undefined if not found.
 */
async function getCurrentTabId(): Promise<number | undefined> {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ type: 'GET_CURRENT_TAB_ID' }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('[DORY] Error getting tab ID:', chrome.runtime.lastError);
          resolve(undefined);
        } else {
          resolve(response?.tabId);
        }
      });
    } catch (error) {
      console.error('[DORY] Error requesting tab ID:', error);
      resolve(undefined);
    }
  });
}

/**
 * Handle overlay visibility commands received from the background script.
 * @param action The action to perform ('show', 'hide', or 'toggle').
 * @param theme The theme to use ('light', 'dark', or 'system').
 */
function handleToggleOverlay(
  action: 'show' | 'hide' | 'toggle' = 'toggle',
  theme: 'light' | 'dark' | 'system' = 'system'
): void {
  console.log(`[DORY] Overlay command received: ${action} (theme: ${theme})`);

  if (action === 'hide' || (action === 'toggle' && overlayContainer)) {
    console.log('[DORY] Hiding overlay');
    hideSearchOverlay();
  } else if (action === 'show' || (action === 'toggle' && !overlayContainer)) {
    console.log('[DORY] Showing overlay');
    showSearchOverlay(theme).catch((err) => {
      console.error('[DORY] Error showing search overlay:', err);
    });
  }
}

/**
 * Show the React-based search overlay.
 * @param theme The theme to use ('light', 'dark', or 'system'), default is 'system'.
 */
async function showSearchOverlay(theme: 'light' | 'dark' | 'system' = 'system'): Promise<void> {
  removeExistingOverlay();

  // Store the currently focused element to restore focus when we close
  previouslyFocusedElement = document.activeElement;

  // Create main overlay container
  overlayContainer = document.createElement('div');
  overlayContainer.id = 'dory-search-overlay';

  // Determine dark mode preference based on provided theme
  let prefersDarkMode = false;
  try {
    if (theme === 'dark') {
      prefersDarkMode = true;
    } else if (theme === 'system') {
      prefersDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    console.log(`[DORY] Using theme: ${theme} (dark mode: ${prefersDarkMode})`);
  } catch (err) {
    console.error('[DORY] Error setting theme:', err);
    prefersDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  // Apply theme-specific class
  if (prefersDarkMode) {
    overlayContainer.classList.add('dory-dark-theme');
  } else {
    overlayContainer.classList.add('dory-light-theme');
  }

  // Create and append style element
  styleSheet = document.createElement('style');
  styleSheet.textContent = `
    /* Load Cabinet Grotesk font */
    @font-face {
      font-family: 'Cabinet Grotesk';
      src: url(${chrome.runtime.getURL('fonts/Cabinet-Grotesk/CabinetGrotesk-Regular.otf')}) format('opentype');
      font-weight: 400;
      font-style: normal;
    }
    @font-face {
      font-family: 'Cabinet Grotesk';
      src: url(${chrome.runtime.getURL('fonts/Cabinet-Grotesk/CabinetGrotesk-Medium.otf')}) format('opentype');
      font-weight: 500;
      font-style: normal;
    }
    @font-face {
      font-family: 'Cabinet Grotesk';
      src: url(${chrome.runtime.getURL('fonts/Cabinet-Grotesk/CabinetGrotesk-Bold.otf')}) format('opentype');
      font-weight: 700;
      font-style: normal;
    }

    /* Overlay positioning */
    #dory-search-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: 999999;
      display: flex;
      justify-content: flex-end;
      align-items: flex-start;
      padding-top: 15vh;
      padding-right: 15vw;
      background-color: rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(5px);
      font-family: 'Cabinet Grotesk', sans-serif;
      transition: opacity 0.2s ease-in-out;
      opacity: 0;
    }
    #dory-search-overlay.visible {
      opacity: 1;
    }
    #dory-search-container {
      width: 600px;
      max-width: 90%;
    }
    .spotlight-search {
      width: 100%;
      height: 100%;
    }

    /* ==========================================
       NewTabSearchBar.css (adapted for overlay)
       ========================================== */
    .search-container {
      width: 100%;
      background-color: transparent;
      border-radius: 12px;
      padding: 16px 20px;
      border: 1px solid var(--border-color);
      transition: all 0.3s ease;
      position: relative;
      box-sizing: border-box;
      text-align: left;
    }
    .search-container:hover {
      border-color: var(--border-hover-color);
      box-shadow: 0 0 20px var(--shadow-color);
    }
    .search-container:focus-within {
      border-color: var(--border-focus-color);
      box-shadow: 0 0 25px var(--shadow-focus-color);
    }
    .search-bar-inner-container {
      display: flex;
      align-items: center;
      gap: 16px;
      width: 100%;
      position: relative;
      margin-bottom: 8px;
      box-sizing: border-box;
    }
    .results-header-divider {
      border-bottom: 1px solid var(--border-color);
      margin: 0 0 4px 0;
    }
    .icon-wrapper {
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--text-color);
      cursor: default;
      padding: 8px;
      border-radius: 50%;
      transition: all 0.2s ease;
    }
    .icon-wrapper.clickable {
      cursor: pointer;
    }
    .icon-wrapper.clickable:hover {
      opacity: 0.8;
      transform: scale(1.1);
    }
    .search-input {
      background: transparent;
      border: none;
      color: var(--text-color);
      font-size: 18px;
      font-family: 'Cabinet Grotesk', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      line-height: 28px;
      width: 100%;
      padding: 0;
      margin: 0;
      outline: none;
    }
    .search-input::placeholder {
      color: var(--text-color);
      opacity: 0.7;
    }
    .spinner-wrapper {
      margin-right: 8px;
      display: flex;
      align-items: flex-end;
    }
    @keyframes spin {
      0%   { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    .spinner {
      box-sizing: border-box;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      border: 2px solid transparent;
      border-top-color: var(--text-color);
      border-left-color: var(--text-color);
      border-right-color: var(--text-color);
      animation: spin 0.8s linear infinite;
    }
    .search-mode-indicator {
      margin-top: 8px;
      text-align: center;
      color: var(--text-secondary);
      font-size: 12px;
      font-style: italic;
      opacity: 0.7;
      transition: opacity 0.3s ease;
    }
    .search-mode-indicator.hidden {
      display: none;
      opacity: 0;
    }
    .results-list {
      margin: 0;
      padding: 0;
      list-style: none;
      max-height: calc(3 * 72px);
      overflow: hidden;
    }
    .results-header {
      padding: 2px 12px 4px 12px;
      font-size: 14px;
      font-style: italic;
      color: var(--text-secondary);
      margin-bottom: 0px;
      text-align: center;
    }
    .result-item {
      padding: 12px;
      cursor: pointer;
      transition: background-color 0.2s ease;
      border: none;
      border-left: 3px solid transparent;
      border-radius: 12px;
    }
    .result-item:hover {
      background-color: var(--item-hover-bg);
    }
    .result-item.selected {
      background-color: var(--item-hover-bg);
      border-left: 3px solid var(--border-focus-color);
      padding-left: 9px;
    }
    .result-title {
      font-size: 16px;
      font-weight: 500;
      color: var(--text-primary);
      margin-bottom: 4px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .result-url {
      font-size: 12px;
      color: var(--text-secondary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .result-explanation {
      font-size: 12px;
      color: var(--text-secondary);
      margin-top: 4px;
      line-height: 1.4;
      opacity: 0.9;
      font-style: italic;
    }
    .explanation-label {
      font-weight: 600;
      font-style: normal;
    }
    .status-message {
      text-align: center;
      padding: 10px 12px;
      color: var(--text-secondary);
      min-height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: opacity 0.2s ease;
      border-radius: 8px;
      margin: 4px 0;
    }
    .status-message.searching {
      font-size: 14px;
      font-style: italic;
    }
    .status-message.no-results {
      font-size: 14px;
      font-style: italic;
      color: var(--text-secondary);
    }

    /* Light theme overrides */
    .dory-light-theme .search-container {
      background-color: #ffffff !important;
      color: #000000 !important;
      border: 1px solid rgba(0, 0, 0, 0.3) !important;
      --border-color: rgba(0, 0, 0, 0.2);
      --border-hover-color: rgba(0, 0, 0, 0.2);
      --border-focus-color: rgba(0, 0, 0, 0.8);
      --shadow-color: rgba(0, 0, 0, 0.1);
      --shadow-focus-color: rgba(0, 0, 0, 0.2);
      --text-color: #000000;
      --text-primary: #000000;
      --text-secondary: #555555;
      --item-hover-bg: rgba(0, 0, 0, 0.05);
    }
    .dory-light-theme .search-input {
      color: #000000 !important;
    }
    .dory-light-theme .search-input::placeholder {
      color: rgba(0, 0, 0, 0.7) !important;
    }
    .dory-light-theme .results-list {
      background-color: #ffffff !important;
    }

    /* Dark theme overrides */
    .dory-dark-theme .search-container {
      background-color: #000000 !important;
      color: #ffffff !important;
      border: 1px solid rgba(255, 255, 255, 0.3) !important;
      --border-color: rgba(255, 255, 255, 0.2);
      --border-hover-color: rgba(255, 255, 255, 0.2);
      --border-focus-color: rgba(255, 255, 255, 0.8);
      --shadow-color: rgba(0, 0, 0, 0.3);
      --shadow-focus-color: rgba(255, 255, 255, 0.2);
      --text-color: #ffffff;
      --text-primary: #ffffff;
      --text-secondary: #bbbbbb;
      --item-hover-bg: rgba(255, 255, 255, 0.05);
    }
    .dory-dark-theme .search-input {
      color: #ffffff !important;
    }
    .dory-dark-theme .search-input::placeholder {
      color: rgba(255, 255, 255, 0.7) !important;
    }
    .dory-dark-theme .results-list {
      background-color: #000000 !important;
    }
    .dory-light-theme .spotlight-search[data-active="true"] .search-container {
      box-shadow: 0 0 35px rgba(0, 0, 0, 0.3) !important;
    }
    .dory-dark-theme .spotlight-search[data-active="true"] .search-container {
      box-shadow: 0 0 35px rgba(255, 255, 255, 0.2) !important;
    }
  `;
  document.head.appendChild(styleSheet);

  // Create container for the React app
  rootElement = document.createElement('div');
  rootElement.id = 'dory-search-container';
  overlayContainer.appendChild(rootElement);

  document.body.appendChild(overlayContainer);

  // Render React component
  renderReactApp(rootElement);

  // Animate in
  setTimeout(() => {
    overlayContainer?.classList.add('visible');
  }, 10);
}

/**
 * Remove any existing overlay and unmount the React app if necessary.
 */
function removeExistingOverlay(): void {
  const existing = document.getElementById('dory-search-overlay');
  if (existing && existing.parentNode) {
    existing.parentNode.removeChild(existing);
  }

  if (reactRoot) {
    try {
      reactRoot.unmount();
    } catch (err) {
      console.error('[DORY] Error unmounting React root:', err);
    }
    reactRoot = null;
  }
}

/**
 * Hide the search overlay and restore previously focused element.
 */
function hideSearchOverlay(): void {
  if (!overlayContainer) return;

  overlayContainer.classList.remove('visible');

  // Wait for the fade-out transition
  setTimeout(() => {
    overlayContainer?.remove();
    overlayContainer = null;

    styleSheet?.remove();
    styleSheet = null;

    if (previouslyFocusedElement && 'focus' in previouslyFocusedElement) {
      (previouslyFocusedElement as HTMLElement).focus();
    }
    previouslyFocusedElement = null;
  }, 200);
}

/**
 * Render the React SearchOverlay component.
 * @param container The DOM element to render the React component in.
 */
function renderReactApp(container: HTMLElement): void {
  try {
    console.log('[DORY] Creating React root...');
    reactRoot = createRoot(container);

    console.log('[DORY] React root created, rendering SearchOverlay...');
    reactRoot.render(<SearchOverlay onClose={hideSearchOverlay} />);
    console.log('[DORY] SearchOverlay rendered successfully');

  } catch (err: any) {
    console.error('[DORY] Error rendering React:', err);
    container.innerHTML = `
      <div style="padding: 20px; text-align: center; color: #333; background-color: white; border-radius: 12px;">
        <h3 style="margin-top: 0;">DORY Search Error</h3>
        <p>There was an error loading the search overlay.</p>
        <p style="font-size: 12px; color: #777;">${err.message}</p>
      </div>`;
  }
}

// Initialize background API right away
initBackgroundAPI();

// Listen for keyboard shortcuts directly in the content script
document.addEventListener('keydown', (e) => {
  // Close on Escape key
  if (e.key === 'Escape' && overlayContainer) {
    hideSearchOverlay();
  }
});