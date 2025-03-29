import { SearchResult } from '../api/types';

export interface DoryMessageProps {
  type: 'suggestion' | 'alternative' | 'error';
  children: React.ReactNode;
}

export interface SearchResultCardProps {
  result: SearchResult;
}

export interface ExpandableSectionProps {
  title: string;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}

/**
 * Represents a search result item after potentially merging
 * data from the History API and the internal Dexie database (via AdvancedLocalRanker).
 */
export interface UnifiedLocalSearchResult {
  // Common fields - guaranteed to be present
  id: string;        // Unique ID (use pageId from Dexie, url from History)
  url: string;
  title: string;
  score: number;       // Combined or default score for ranking/display

  // Source indicator
  source: 'dexie' | 'history' | 'semantic';

  // Dexie-specific data (from AdvancedLocalRanker) - now only optional fields
  explanation?: string; // Explanation from Dexie/Semantic
  pageId?: string;      // Specifically from Dexie page record

  // History API specific data (useful for sorting fallback)
  lastVisitTime?: number; // Milliseconds since epoch
  visitCount?: number;
  typedCount?: number;
} 