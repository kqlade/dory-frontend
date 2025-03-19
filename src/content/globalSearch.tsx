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
    console.log('[DORY] SHOW_SEARCH_OVERLAY => rendering search overlay');
    showSearchOverlay();
    return true;
  }
  return false;
});

// Also listen for keyboard shortcut directly in the content script
document.addEventListener('keydown', (e) => {
  // Cmd+K or Ctrl+K
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault();
    showSearchOverlay();
  }
  
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
    #dory-search-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: 999999;
      display: flex;
      justify-content: center;
      align-items: center;
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
    
    /* Light theme - for the search bar */
    .dory-light-theme .search-container {
      background-color: #ffffff !important;
      color: #000000 !important;
      border: 1px solid rgba(0, 0, 0, 0.3) !important;
    }
    
    .dory-light-theme .search-input {
      color: #000000 !important;
    }
    
    .dory-light-theme .search-input::placeholder {
      color: rgba(0, 0, 0, 0.7) !important;
    }
    
    /* Dark theme - for the search bar */
    .dory-dark-theme .search-container {
      background-color: #1e1e1e !important;
      color: #ffffff !important;
      border: 1px solid rgba(255, 255, 255, 0.3) !important;
    }
    
    .dory-dark-theme .search-input {
      color: #ffffff !important;
    }
    
    .dory-dark-theme .search-input::placeholder {
      color: rgba(255, 255, 255, 0.7) !important;
    }
    
    /* Make sure result items also have the right background */
    .dory-light-theme .results-list {
      background-color: #ffffff !important;
    }
    
    .dory-dark-theme .results-list {
      background-color: #1e1e1e !important;
    }
    
    .dory-light-theme .result-item.selected,
    .dory-light-theme .result-item:hover {
      background-color: rgba(0, 0, 0, 0.05) !important;
    }
    
    .dory-dark-theme .result-item.selected,
    .dory-dark-theme .result-item:hover {
      background-color: rgba(255, 255, 255, 0.1) !important;
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
  
  // Notify the background that search overlay is ready
  chrome.runtime.sendMessage({ type: 'SEARCH_OVERLAY_READY' });
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