/**
 * Common types used throughout the DORY extension
 */

export interface SearchResult {
  id: string;
  title: string;
  url: string;
  snippet?: string;
  timestamp?: number;
  favIconUrl?: string;
} 