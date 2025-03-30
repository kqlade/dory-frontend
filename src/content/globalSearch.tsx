/**
 * @file globalSearch.tsx
 * Content script that, when triggered, shows a floating search overlay with React.
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import SearchOverlay from '../pages/spotlight/SearchOverlay';
import '../pages/spotlight/spotlight.css';

console.log('[DORY] globalSearch.tsx loaded and waiting...');

let overlayContainer: HTMLDivElement | null = null;
let styleSheet: HTMLStyleElement | null = null;
let rootElement: HTMLElement | null = null;
let reactRoot: any = null;
let previouslyFocusedElement: Element | null = null;

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'PING') {
    console.log('[DORY] Received PING');
    return true;
  }
  if (message.type === 'SHOW_SEARCH_OVERLAY') {
    console.log('[DORY] SHOW_SEARCH_OVERLAY message received');
    // Toggle the overlay - hide if visible, show if not
    if (overlayContainer) {
      console.log('[DORY] Overlay already visible, hiding it');
      hideSearchOverlay();
    } else {
      console.log('[DORY] Rendering search overlay');
      showSearchOverlay();
    }
    return true;
  }
  return false;
});

// Also listen for keyboard shortcut directly in the content script
document.addEventListener('keydown', (e) => {
  // Handle Escape key to close the overlay when it's visible
  if (e.key === 'Escape' && overlayContainer) {
    hideSearchOverlay();
  }
});

function showSearchOverlay(): void {
  removeExistingOverlay();
  
  // Store the currently focused element to restore focus when we close
  previouslyFocusedElement = document.activeElement;

  // Create main container
  overlayContainer = document.createElement('div');
  overlayContainer.id = 'dory-search-overlay';
  
  // Check for theme preference
  let prefersDarkMode = false;
  try {
    const storedTheme = localStorage.getItem('preferredTheme');
    if (storedTheme) {
      prefersDarkMode = storedTheme === 'dark';
    } else {
      // Fall back to system preference
      prefersDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
  } catch (err) {
    console.error('[DORY] Error reading theme preference:', err);
    // Fall back to system preference
    prefersDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  
  // Apply theme class
  if (prefersDarkMode) {
    overlayContainer.classList.add('dory-dark-theme');
  } else {
    overlayContainer.classList.add('dory-light-theme');
  }
  
  // Create style element
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

    /* Overlay-specific positioning */
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

    /* ========== EXACT COPY FROM NewTabSearchBar.css ========== */
    /* Container that wraps everything */
    .search-container {
      width: 100%; /* Fill the parent wrapper */
      background-color: transparent;
      border-radius: 12px;
      padding: 16px 20px;
      border: 1px solid var(--border-color);
      transition: all 0.3s ease;
      position: relative; /* to contain absolutely positioned elements if needed */
      box-sizing: border-box; /* Ensure padding is included in width calculation */
      text-align: left; /* Explicit text alignment for input */
    }
    
    /* Hover & focus states */
    .search-container:hover {
      border-color: var(--border-hover-color);
      box-shadow: 0 0 20px var(--shadow-color);
    }
    .search-container:focus-within {
      border-color: var(--border-focus-color);
      box-shadow: 0 0 25px var(--shadow-focus-color);
    }
    
    /* The top bar with the icon + input + spinner */
    .search-bar-inner-container {
      display: flex;
      align-items: center;
      gap: 16px;
      width: 100%;
      position: relative;
      box-sizing: border-box; /* Consistent box model */
      margin-bottom: 8px;
    }
    
    /* Results header divider line */
    .results-header-divider {
      border-bottom: 1px solid var(--border-color);
      margin: 0 0 4px 0; /* Keep original spacing to results */
    }
    
    /* Icon wrapper */
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
    /* Make clickable if we have toggles */
    .icon-wrapper.clickable {
      cursor: pointer;
    }
    
    .icon-wrapper.clickable:hover {
      opacity: 0.8;
      transform: scale(1.1);
    }
    
    /* The search input */
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
    
    /* Spinner wrapper + spinner */
    .spinner-wrapper {
      margin-right: 8px;
      display: flex;
      align-items: flex-end;
    }
    
    @keyframes spin {
      0%   { transform: rotate(0deg);   }
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
    
    /* Search mode indicator (semantic vs quick launch) */
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
    
    /* Results list below the input */
    .results-list {
      margin: 0;
      padding: 0;
      list-style: none;
      max-height: calc(3 * 72px);
      overflow: hidden;
    }
    
    .results-header {
      padding: 2px 12px 4px 12px; /* Reduce top padding from 8px to 2px */
      font-size: 14px;
      font-style: italic;
      color: var(--text-secondary);
      margin-bottom: 0px; /* Reduce from 4px to 0px */
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
      padding-left: 9px; /* 12px - 3px border */
    }
    
    /* Title, URL, explanation */
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
    
    /* Status messages (searching, no-results, etc.) */
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
    /* ========== END EXACT COPY FROM NewTabSearchBar.css ========== */
    
    /* Theme-specific overrides for content script environment */
    /* Light theme - for the search bar */
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
    
    /* Dark theme - for the search bar */
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
    
    /* Make sure background matches theme */
    .dory-light-theme .results-list {
      background-color: #ffffff !important;
    }
    
    .dory-dark-theme .results-list {
      background-color: #000000 !important;
    }
  `;
  document.head.appendChild(styleSheet);

  // Create container for the React app
  rootElement = document.createElement('div');
  rootElement.id = 'dory-search-container';
  overlayContainer.appendChild(rootElement);
  
  // Add to DOM
  document.body.appendChild(overlayContainer);
  
  // Render React component
  renderReactApp(rootElement);
  
  // Animate in
  setTimeout(() => {
    overlayContainer?.classList.add('visible');
  }, 10);
}

function removeExistingOverlay() {
  const existing = document.getElementById('dory-search-overlay');
  if (existing && existing.parentNode) {
    existing.parentNode.removeChild(existing);
  }
  
  // Clean up React root if it exists
  if (reactRoot) {
    try {
      reactRoot.unmount();
    } catch (err) {
      console.error('[DORY] Error unmounting React root:', err);
    }
    reactRoot = null;
  }
}

function hideSearchOverlay(): void {
  if (overlayContainer) {
    // Animate out
    overlayContainer.classList.remove('visible');
    
    // Wait for animation to complete before removing
    setTimeout(() => {
      if (overlayContainer) {
        overlayContainer.remove();
        overlayContainer = null;
      }
      
      if (styleSheet) {
        styleSheet.remove();
        styleSheet = null;
      }
      
      // Restore focus to the previously focused element
      if (previouslyFocusedElement && 'focus' in previouslyFocusedElement) {
        (previouslyFocusedElement as HTMLElement).focus();
      }
      previouslyFocusedElement = null;
    }, 200); // Match transition duration
  }
}

function renderReactApp(container: HTMLElement): void {
  try {
    console.log('[DORY] Creating React root...');
    reactRoot = createRoot(container);
    console.log('[DORY] React root created, rendering SearchOverlay...');
    reactRoot.render(<SearchOverlay onClose={hideSearchOverlay} />);
    console.log('[DORY] SearchOverlay rendered successfully');
  } catch (err: any) {
    console.error('[DORY] Error rendering React:', err);
    console.error('[DORY] Error details:', {
      message: err.message,
      stack: err.stack,
      name: err.name
    });
    container.innerHTML = '<div style="padding: 20px; text-align: center; color: #333; background-color: white; border-radius: 12px;"><h3 style="margin-top: 0;">DORY Search Error</h3><p>There was an error loading the search overlay.</p></div>';
  }
} 