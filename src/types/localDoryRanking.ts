export interface PageMetadata {
  title: string;
  url: string;
}

/**
 * Registry mapping page IDs to their metadata
 */
export interface PageMetadataRegistry {
  [pageId: string]: PageMetadata;
}

/**
 * Visit data for a specific page
 */
export interface VisitData {
  timestamps: number[];
  dwellTimes: number[];
  personalScore?: number;
  lastReinforcement?: number;
}

/**
 * Collection of visit data for multiple pages
 */
export interface VisitsData {
  [pageId: string]: VisitData;
}

/**
 * Search result item structure
 */
export interface SearchResult {
  pageId: string;
  title: string;
  url: string;
  score: number;
} 