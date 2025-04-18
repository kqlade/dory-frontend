/**
 * @file globalSearch.tsx
 * Content script that, when triggered, shows a floating search overlay with React.
 * Uses direct Chrome messaging for communication with the background service worker.
 * Uses Shadow DOM for style and DOM isolation.
 */

import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import SearchOverlay from '../pages/spotlight/SearchOverlay';

console.log('[DORY] globalSearch.tsx loaded and initializing...');

let hostElement: HTMLDivElement | null = null;
let shadowRoot: ShadowRoot | null = null;
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

  if (action === 'hide' || (action === 'toggle' && hostElement)) {
    console.log('[DORY] Hiding overlay');
    hideSearchOverlay();
  } else if (action === 'show' || (action === 'toggle' && !hostElement)) {
    console.log('[DORY] Showing overlay');
    showSearchOverlay(theme).catch((err) => {
      console.error('[DORY] Error showing search overlay:', err);
    });
  }
}

/**
 * Show the React-based search overlay in a Shadow DOM.
 * @param theme The theme to use ('light', 'dark', or 'system'), default is 'system'.
 */
async function showSearchOverlay(theme: 'light' | 'dark' | 'system' = 'system'): Promise<void> {
  removeExistingOverlay();

  // Store the currently focused element to restore focus when we close
  previouslyFocusedElement = document.activeElement;

  // Create host element for the Shadow DOM
  hostElement = document.createElement('div');
  hostElement.id = 'dory-shadow-host';
  document.body.appendChild(hostElement);

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

  // Create Shadow DOM
  shadowRoot = hostElement.attachShadow({ mode: 'closed' });

  // Fetch the content of NewTabSearchBar.css
  let searchBarCss = '';
  try {
    const response = await fetch(chrome.runtime.getURL('assets/NewTabSearchBar.css'));
    if (response.ok) {
      searchBarCss = await response.text();
      console.log('[DORY] Successfully fetched NewTabSearchBar.css content');
    } else {
      console.error('[DORY] Failed to fetch NewTabSearchBar.css:', response.statusText);
    }
  } catch (error) {
    console.error('[DORY] Error fetching NewTabSearchBar.css:', error);
  }

  // Add combined CSS to a single style element in the Shadow DOM
  const styleElement = document.createElement('style');
  styleElement.textContent = `
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

    /* Set theme-specific variables */
    :host {
      ${prefersDarkMode ? `
      --border-color: rgba(255, 255, 255, 0.2);
      --border-hover-color: rgba(255, 255, 255, 0.2);
      --border-focus-color: rgba(255, 255, 255, 0.8);
      --shadow-color: rgba(0, 0, 0, 0.3);
      --shadow-focus-color: rgba(255, 255, 255, 0.2);
      --text-color: #ffffff;
      --text-primary: #ffffff;
      --text-secondary: #bbbbbb;
      --item-hover-bg: rgba(255, 255, 255, 0.05);
      ` : `
      --border-color: rgba(0, 0, 0, 0.2);
      --border-hover-color: rgba(0, 0, 0, 0.2);
      --border-focus-color: rgba(0, 0, 0, 0.8);
      --shadow-color: rgba(0, 0, 0, 0.1);
      --shadow-focus-color: rgba(0, 0, 0, 0.2);
      --text-color: #000000;
      --text-primary: #000000;
      --text-secondary: #555555;
      --item-hover-bg: rgba(0, 0, 0, 0.05);
      `}
    }

    /* Overlay positioning - these are specific to the Shadow DOM and not in the component CSS */
    #dory-search-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: 999999;
      background-color: rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(5px);
      font-family: 'Cabinet Grotesk', sans-serif;
      transition: opacity 0.2s ease-in-out;
      opacity: 0;
      pointer-events: none;
    }

    #dory-search-overlay.visible {
      opacity: 1;
      pointer-events: auto;
    }

    #dory-search-container {
      position: absolute;
      top: 15vh;
      right: 15vw;
      width: 600px;
      max-width: 90%;
      pointer-events: auto;
    }

    /* Shadow DOM overrides derived directly from NewTabSearchBar.css */
    .results-list {
      max-height: 116px !important;  /* Explicit value from calc(2 * 58px) */
      overflow: hidden !important;   /* Match overflow behavior */
    }

    .result-item {
      padding: 8px 10px !important; /* Match padding */
      height: 58px !important;       /* Enforce the implied height per item */
      box-sizing: border-box !important; /* Ensure padding is included in height */
      border-left: 3px solid transparent; /* Base border WITHOUT !important */
    }

    /* Add explicit selected state styling */
    .result-item.selected {
      background-color: var(--item-hover-bg) !important;
      border-left: 3px solid var(--border-focus-color) !important;
      padding-left: 7px !important; /* Reduced to compensate for visible border */
    }

    .result-title {
      font-size: 14px !important;    /* Match font size */
      margin-bottom: 2px !important; /* Restore original spacing */
      line-height: 1.2 !important;   /* Restore original line height */
      /* Rely on injected CSS for text overflow etc. */
    }

    .result-url {
      font-size: 11px !important;    /* Match font size */
      padding-left: 24px !important; /* Match indentation */
      display: block !important;     /* Ensure it takes vertical space */
      line-height: 1.2 !important;   /* Restore original line height */
      /* Rely on injected CSS for text overflow etc. */
    }

    /* Theme-specific search container overrides */
    .search-container {
      ${prefersDarkMode ? `
      background-color: #000000 !important;
      color: #ffffff !important;
      border: 1px solid rgba(255, 255, 255, 0.3) !important;
      box-shadow: 0 0 35px rgba(255, 255, 255, 0.2) !important;
      ` : `
      background-color: #ffffff !important;
      color: #000000 !important;
      border: 1px solid rgba(0, 0, 0, 0.3) !important;
      box-shadow: 0 0 35px rgba(0, 0, 0, 0.3) !important;
      `}
    }

    .search-input {
      ${prefersDarkMode ? `
      color: #ffffff !important;
      ` : `
      color: #000000 !important;
      `}
    }

    .search-input::placeholder {
      ${prefersDarkMode ? `
      color: rgba(255, 255, 255, 0.7) !important;
      ` : `
      color: rgba(0, 0, 0, 0.7) !important;
      `}
    }

    /* Inject NewTabSearchBar.css content */
    ${searchBarCss}
  `;
  shadowRoot.appendChild(styleElement);

  // Create main overlay container in the Shadow DOM
  const overlayContainer = document.createElement('div');
  overlayContainer.id = 'dory-search-overlay';
  shadowRoot.appendChild(overlayContainer);

  // Create container for the React app
  const rootElement = document.createElement('div');
  rootElement.id = 'dory-search-container';
  overlayContainer.appendChild(rootElement);

  // Add click event on overlay background to dismiss (like Escape key)
  overlayContainer.addEventListener('click', (e) => {
    // Only close if clicking the background, not the search container
    if (e.target === overlayContainer) {
      hideSearchOverlay();
    }
  });

  // Capture any highlighted text on the page
  const selObj = window.getSelection?.();
  const selectionStr = selObj?.toString().trim() || null;
  let selectionRect: DOMRect | null = null;
  if (selObj && selObj.rangeCount > 0) {
    const rect = selObj.getRangeAt(0).getBoundingClientRect();
    if (rect.width && rect.height) selectionRect = rect;
  }

  // Render React component, pass highlighted selection
  renderReactApp(rootElement, selectionStr, selectionRect);

  // Animate in
  setTimeout(() => {
    if (overlayContainer) {
      overlayContainer.classList.add('visible');
    }
  }, 10);
}

/**
 * Remove any existing overlay and unmount the React app if necessary.
 */
function removeExistingOverlay(): void {
  if (reactRoot) {
    try {
      reactRoot.unmount();
    } catch (err) {
      console.error('[DORY] Error unmounting React root:', err);
    }
    reactRoot = null;
  }

  if (hostElement) {
    hostElement.remove();
    hostElement = null;
    shadowRoot = null;
  }
}

/**
 * Hide the search overlay and restore previously focused element.
 */
function hideSearchOverlay(): void {
  if (!shadowRoot || !hostElement) return;

  const overlayContainer = shadowRoot.getElementById('dory-search-overlay');
  if (overlayContainer) {
    overlayContainer.classList.remove('visible');
  }

  // Wait for the fade-out transition
  setTimeout(() => {
    removeExistingOverlay();

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
function renderReactApp(container: HTMLElement, selection: string | null, selectionRect: DOMRect | null): void {
  try {
    console.log('[DORY] Creating React root...');
    reactRoot = createRoot(container);

    console.log('[DORY] React root created, rendering SearchOverlay...');
    reactRoot.render(<SearchOverlay onClose={hideSearchOverlay} selection={selection} selectionRect={selectionRect} />);
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
  if (e.key === 'Escape' && hostElement) {
    hideSearchOverlay();
  }
});