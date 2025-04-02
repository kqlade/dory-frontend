/**
 * @file search.ts
 * 
 * Type definitions for search functionality
 */

/**
 * Standard search result interface used across the application
 */
export interface SearchResult {
  id: string;             // Unique ID for the result
  pageId?: string;        // Optional page ID (from Dexie/internal storage)
  title: string;          // Page title
  url: string;            // URL
  score: number;          // Relevance score for ranking
  source?: string;        // Source of the result (e.g., 'history', 'dexie')
  explanation?: string;   // Optional explanation of why this result matched
  snippet?: string;       // Optional text snippet
  timestamp?: number;     // Optional timestamp
  favIconUrl?: string;    // Optional favicon URL
  searchSessionId?: string; // Optional search session ID
  isHighlighted?: boolean;  // Whether result is highlighted
  // History API specific fields
  lastVisitTime?: number; 
  visitCount?: number;   
  typedCount?: number;    
}

/**
 * Search response type
 */
export type SearchResponse = SearchResult[];
