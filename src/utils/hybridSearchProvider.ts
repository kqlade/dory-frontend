/**
 * hybridSearchProvider.ts
 * 
 * A hybrid search implementation that combines FlexSearch with direct fuzzy matching
 * for excellent typo tolerance. Provides better results than either approach alone.
 */

import * as FlexSearch from 'flexsearch';
import { PageRecord } from '../types';

// Define the FlexSearch Index type more precisely to avoid TS errors
type FlexSearchIndex = any; // Using any since FlexSearch's types are complex

// Levenshtein distance calculation for fuzzy matching
function levenshteinDistance(str1: string, str2: string): number {
  const track = Array(str2.length + 1).fill(null).map(() => 
    Array(str1.length + 1).fill(null));
  
  for (let i = 0; i <= str1.length; i++) {
    track[0][i] = i;
  }
  
  for (let j = 0; j <= str2.length; j++) {
    track[j][0] = j;
  }
  
  for (let j = 1; j <= str2.length; j++) {
    for (let i = 1; i <= str1.length; i++) {
      const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
      track[j][i] = Math.min(
        track[j][i - 1] + 1, // deletion
        track[j - 1][i] + 1, // insertion
        track[j - 1][i - 1] + indicator // substitution
      );
    }
  }
  
  return track[str2.length][str1.length];
}

// Calculate similarity as a percentage (100% = exact match)
function calculateSimilarity(str1: string, str2: string): number {
  const distance = levenshteinDistance(str1.toLowerCase(), str2.toLowerCase());
  const maxLength = Math.max(str1.length, str2.length);
  return (maxLength - distance) / maxLength * 100;
}

/**
 * Result from a hybrid search
 */
export interface SearchResultWithScore {
  page: PageRecord;
  score: number;
  matchType: 'exact' | 'fuzzy';
}

/**
 * Provider for hybrid search functionality
 */
export class HybridSearchProvider {
  private index: FlexSearchIndex;
  private pages: PageRecord[] = [];
  private fuzzyMatchThreshold: number;
  
  /**
   * Create a new HybridSearchProvider
   * 
   * @param pages - Initial pages to index
   * @param options - Configuration options
   */
  constructor(
    pages: PageRecord[] = [], 
    options: { fuzzyMatchThreshold?: number } = {}
  ) {
    this.pages = pages;
    this.fuzzyMatchThreshold = options.fuzzyMatchThreshold || 70; // Default 70% similarity
    
    // Initialize FlexSearch index with optimized settings
    this.index = new FlexSearch.Index({
      preset: "match",      // Balance between performance and matching quality
      tokenize: "forward",  // Forward tokenization works well for prefix matching
      cache: true           // Enable caching for better performance
      // threshold and depth are set via preset
    });
    
    // Index the pages
    this.indexPages(pages);
  }
  
  /**
   * Add pages to the index
   * 
   * @param pages - Pages to index
   */
  private indexPages(pages: PageRecord[]): void {
    pages.forEach(page => {
      // Index both title and URL for searching
      this.index.add(page.pageId, page.title);
      
      // Additional fields can be indexed as needed
      // Example: this.index.add(`${page.pageId}-url`, page.url);
    });
  }
  
  /**
   * Update the indexed pages
   * 
   * @param pages - New pages to index
   */
  public updatePages(pages: PageRecord[]): void {
    this.pages = pages;
    this.index = new FlexSearch.Index({
      preset: "match",
      tokenize: "forward",
      cache: true
      // threshold and depth are set via preset
    });
    this.indexPages(pages);
  }
  
  /**
   * Add a single page to the index
   * 
   * @param page - Page to add
   */
  public addPage(page: PageRecord): void {
    this.pages.push(page);
    this.index.add(page.pageId, page.title);
  }
  
  /**
   * Search for pages matching the query with typo tolerance
   * Uses a hybrid approach:
   * 1. First try with FlexSearch (fast)
   * 2. If no results, fallback to direct fuzzy matching (more thorough)
   * 
   * @param query - Search query
   * @param limit - Maximum number of results (optional)
   * @returns Array of search results with scores
   */
  public search(query: string, limit: number = 10): SearchResultWithScore[] {
    if (!query || query.trim().length === 0) {
      return [];
    }
    
    const normalizedQuery = query.trim();
    
    // Step 1: Try FlexSearch first (fast and handles most common cases)
    const flexResults = this.index.search(normalizedQuery, { limit });
    
    // If we got results from FlexSearch, return them
    if (flexResults.length > 0) {
      return flexResults.map((pageId: string) => {
        const page = this.pages.find(p => p.pageId === pageId);
        if (!page) {
          throw new Error(`Page with ID ${pageId} not found in index`);
        }
        return {
          page,
          score: 1,
          matchType: 'exact' as const
        };
      });
    }
    
    // Step 2: If no results, try direct fuzzy matching as fallback
    // This catches more challenging typos like "linknedin" -> "linkedin"
    const similarities = this.pages.map(page => ({
      page,
      similarity: Math.max(
        calculateSimilarity(normalizedQuery, page.title),
        calculateSimilarity(normalizedQuery, page.url)
      )
    }));
    
    // Sort by similarity (highest first)
    similarities.sort((a, b) => b.similarity - a.similarity);
    
    // Filter by threshold and limit
    const results = similarities
      .filter(item => item.similarity >= this.fuzzyMatchThreshold)
      .slice(0, limit)
      .map(item => ({
        page: item.page,
        score: item.similarity / 100, // Normalize to 0-1
        matchType: 'fuzzy' as const
      }));
    
    return results;
  }
  
  /**
   * Set the fuzzy match threshold
   * 
   * @param threshold - Percentage threshold (0-100)
   */
  public setFuzzyMatchThreshold(threshold: number): void {
    this.fuzzyMatchThreshold = Math.max(0, Math.min(100, threshold));
  }
} 