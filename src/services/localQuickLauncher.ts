/**
 * @file quickLauncher.ts
 *
 * This file implements a local "quick search" system for pages visited,
 * stored in Dexie (via `getDB()`), and uses a prefix trie + fuzzy matching
 * (Jaro-Winkler) to rank results.
 *
 * It's MV3 friendly: no references to `window`, `localStorage`, or DOM.
 */

import { getDB } from '../db/dexieDB';
import jw from 'jaro-winkler';

// Interfaces for page metadata
export interface PageMetadata {
  title: string;
  url: string;
  category?: string;
  tags?: string[];
}

export interface PageMetadataRegistry {
  [pageId: string]: PageMetadata;
}

// Interfaces for visits
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
 * A Trie node for prefix searching
 */
class TrieNode {
  children: Map<string, TrieNode> = new Map();
  pageIndices: number[] = [];
}

/**
 * Trie data structure for prefix-based title searching
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
 * Simple hybrid string similarity:
 * - If `text` starts with `query`, give a big boost.
 * - Otherwise fall back to Jaro-Winkler.
 * - Return 0 if the Jaro-Winkler score is below 0.7.
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
  if (fuzzy < 0.7) return 0.0; // threshold for matches
  return fuzzy;
}

/**
 * DORYLite class: Contains your local ranking logic, 
 * adapted from the DORYNextGenHybrid approach.
 */
class DORYLite {
  private pageRegistry: PageMetadataRegistry;
  private visitsData: VisitsData;
  private trie: QuickLauncherTrie;
  private allPages: string[];
  private globalMeanFreq: number;
  private pageVariances: { [pageId: string]: number };

  // Ranking parameters
  private readonly beta: number;
  private readonly k: number;
  private readonly mu: number;
  private readonly sessionTimeout: number; // in seconds

  constructor(
    pageRegistry: PageMetadataRegistry,
    visitsData: VisitsData,
    {
      beta = 1.0,
      k = 0.5,
      mu = 30.0,
      sessionTimeout = 1800 // 30 min in seconds
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

    // Build initial data
    this.allPages = Object.keys(pageRegistry);
    this.trie = new QuickLauncherTrie();
    this.buildTrie();
    this.globalMeanFreq = this.computeGlobalMeanFrequency();
    this.pageVariances = this.computePageVariances();
    this.initializePersonalScores();
  }

  /**
   * Build Trie from page titles for prefix searching
   */
  private buildTrie(): void {
    for (let i = 0; i < this.allPages.length; i++) {
      const pid = this.allPages[i];
      const title = (this.pageRegistry[pid]?.title || '').toLowerCase();
      this.trie.insert(title, i);
    }
  }

  /**
   * Compute global mean frequency: average number of visits across all pages
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
   * Compute an approximate variance for each page's visit intervals
   */
  private computePageVariances(): { [pageId: string]: number } {
    const results: { [pageId: string]: number } = {};
    for (const pid in this.visitsData) {
      const ts = this.visitsData[pid].timestamps;
      if (ts.length < 2) {
        results[pid] = 1.0;
        continue;
      }

      const sorted = [...ts].sort((a, b) => a - b);
      const intervals: number[] = [];
      for (let i = 1; i < sorted.length; i++) {
        intervals.push(sorted[i] - sorted[i - 1]);
      }

      if (!intervals.length) {
        results[pid] = 1.0;
        continue;
      }

      const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const variance = intervals.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / intervals.length;
      results[pid] = Math.max(variance, 1.0);
    }
    return results;
  }

  /**
   * Initialize personal scores if missing
   */
  private initializePersonalScores(): void {
    for (const pid of Object.keys(this.visitsData)) {
      if (this.visitsData[pid].personalScore === undefined) {
        this.visitsData[pid].personalScore = 0.5;
      }
    }
  }

  /**
   * Sigmoid function for recency weighting (based on `k` and `mu`).
   */
  private alphaT(t: number): number {
    return 1.0 - 1.0 / (1.0 + Math.exp(-this.k * (t - this.mu)));
  }

  /**
   * Session recency weight: double weighting if within session boundary,
   * else exponential decay with half-life of 7 days.
   */
  private sessionRecencyWeight(currentTime: number, visitTime: number): number {
    const delta = currentTime - visitTime;
    if (delta < 0) return 1.0;
    if (delta <= this.sessionTimeout) {
      // Inside session => double weight
      return 2.0;
    }
    // Past session => exponential decay
    const halfLife = 7 * 24 * 3600; // 7 days
    return Math.exp(-Math.log(2) * (delta / halfLife));
  }

  /**
   * Combine time-based decay, dwell-time factor, and session weighting
   */
  private timeDecayWeight(currentTime: number, visitTime: number, sigma2v: number, dwell?: number): number {
    const delta = currentTime - visitTime;
    // Base decay
    const lam = 1.0 / (2.0 * sigma2v);
    let result = Math.exp(-lam * delta);

    // Dwell time factor
    if (dwell && dwell > 0) {
      const dwellFactor = 1.0 + (Math.atan(dwell / 30) / (Math.PI / 2)) * 0.3;
      result *= dwellFactor;
    }

    // Session weighting
    result *= this.sessionRecencyWeight(currentTime, visitTime);
    return result;
  }

  /**
   * Count how many visits in a window prior to `visitT`
   */
  private localFrequency(pageId: string, visitT: number, windowSize = 30 * 24 * 3600): number {
    const entry = this.visitsData[pageId];
    if (!entry) return 0;
    let count = 0;
    for (const t of entry.timestamps) {
      if (t <= visitT && t >= visitT - windowSize) {
        count++;
      }
    }
    return count;
  }

  /**
   * Text match score between query and page title/URL
   */
  private computeTextMatch(query: string, pageId: string): number {
    const meta = this.pageRegistry[pageId];
    if (!meta) return 0;
    const titleSimilarity = hybridStringSimilarity(query, meta.title || '');
    const urlSimilarity = hybridStringSimilarity(query, meta.url || '');
    return Math.max(titleSimilarity, urlSimilarity);
  }

  /**
   * Main function to compute final score for a page given the query and current time (sec).
   */
  private computeScore(pageId: string, query: string, currentTime: number): number {
    const entry = this.visitsData[pageId];
    if (!entry || !entry.timestamps.length) return 0.0;

    // If we have zero text match, bail out
    const mq = this.computeTextMatch(query, pageId);
    if (mq <= 0) return 0.0;

    const sigma2v = this.pageVariances[pageId] || 1.0;

    let decaySum = 0.0;
    for (let i = 0; i < entry.timestamps.length; i++) {
      const t = entry.timestamps[i];
      const dwell = entry.dwellTimes[i];
      const decayW = this.timeDecayWeight(currentTime, t, sigma2v, dwell);

      const localFreq = this.localFrequency(pageId, t);
      const freqRatio = localFreq / this.globalMeanFreq;
      const freqTerm = 1.0 + Math.log(Math.max(freqRatio, 0.1));

      decaySum += decayW * freqTerm;
    }

    const adaptiveWeight = this.alphaT(currentTime) / this.beta;
    let weightedSum = adaptiveWeight * decaySum;

    const personalScore = entry.personalScore ?? 0.5;
    let finalScore = mq * weightedSum * (0.5 + personalScore);

    if (!isFinite(finalScore)) {
      finalScore = mq; // fallback
    }
    // Minimal fallback if good text match but extremely low final
    if (finalScore < 0.001 && mq > 0.5) {
      finalScore = mq * 0.1;
    }
    return finalScore;
  }

  /**
   * Rank pages matching the query, returning an array of pageIds sorted by descending score.
   */
  public rankPages(query: string, maxResults = 10, currentTime = Date.now() / 1000): string[] {
    if (!query.trim()) return [];

    // 1) Grab prefix matches
    const prefixMatches = this.trie.getPrefixMatches(query);
    const candidateIndices = new Set<number>(prefixMatches);

    // 2) If not enough matches, do fuzzy across all pages
    if (candidateIndices.size < maxResults) {
      for (let i = 0; i < this.allPages.length; i++) {
        if (candidateIndices.has(i)) continue;
        const pid = this.allPages[i];
        const s = this.computeTextMatch(query, pid);
        if (s > 0) {
          candidateIndices.add(i);
        }
      }
    }

    // 3) Score each candidate
    const scored: { pageId: string; score: number }[] = [];
    candidateIndices.forEach((idx) => {
      const pageId = this.allPages[idx];
      const s = this.computeScore(pageId, query, currentTime);
      if (s > 0) scored.push({ pageId, score: s });
    });

    // 4) Sort descending
    scored.sort((a, b) => b.score - a.score);

    // 5) Take top N
    return scored.slice(0, maxResults).map((item) => item.pageId);
  }
}

/**
 * QuickLaunch class: Exposes a public `search` method to get top results from Dexie.
 */
export class QuickLaunch {
  private doryRanking: DORYLite | null = null;
  private cachedPageRegistry: PageMetadataRegistry | null = null;
  private cachedVisitsData: VisitsData | null = null;
  private lastCacheTime = 0;
  private readonly cacheTTL = 60_000; // 1 minute

  constructor() {
    console.log('[QuickLaunch] Service initialized');
  }

  /**
   * Perform a local search with up to 10 results, 
   * returning { pageId, title, url, score } objects.
   */
  public async search(query: string): Promise<Array<{
    pageId: string;
    title: string;
    url: string;
    score: number;
  }>> {
    console.log(`[QuickLaunch] Searching for "${query}"`);
    try {
      await this.ensureRankingInitialized();
      if (!this.doryRanking || !this.cachedPageRegistry) {
        console.log('[QuickLaunch] No ranking data available');
        return [];
      }

      const nowSec = this.toSeconds(Date.now());
      const rankedIds = this.doryRanking.rankPages(query, 10, nowSec);

      // Build final results
      const results = rankedIds.map((pageId, index) => {
        const meta = this.cachedPageRegistry![pageId];
        const score = index === 0 ? 1 : (rankedIds.length - index) / rankedIds.length;
        return {
          pageId,
          title: meta.title || '',
          url: meta.url || '',
          score
        };
      });
      return results;
    } catch (err) {
      console.error('[QuickLaunch] search error:', err);
      return [];
    }
  }

  /**
   * Ensure the ranking system is loaded + cached.
   */
  private async ensureRankingInitialized(): Promise<void> {
    const now = Date.now();
    if (
      this.doryRanking &&
      this.cachedPageRegistry &&
      this.cachedVisitsData &&
      now - this.lastCacheTime < this.cacheTTL
    ) {
      // still fresh
      return;
    }

    // Otherwise load from Dexie
    const { pageRegistry, visitsData } = await this.loadDataFromIndexedDB();
    this.cachedPageRegistry = pageRegistry;
    this.cachedVisitsData = visitsData;
    this.lastCacheTime = now;

    // Rebuild DORYLite
    this.doryRanking = new DORYLite(pageRegistry, visitsData, {
      beta: 1.0,
      k: 0.5,
      mu: 30.0,
      sessionTimeout: 30 * 60 // 30 minutes
    });
    console.log(`[QuickLaunch] Ranking engine loaded with ${Object.keys(pageRegistry).length} pages`);
  }

  /**
   * Load pages and visits from Dexie.
   */
  private async loadDataFromIndexedDB(): Promise<{
    pageRegistry: PageMetadataRegistry;
    visitsData: VisitsData;
  }> {
    console.log('[QuickLaunch] Loading data from Dexie');
    const pageRegistry: PageMetadataRegistry = {};
    const visitsData: VisitsData = {};

    try {
      const db = await getDB();

      // Load pages
      const pages = await db.pages.toArray();
      for (const p of pages) {
        const pStr = p.pageId.toString();
        pageRegistry[pStr] = {
          title: p.title || '',
          url: p.url || ''
        };
      }

      // Load visits
      const allVisits = await db.visits.toArray();
      for (const v of allVisits) {
        if (!v.pageId) continue;
        const pid = v.pageId.toString();
        if (!visitsData[pid]) {
          visitsData[pid] = {
            timestamps: [],
            dwellTimes: [],
            personalScore: 0.5,
            lastReinforcement: 0
          };
        }

        const startSec = this.toSeconds(v.startTime);
        let dwell = 0;
        if (v.endTime) {
          dwell = Math.round((v.endTime - v.startTime) / 1000);
        } else if (v.totalActiveTime) {
          dwell = Math.round(v.totalActiveTime);
        }

        visitsData[pid].timestamps.push(startSec);
        visitsData[pid].dwellTimes.push(dwell);
      }

      console.log(
        `[QuickLaunch] Loaded pages=${Object.keys(pageRegistry).length}, visits=${Object.keys(visitsData).length}`
      );
      return { pageRegistry, visitsData };
    } catch (err) {
      console.error('[QuickLaunch] Dexie load error:', err);
      return { pageRegistry, visitsData };
    }
  }

  /**
   * Convert a millisecond timestamp to seconds (if it’s too large).
   */
  private toSeconds(ts: number): number {
    return ts > 10000000000 ? Math.floor(ts / 1000) : ts;
  }
}

// Export a singleton instance
export const quickLaunch = new QuickLaunch();