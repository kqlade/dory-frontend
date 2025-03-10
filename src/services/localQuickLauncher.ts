/**
 * Quick Launcher Implementation
 * 
 * This file implements a page ranking and quick search system that works on top of
 * data already stored in IndexedDB via the browsing store. It provides a search
 * interface that ranks pages based on visit history and user behavior.
 * 
 * This implementation is a direct port of the original server-based implementation
 * but using local IndexedDB instead of MongoDB, with identical ranking algorithms.
 */

import { getDB } from './dexieDB';
import jw from 'jaro-winkler';

// Define interfaces needed for the ranking system
export interface PageMetadata {
  title: string;
  url: string;
  category?: string;
  tags?: string[];
}

export interface PageMetadataRegistry {
  [pageId: string]: PageMetadata;
}

export interface VisitData {
  timestamps: number[];
  dwellTimes: number[];
  personalScore?: number;
  lastReinforcement?: number;
}

export interface VisitsData {
  [pageId: string]: VisitData;
}

/**
 * TrieNode for prefix searching
 */
class TrieNode {
  children: Map<string, TrieNode> = new Map();
  pageIndices: number[] = [];
}

/**
 * Trie data structure for prefix searching
 */
class QuickLauncherTrie {
  root: TrieNode = new TrieNode();

  insert(name: string, pageIndex: number): void {
    let node = this.root;
    const lower = name.toLowerCase();
    for (const ch of lower) {
      if (!node.children.has(ch)) {
        node.children.set(ch, new TrieNode());
      }
      node = node.children.get(ch)!;
      node.pageIndices.push(pageIndex);
    }
  }

  getPrefixMatches(prefix: string): number[] {
    let node = this.root;
    const lower = prefix.toLowerCase();
    for (const ch of lower) {
      if (!node.children.has(ch)) {
        return [];
      }
      node = node.children.get(ch)!;
    }
    return node.pageIndices;
  }
}

/**
 * Helper function for string similarity using Jaro-Winkler
 */
function hybridStringSimilarity(query: string, text: string): number {
  const ql = query.toLowerCase();
  const tl = text.toLowerCase();
  
  // If it's a prefix match, give it a high score
  if (tl.startsWith(ql)) {
    const ratio = Math.min(1.0, ql.length / tl.length);
    return 0.8 + 0.2 * ratio;
  }
  
  // Otherwise use Jaro-Winkler for fuzzy matching
  const fuzzy = jw(ql, tl);
  if (fuzzy < 0.7) return 0.0; // Threshold for matches
  return fuzzy;
}

/**
 * Core ranking class that implements the DORYNextGenHybrid algorithm
 * but without the MongoDB integration
 */
class DORYLite {
  private pageRegistry: PageMetadataRegistry;
  private visitsData: VisitsData;
  private trie: QuickLauncherTrie;
  private allPages: string[];
  private globalMeanFreq: number;
  private pageVariances: { [pageId: string]: number };
  
  // Parameters for ranking algorithm
  private readonly beta: number = 1.0;
  private readonly k: number = 0.5;
  private readonly mu: number = 30.0;
  private readonly sessionTimeout: number = 30 * 60; // 30 minutes in seconds

  constructor(
    pageRegistry: PageMetadataRegistry,
    visitsData: VisitsData,
    {
      beta = 1.0,
      k = 0.5,
      mu = 30.0,
      sessionTimeout = 30 * 60
    }: {
      beta?: number;
      k?: number;
      mu?: number;
      sessionTimeout?: number;
    } = {}
  ) {
    this.pageRegistry = pageRegistry;
    this.visitsData = visitsData;
    this.beta = beta;
    this.k = k;
    this.mu = mu;
    this.sessionTimeout = sessionTimeout;
    
    // Build the list of all pages
    this.allPages = Object.keys(pageRegistry);
    
    // Build the Trie for prefix-based searching
    this.trie = new QuickLauncherTrie();
    this.buildTrie();
    
    // Compute global stats
    this.globalMeanFreq = this.computeGlobalMeanFrequency();
    this.pageVariances = this.computePageVariances();
    
    // Initialize personal scores if not present
    this.initializePersonalScores();
  }
  
  /**
   * Build the Trie structure
   */
  private buildTrie(): void {
    for (let i = 0; i < this.allPages.length; i++) {
      const pageId = this.allPages[i];
      const title = (this.pageRegistry[pageId]?.title || '').toLowerCase();
      this.trie.insert(title, i);
    }
  }
  
  /**
   * Compute the global mean frequency of visits across all pages
   */
  private computeGlobalMeanFrequency(): number {
    const freqs: number[] = [];
    for (const pid in this.visitsData) {
      freqs.push(this.visitsData[pid].timestamps.length);
    }
    if (freqs.length === 0) return 1.0;
    return freqs.reduce((sum, val) => sum + val, 0) / freqs.length;
  }
  
  /**
   * Compute page-level variance stats - simplified version
   */
  private computePageVariances(): { [pageId: string]: number } {
    const results: { [pageId: string]: number } = {};
    for (const pid in this.visitsData) {
      const ts = this.visitsData[pid].timestamps;
      if (ts.length < 2) {
        results[pid] = 1.0;
        continue;
      }
      
      // Calculate a simple variance
      const sortedTimes = [...ts].sort((a, b) => a - b);
      const intervals: number[] = [];
      for (let i = 1; i < sortedTimes.length; i++) {
        intervals.push(sortedTimes[i] - sortedTimes[i - 1]);
      }
      
      if (intervals.length === 0) {
        results[pid] = 1.0;
        continue;
      }
      
      // Calculate mean
      const mean = intervals.reduce((sum, val) => sum + val, 0) / intervals.length;
      
      // Calculate variance
      const variance = intervals.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / intervals.length;
      
      // Guard against zero/tiny variance
      results[pid] = Math.max(variance, 1.0);
    }
    return results;
  }
  
  /**
   * Initialize personal scores if undefined
   */
  private initializePersonalScores(): void {
    for (const pid of Object.keys(this.visitsData)) {
      if (this.visitsData[pid].personalScore === undefined) {
        this.visitsData[pid].personalScore = 0.5;
      }
    }
  }
  
  /**
   * Sigmoid-like function for recency weighting
   */
  private alphaT(t: number): number {
    return 1.0 - 1.0 / (1.0 + Math.exp(-this.k * (t - this.mu)));
  }
  
  /**
   * Session recency weight calculation
   */
  private sessionRecencyWeight(currentTime: number, visitTime: number): number {
    const delta = currentTime - visitTime;
    if (delta < 0) return 1.0;
    if (delta <= this.sessionTimeout) {
      // Within session => double weighting
      return 2.0;
    }
    // Past session boundary => exponential decay with half-life = 7 days
    const halfLife = 7 * 24 * 3600;
    return Math.exp(-Math.log(2) * (delta / halfLife));
  }
  
  /**
   * Time decay including dwell time and session factors
   */
  private timeDecayWeight(currentTime: number, visitTime: number, sigma2v: number, dwell?: number): number {
    const delta = currentTime - visitTime;
    
    // Calculate the base decay
    const lam = 1.0 / (2.0 * sigma2v);
    let result = Math.exp(-lam * delta);
    
    // Add dwell time factor
    if (dwell && dwell > 0) {
      const dwellFactor = 1.0 + (Math.atan(dwell / 30) / (Math.PI / 2)) * 0.3;
      result *= dwellFactor;
    }
    
    // Add session weighting
    const sessionFactor = this.sessionRecencyWeight(currentTime, visitTime);
    result *= sessionFactor;
    
    return result;
  }
  
  /**
   * Count how many visits occurred in a time window
   */
  private localFrequency(pageId: string, visitT: number, windowSize: number = 30 * 24 * 3600): number {
    const entry = this.visitsData[pageId];
    if (!entry) return 0;
    const ts = entry.timestamps;
    let count = 0;
    for (const t of ts) {
      if (t <= visitT && t >= visitT - windowSize) {
        count++;
      }
    }
    return count;
  }
  
  /**
   * Compute text match score between query and page title/URL
   */
  private computeTextMatch(query: string, pageId: string): number {
    const meta = this.pageRegistry[pageId];
    if (!meta) return 0.0;
    
    // Check title match
    const title = meta.title || '';
    const titleSimilarity = hybridStringSimilarity(query, title);
    
    // Check URL match
    const url = meta.url || '';
    const urlSimilarity = hybridStringSimilarity(query, url);
    
    // Take the higher score of the two
    return Math.max(titleSimilarity, urlSimilarity);
  }
  
  /**
   * Primary scoring function for a single page vs. query
   */
  private computeScore(pageId: string, queryStr: string, currentTime: number): number {
    const entry = this.visitsData[pageId];
    if (!entry || !entry.timestamps || entry.timestamps.length === 0) return 0.0;
    
    const times = entry.timestamps;
    
    // Text match component
    const mq = this.computeTextMatch(queryStr, pageId);
    if (mq <= 0.0) return 0.0;
    
    const sigma2v = this.pageVariances[pageId] || 1.0;
    
    // Calculate decay sum
    let decaySum = 0.0;
    for (let i = 0; i < times.length; i++) {
      const t = times[i];
      const dwell = entry.dwellTimes ? entry.dwellTimes[i] : undefined;
      const decayW = this.timeDecayWeight(currentTime, t, sigma2v, dwell);
      
      // Local frequency factor
      const localFreq = this.localFrequency(pageId, t);
      const freqRatio = localFreq / this.globalMeanFreq;
      const freqTerm = 1.0 + Math.log(Math.max(freqRatio, 0.1));
      
      decaySum += decayW * freqTerm;
    }
    
    // Calculate adaptive weight
    const adaptiveWeight = this.alphaT(currentTime) / this.beta;
    const weightedSum = adaptiveWeight * decaySum;
    
    // Personal score component
    const personalScore = entry.personalScore !== undefined ? entry.personalScore : 0.5;
    
    // Calculate final score
    let score = mq * weightedSum * (0.5 + personalScore);
    
    // Handle edge cases
    if (isNaN(score) || !isFinite(score)) {
      score = mq;
    }
    if (score < 0.001 && mq > 0.5) {
      score = mq * 0.1;
    }
    
    return score;
  }
  
  /**
   * Rank pages for a given query
   * Returns an array of page IDs ranked by relevance
   */
  public rankPages(queryStr: string, maxResults: number = 10, currentTime: number = Date.now() / 1000): string[] {
    if (!queryStr || queryStr.trim() === '') {
      return [];
    }
    
    // 1) Grab prefix matches from trie
    const prefixMatches = this.trie.getPrefixMatches(queryStr);
    const candidateIndices = new Set<number>(prefixMatches);
    
    // 2) If not enough matches, do fuzzy across all pages
    if (candidateIndices.size < maxResults) {
      for (let i = 0; i < this.allPages.length; i++) {
        if (candidateIndices.has(i)) continue;
        const pid = this.allPages[i];
        const score = this.computeTextMatch(queryStr, pid);
        if (score > 0) {
          candidateIndices.add(i);
        }
      }
    }
    
    // 3) Compute final scores
    const scored: { pageId: string; score: number }[] = [];
    candidateIndices.forEach(idx => {
      const pageId = this.allPages[idx];
      const s = this.computeScore(pageId, queryStr, currentTime);
      if (s > 0) {
        scored.push({ pageId, score: s });
      }
    });
    
    // 4) Sort descending by score
    scored.sort((a, b) => b.score - a.score);
    
    // 5) Return top N
    const result: string[] = [];
    for (let i = 0; i < Math.min(maxResults, scored.length); i++) {
      result.push(scored[i].pageId);
    }
    
    return result;
  }
}

/**
 * QuickLaunch class that provides search functionality on top of browsing data
 */
export class QuickLaunch {
  private doryRanking: DORYLite | null = null;
  private cachedPageRegistry: PageMetadataRegistry | null = null;
  private cachedVisitsData: VisitsData | null = null;
  private lastCacheTime: number = 0;
  private readonly cacheTTL: number = 60 * 1000; // 1 minute cache TTL

  constructor() {
    console.log('[QuickLaunch] Service initialized');
  }

  /**
   * Main search method - returns ranked results for a query.
   * This matches the old.ts implementation exactly.
   */
  public async search(query: string): Promise<{ pageId: string; title: string; url: string; score: number }[]> {
    console.log(`[QuickLaunch] Starting search for query: "${query}"`);
    
    try {
      // Ensure the ranking engine is initialized with data
      await this.ensureRankingInitialized();
      
      if (!this.doryRanking || !this.cachedPageRegistry) {
        console.log('[QuickLaunch] No ranking data found');
        return [];
      }
      
      // Ensure we have the proper timestamp (in seconds)
      const now = this.toSeconds(Date.now());
      
      // Perform the ranking - this matches exactly how old.ts calls the ranking
      const rankedPageIds = this.doryRanking.rankPages(query, 10, now);
      console.log(`[QuickLaunch] Ranked ${rankedPageIds.length} pages for query "${query}"`);
      
      // Get the page registry to lookup metadata
      const registry = this.cachedPageRegistry;
      
      // Convert to the expected result format, and normalize scores - exactly as in old.ts
      const results = rankedPageIds.map((pageId, index) => {
        const pageMetadata = registry[pageId];
        // Convert rank to a score (1.0 = first result, 0.0 = last result)
        const score = index === 0 ? 1 : (rankedPageIds.length - index) / rankedPageIds.length;
        
        return {
          pageId,
          title: pageMetadata.title || '',
          url: pageMetadata.url || '',
          score,
        };
      });
      
      return results;
    } catch (err) {
      console.error('[QuickLaunch] Search failed:', err);
      return [];
    }
  }
  
  /**
   * Ensure that the ranking engine is initialized with data
   */
  private async ensureRankingInitialized(): Promise<void> {
    // If we already have a ranker and cached data that's not expired, we're good
    const now = Date.now();
    if (this.doryRanking && this.cachedPageRegistry && this.cachedVisitsData && 
        now - this.lastCacheTime < this.cacheTTL) {
      return;
    }
    
    // Load data and initialize the ranking engine
    const { pageRegistry, visitsData } = await this.loadDataFromIndexedDB();
    
    // Cache the loaded data
    this.cachedPageRegistry = pageRegistry;
    this.cachedVisitsData = visitsData;
    this.lastCacheTime = now;
    
    // Create a new DORYLite instance with the loaded data
    this.doryRanking = new DORYLite(pageRegistry, visitsData, {
      // Configuration parameters
      beta: 1.0,
      k: 0.5,
      mu: 30.0,
      sessionTimeout: 30 * 60
    });
    
    console.log(`[QuickLaunch] Ranking engine initialized with ${Object.keys(pageRegistry).length} pages`);
  }
  
  /**
   * Load data from IndexedDB
   */
  private async loadDataFromIndexedDB(): Promise<{ pageRegistry: PageMetadataRegistry; visitsData: VisitsData }> {
    console.log('[QuickLaunch] Loading data from IndexedDB');
    
    const pageRegistry: PageMetadataRegistry = {};
    const visitsData: VisitsData = {};
    
    try {
      const db = await getDB();
      
      // Load pages
      const pageRecords = await db.pages.toArray();
      for (const page of pageRecords) {
        if (page.pageId !== undefined) {
          const pageIdStr = page.pageId.toString();
          pageRegistry[pageIdStr] = {
            title: page.title || '',
            url: page.url || ''
          };
        }
      }
      
      // Load visits
      const visits = await db.visits.toArray();
      for (const visit of visits) {
        if (visit.pageId === undefined) continue;
        
        const pageIdStr = visit.pageId.toString();
        
        // Create visit entry if it doesn't exist
        if (!visitsData[pageIdStr]) {
          visitsData[pageIdStr] = {
            timestamps: [],
            dwellTimes: [],
            personalScore: 0.5,
            lastReinforcement: 0
          };
        }
        
        // Add visit timestamp and dwell time
        const visitTime = this.toSeconds(visit.startTime);
        
        // Calculate dwell time in seconds
        let dwellTime = 0;
        if (visit.endTime) {
          dwellTime = Math.round((visit.endTime - visit.startTime) / 1000);
        } else if (visit.totalActiveTime) {
          dwellTime = Math.round(visit.totalActiveTime);
        }
        
        visitsData[pageIdStr].timestamps.push(visitTime);
        visitsData[pageIdStr].dwellTimes.push(dwellTime);
      }
      
      console.log(`[QuickLaunch] Loaded ${Object.keys(pageRegistry).length} pages and ${Object.keys(visitsData).length} visit records`);
      
      return { pageRegistry, visitsData };
    } catch (error) {
      console.error('[QuickLaunch] Error loading data from IndexedDB:', error);
      
      // Return empty data on error
      return { pageRegistry, visitsData };
    }
  }

  /**
   * Convert a timestamp to seconds if it's in milliseconds
   */
  private toSeconds(ts: number): number {
    return ts > 10000000000 ? Math.floor(ts / 1000) : ts;
  }
}

// Export a singleton instance
export const quickLaunch = new QuickLaunch();