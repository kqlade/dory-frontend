# Global Search Overlay Implementation Plan

This document outlines the approach for implementing a Spotlight-style global search overlay in the DORY Chrome extension, following the existing patterns established in the codebase.

## Overview

The global search overlay will allow users to activate a search interface from any webpage using a keyboard shortcut. This feature will reuse the existing `NewTabSearchBar` component while providing an overlay experience similar to macOS Spotlight or Alfred.

## Implementation Components

### 1. Content Script: `src/content/globalSearch.tsx`

This will be the entry point that listens for keyboard shortcuts and message events, then creates and manages the search overlay.

```typescript
/**
 * @file globalSearch.tsx
 * Content script that, when triggered, shows a floating search overlay with React.
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import SearchOverlay from '../pages/spotlight/SearchOverlay';
import '../pages/spotlight/spotlight.css';

// Main functions:
// - Listen for keyboard shortcuts
// - Create container and styles
// - Mount/unmount React component
// - Handle focus management
// - Communicate with background script
```

Key responsibilities:
- Set up listeners for keyboard events (e.g., Cmd+K or customizable shortcut)
- Create and inject the overlay container into the page
- Apply inline styles for positioning and basic appearance
- Render the React search component
- Handle cleanup when the overlay is dismissed
- Manage communication with the background script

### 2. Search Overlay Component: `src/pages/spotlight/SearchOverlay.tsx`

A wrapper component that contains the search bar and handles results display:

```typescript
/**
 * @file SearchOverlay.tsx
 * React component for the global search overlay.
 */

import React, { useEffect, useState, useRef } from 'react';
import NewTabSearchBar from '../../components/NewTabSearchBar';

// Main functionality:
// - Import and use existing NewTabSearchBar
// - Handle results display and navigation
// - Manage keyboard interaction
// - Handle result selection
```

Key responsibilities:
- Integrate the existing NewTabSearchBar component
- Display and style search results
- Handle keyboard navigation (up/down arrows, enter, escape)
- Manage focus within the overlay
- Process result selection and navigation

### 3. Styling: `src/pages/spotlight/spotlight.css`

CSS for the overlay-specific styling:

```css
/* 
 * DORY SPOTLIGHT SEARCH STYLES
 */

/* Overlay backdrop */
.dory-search-backdrop {
  /* Full-screen semi-transparent background */
}

/* Search container */
.dory-search-container {
  /* Centered container for search bar */
}

/* Results styling */
.dory-search-results {
  /* Results container and item styling */
}

/* Animation and transitions */
/* Focus states */
/* Keyboard navigation indicators */
```

### 4. Background Script Integration

Updates to support activation via keyboard shortcut:

1. Register command in `manifest.json`:
```json
"commands": {
  "toggle-search": {
    "suggested_key": {
      "default": "Ctrl+K",
      "mac": "Command+K"
    },
    "description": "Toggle global search overlay"
  }
}
```

2. Add message handler in background script:
```typescript
// Handle command and send message to content script
chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle-search") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, { type: "SHOW_SEARCH_OVERLAY" });
    });
  }
});
```

## Implementation Details

### Container Structure
```
#dory-search-overlay (main container)
  └── .dory-search-backdrop (full-screen semi-transparent background)
      └── .dory-search-container (centered container)
          ├── NewTabSearchBar component
          └── .dory-search-results (search results)
```

### Event Flow
1. User presses keyboard shortcut (e.g., Cmd+K)
2. Background script or content script detects shortcut
3. `showSearchOverlay()` creates container and mounts React component
4. Search input automatically receives focus
5. As user types, results are filtered and displayed
6. User can navigate results with arrow keys
7. User selects result or presses Escape to dismiss
8. `hideSearchOverlay()` cleans up DOM elements

### Focus Management
- Trap focus within the overlay while active
- Return focus to previous element when dismissed
- Support keyboard navigation of results

### Styling Approach
- Container positioning and backdrop: inline styles via JavaScript
- Component-specific styling: imported CSS file
- Reuse existing search bar styles for consistency

## Performance and Accessibility Considerations

### Performance
- Lazy-load components to minimize initial content script size
- Only create DOM elements when the overlay is triggered
- Clean up event listeners when overlay is dismissed
- Cache results where appropriate

### Accessibility
- Proper ARIA attributes for overlay and search components
- Focus management for keyboard users
- High contrast visual indicators for selected items
- Support for screen readers
- Keyboard navigation support

## Development Approach

1. Implement the basic content script with container creation
2. Create the SearchOverlay component with basic search functionality
3. Add keyboard navigation and result selection
4. Integrate with background script for shortcut support
5. Refine styling and animations
6. Test across various websites and edge cases
7. Add final polish and accessibility improvements 