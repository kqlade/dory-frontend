# DORY Frontend Architecture Documentation

## 1. Overview

DORY (Dynamic Online Recall for You) is a Chrome extension that provides enhanced search capabilities across different contexts. The frontend is built using React, TypeScript, and modern web technologies, structured as a Manifest V3 extension with several distinct components:

- **New Tab Page**: Replaces Chrome's default new tab with a DORY-branded interface featuring a powerful search bar
- **Side Panel**: Provides user authentication and extension controls in Chrome's side panel UI
- **Search Overlay**: A global search component triggered by keyboard shortcut from any webpage
- **Background Service Worker**: Manages extension state, authentication, and message routing

The frontend interacts with a backend API for semantic search capabilities while also providing fast local search functionality without network requests.

## 2. Component Architecture

### 2.1 Extension Entry Points

DORY has multiple entry points, each serving a specific extension context:

| Component | Entry File | Description |
|-----------|------------|-------------|
| New Tab | `src/pages/newtab/index.tsx` | Replacement for the Chrome new tab page |
| Side Panel | `src/pages/sidepanel/index.tsx` | Chrome side panel integration |
| Background | `src/background/serviceWorker.ts` | Extension's background script (service worker) |
| Content Script | `src/content/globalSearch.tsx` | Injected into webpages to provide overlay search |

### 2.2 Core Components

The extension shares several core components across different contexts:

- **NewTabSearchBar**: The central search component used in both the new tab page and global search overlay
- **ThemeToggle**: Manages light/dark mode preferences
- **SearchOverlay**: Wraps the search bar for the global search experience

## 3. Search System

The search system is the core functionality of DORY, combining local and semantic search capabilities.

### 3.1 Search Architecture

DORY implements a hybrid search approach:

```
┌─────────────────┐     ┌──────────────────┐
│                 │     │                  │
│   Local Search  │     │ Semantic Search  │
│   (No network)  │     │  (API-powered)   │
│                 │     │                  │
└────────┬────────┘     └──────┬───────────┘
         │                     │
         │                     │
         v                     v
┌─────────────────────────────────────────┐
│                                         │
│            useHybridSearch              │
│      (Combines results as needed)       │
│                                         │
└─────────────────┬───────────────────────┘
                  │
                  v
┌─────────────────────────────────────────┐
│                                         │
│            NewTabSearchBar              │
│        (User interface component)       │
│                                         │
└─────────────────────────────────────────┘
```

### 3.2 Search Components

#### 3.2.1 `useHybridSearch` Hook

Located in `src/utils/useSearch.ts`, this hook:
- Manages input state and debouncing
- Coordinates between local and semantic search
- Toggles between search modes
- Handles results merging and state management

```typescript
export function useHybridSearch() {
  // State for input, search toggles, etc.
  const [inputValue, setInputValue] = useState('');
  const [semanticEnabled, setSemanticEnabled] = useState(false);
  
  // Calls different search methods based on state
  const { data: localResults } = useLocalSearch(inputValue);
  const { data: semanticResults } = useSemanticSearch(query, semanticEnabled);
  
  // Returns a unified interface for components
  return {
    inputValue, setInputValue,
    results, // combined and processed results
    isSearching, // loading state
    semanticEnabled,
    toggleSemanticSearch, // toggle function
    // ... other utility functions
  };
}
```

#### 3.2.2 Search Types

The search system supports two primary modes:

1. **Quick Launch** (Local Search):
   - Uses in-memory ranking via `localRanker`
   - Provides instant results without network requests
   - Useful for quick navigation to frequently visited sites

2. **Semantic Search**:
   - Makes API calls to the backend for AI-powered search
   - Provides context-aware results with explanations
   - Handles complex, natural language queries

### 3.3 API Integration

The search functionality communicates with the backend through:

- `src/api/client.ts`: Handles API requests with retry logic and error handling
- `semanticSearch()`: Primary function for querying the semantic search API

## 4. Theme System

DORY implements a theme system that:
1. Respects user preferences
2. Syncs across extension components
3. Falls back to system preferences when no explicit choice is made

### 4.1 Theme Implementation

The theme system is primarily managed through:

- `useDarkMode` hook in `src/utils/useDarkMode.ts`
- localStorage for persisting preferences
- CSS variables for consistent styling

```typescript
// Theme preference detection
const storedTheme = localStorage.getItem('preferredTheme');
if (storedTheme) {
  // Use stored user preference
  setIsDarkMode(storedTheme === 'dark');
} else {
  // Fall back to system preference
  const systemDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
  setIsDarkMode(systemDarkMode);
}
```

### 4.2 CSS Implementation

Themes are implemented using CSS variables and class-based switching:

```css
:root {
  /* Light theme variables */
  --bg-color: #ffffff;
  --text-color: #000000;
  /* other variables */
}

html.dark-mode {
  /* Dark theme variables */
  --bg-color: #000000;
  --text-color: #ffffff;
  /* other variables */
}
```

## 5. Authentication System

DORY implements a complete authentication system for personalizing search results and user experience.

### 5.1 Auth Flow

The authentication flow uses Google OAuth and works as follows:

1. User clicks "Sign in with Google" in the side panel
2. Side panel sends `AUTH_REQUEST` message to background script
3. Background initiates Google OAuth flow via Chrome identity API
4. Upon success, background exchanges token with backend
5. Background stores auth token and user data in `chrome.storage.local`
6. Background broadcasts `AUTH_RESULT` message to all extension contexts
7. UI components update to show authenticated state

### 5.2 Auth Service

Authentication logic is centralized in `src/services/authService.ts`:

- `checkAuth()`: Verifies authentication status, first checking local storage
- `authenticateWithGoogleIdToken()`: Handles token exchange
- `logout()`: Clears credentials and notifies components

### 5.3 Auth Persistence

Authentication state persists across browser sessions via:
- `chrome.storage.local` for storing auth tokens and user data
- Message system for synchronizing state across contexts

## 6. Communication System

DORY uses a structured message system for communication between different extension contexts.

### 6.1 Message Types

Messages are structured with types defined in `src/utils/messageSystem.ts`:

```typescript
enum MessageType {
  AUTH_REQUEST = 'AUTH_REQUEST',
  AUTH_RESULT = 'AUTH_RESULT',
  SIDEPANEL_READY = 'SIDEPANEL_READY',
  SHOW_SEARCH_OVERLAY = 'SHOW_SEARCH_OVERLAY',
  // other message types
}
```

### 6.2 Message Handling

The background script (`serviceWorker.ts`) serves as the central message router:
- Listens for messages from all contexts
- Processes requests and updates state
- Broadcasts updates to relevant components

## 7. Extension Components

### 7.1 New Tab Page

The new tab page (`src/pages/newtab`) provides:
- Main entry point for search functionality
- DORY branding and user interface
- Theme toggle for customization

### 7.2 Side Panel

The side panel (`src/pages/sidepanel`) offers:
- User authentication interface
- Account information when signed in
- Logout functionality
- Theme synchronization with other components

### 7.3 Search Overlay

The search overlay (`src/pages/spotlight` and `src/content/globalSearch.tsx`):
- Provides search functionality from any webpage
- Is triggered via keyboard shortcut (Ctrl+Shift+Space by default)
- Reuses the same search component as the new tab
- Adapts to the current page's theme

## 8. State Management

DORY uses a combination of state management approaches:

- **React Hooks**: For component-local state
- **React Query**: For API data fetching and caching
- **Chrome Storage API**: For persistent extension-wide state
- **Messaging System**: For real-time communication between contexts

### 8.1 React Query Implementation

React Query is used for efficient data fetching and cache management:

```typescript
// Example from useSemanticSearch
return useQuery({
  queryKey: ['semantic-search', query],
  queryFn: async () => {
    // API call implementation
  },
  enabled: isEnabled && query.length >= 2,
  refetchOnWindowFocus: false,
  staleTime: 5 * 60 * 1000, // 5 minutes cache
});
```

## 9. Styling Architecture

DORY implements a modular CSS approach with:

- Component-scoped CSS files
- CSS variables for theming
- Responsive designs for different contexts

### 9.1 CSS Organization

```
src/
├── components/
│   ├── NewTabSearchBar.css    # Component-specific styles
│   └── ThemeToggle.css        # Component-specific styles
├── pages/
│   ├── newtab/
│   │   └── newtab.css         # Page-specific styles
│   ├── sidepanel/
│   │   └── sidepanel.css      # Page-specific styles
│   └── spotlight/
│       └── spotlight.css      # Page-specific styles
```

## 10. Development Workflow

### 10.1 Extension Structure

The extension follows Chrome's Manifest V3 structure:
- Background service worker for persistent logic
- Content scripts for page interactions
- Extension pages (new tab, side panel)
- Static resources (icons, styles)

### 10.2 Building & Testing

The extension can be:
- Developed locally in dev mode
- Loaded as an unpacked extension in Chrome
- Tested across different contexts (new tab, side panel, overlay)

## 11. Conclusion

DORY's frontend is a sophisticated Chrome extension that provides powerful search capabilities across different contexts. Its modular architecture, shared components, and consistent theming create a cohesive user experience. The hybrid search approach offers both speed and intelligence, while the authentication system enables personalized results.

The codebase is designed for maintainability and scalability, with clear separation of concerns and reusable patterns throughout.
