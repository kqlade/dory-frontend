/**
 * @file content.ts
 * 
 * Type definitions for content extraction and handling
 */

/**
 * Content extracted from a webpage
 */
export interface ExtractedContent {
  title: string;
  url: string;  // Normalized URL (hostname+path without protocol/query/fragments)
  markdown: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

/**
 * Content data with context information ready to be sent to the backend
 */
export interface ContentData {
  pageId: string;
  visitId: string;
  sessionId: string | null;
  url: string;  // Normalized URL (hostname+path without protocol/query/fragments)
  title: string;
  markdown: string;
  metadata?: Record<string, any>;
}
