// models.ts

/** Holds raw, citation-based, and “fit” markdown */
export interface MarkdownGenerationResult {
  rawMarkdown: string;
  markdownWithCitations: string;
  referencesMarkdown: string;
  fitMarkdown?: string;
  fitHtml?: string;
}

/** A simple link object */
export interface Link {
  href?: string;
  text?: string;
  title?: string;
}

/** Image or video metadata */
export interface MediaItem {
  src?: string;
  alt?: string;
  desc?: string;
  score?: number;
  type: string; // "image", "video", etc.
}

/** Aggregates images, videos, etc. */
export interface Media {
  images: MediaItem[];
  videos: MediaItem[];
  audios: MediaItem[];
}

/** Internal/external grouping */
export interface Links {
  internal: Link[];
  external: Link[];
}

/**
 * If you want a consolidated data shape after “scraping” or “cleaning”,
 * storing HTML + extracted content.
 */
export interface ScrapingResult {
  cleanedHtml: string;
  success: boolean;
  media: Media;
  links: Links;
  metadata: Record<string, any>;
}

/**
 * A single “page analysis” result. 
 * Could hold your final markdown plus optional cleaned HTML, 
 * any relevant info about the current tab.
 */
export interface PageAnalysisResult {
  url: string;              // e.g. current tab
  cleanedHtml?: string;
  markdown?: string | MarkdownGenerationResult;
  success: boolean;
  errorMessage?: string;
  // etc.
}