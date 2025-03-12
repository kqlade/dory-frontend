/**
 * src/services/localQuickLauncher.ts
 *
 * Implements a local "quick search" system using Dexie and the DORYNextGenHybrid ranking engine.
 * No DORYLite references remain. This version focuses solely on NextGen logic.
 */

import { getDB } from '../db/dexieDB';
import { DEBUG } from '../config';

// We use jaro-winkler for fuzzy matching
import jw from 'jaro-winkler';

// Additional math libs
import * as mathjs from 'mathjs';
import * as ss from 'simple-statistics';

/** Basic interface for a Page’s metadata */
export interface PageMetadata {
  title: string;
  url: string;
  category?: string;
  tags?: string[];
}

export interface PageMetadataRegistry {
  [pageId: string]: PageMetadata;
}

/** Dexie visits data shape */
export interface VisitsData {
  [pageId: string]: {
    timestamps: number[];
    dwellTimes?: number[];
    personalScore?: number;
    lastReinforcement?: number;
  };
}

/** A Trie node for prefix searching */
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
 * A minimal Bloom Filter implementation.
 * Used optionally in DORYNextGenHybrid to skip pages that definitely don't match a query.
 */
class BloomFilter {
  private sizeInBits: number;
  private bitArray: Uint8Array;
  private hashCount: number;

  constructor(capacity: number, errorRate: number = 0.01) {
    const ln2 = Math.log(2);
    // m = -(n * ln(p)) / (ln(2)^2)
    this.sizeInBits = Math.ceil(-(capacity * Math.log(errorRate)) / (ln2 * ln2));
    this.bitArray = new Uint8Array(Math.ceil(this.sizeInBits / 8));
    // k = (m / n) * ln(2)
    this.hashCount = Math.ceil((this.sizeInBits / capacity) * ln2);
  }

  public add(value: string): void {
    const { hashA, hashB } = this.hashTwice(value);
    for (let i = 0; i < this.hashCount; i++) {
      const combinedHash = (hashA + i * hashB) % this.sizeInBits;
      this.setBit(combinedHash);
    }
  }

  public mightContain(value: string): boolean {
    const { hashA, hashB } = this.hashTwice(value);
    for (let i = 0; i < this.hashCount; i++) {
      const combinedHash = (hashA + i * hashB) % this.sizeInBits;
      if (!this.getBit(combinedHash)) {
        return false;
      }
    }
    return true;
  }

  private setBit(bitIndex: number): void {
    const byteIndex = Math.floor(bitIndex / 8);
    const bitOffset = bitIndex % 8;
    this.bitArray[byteIndex] |= 1 << bitOffset;
  }

  private getBit(bitIndex: number): boolean {
    const byteIndex = Math.floor(bitIndex / 8);
    const bitOffset = bitIndex % 8;
    return (this.bitArray[byteIndex] & (1 << bitOffset)) !== 0;
  }

  private hashTwice(value: string): { hashA: number; hashB: number } {
    // Convert to bytes
    const strBytes = new TextEncoder().encode(value);

    // HashA => FNV-1a
    let hashA = 0x811c9dc5; // offset
    for (const b of strBytes) {
      hashA ^= b;
      hashA = (hashA * 0x01000193) >>> 0; 
    }

    // HashB => DJB2
    let hashB = 5381;
    for (const b of strBytes) {
      hashB = ((hashB << 5) + hashB) ^ b;
    }

    hashA = hashA >>> 0;
    hashB = hashB >>> 0;
    return { hashA, hashB };
  }
}

/** 
 * Helper function: Bayesian approach to estimating variance in visit intervals.
 */
function estimateVarianceIntervalsBayesian(
  timesSorted: number[],
  priorShape: number = 2.0,
  priorScale: number = 2.0
): number {
  if (timesSorted.length < 2) return 1.0;
  const diffs: number[] = [];
  for (let i = 1; i < timesSorted.length; i++) {
    diffs.push(timesSorted[i] - timesSorted[i - 1]);
  }
  if (diffs.length === 0) return 1.0;

  const sampleMean = mathjs.mean(diffs) as number;
  const sumSq = diffs.reduce((acc, val) => acc + Math.pow(val - sampleMean, 2), 0);
  const n = diffs.length;

  const posteriorShape = priorShape + n / 2.0;
  const posteriorRate = 1.0 / priorScale + 0.5 * sumSq;

  if (posteriorShape <= 1) {
    // fallback to naive variance if shape <= 1
    const naiveVar = ss.variance(diffs) || 1.0;
    return naiveVar;
  }

  // Posterior mean of variance for inverse-gamma
  const postMeanVariance = posteriorRate / (posteriorShape - 1.0);
  return postMeanVariance;
}

/**
 * Shannon entropy used in "regularity" calculations
 */
function shannonEntropy(p: number[]): number {
  const sum = p.reduce((acc, val) => acc + val, 0);
  if (sum === 0) return 0;
  const normalized = p.map(val => val / sum);
  return -normalized.reduce((entropy, p_i) => {
    if (p_i <= 0) return entropy;
    return entropy + p_i * Math.log(p_i);
  }, 0);
}

/**
 * Basic Jaro-Winkler for fuzzy matching
 */
function jaroWinklerFuzzy(s1: string, s2: string): number {
  return jw(s1, s2);
}

/**
 * Hybrid string similarity for text matching:
 * - Big boost if text starts with the query
 * - Fallback to Jaro-Winkler, with threshold of 0.7
 */
function hybridStringSimilarity(query: string, text: string): number {
  const ql = query.toLowerCase();
  const tl = text.toLowerCase();
  if (tl.startsWith(ql)) {
    const ratio = Math.min(1.0, ql.length / tl.length);
    return 0.8 + 0.2 * ratio;
  }
  const fuzzy = jaroWinklerFuzzy(ql, tl);
  if (fuzzy < 0.7) return 0.0;
  return fuzzy;
}

/**
 * DORYNextGenHybrid:
 * A next-gen local ranking approach that:
 *  - Uses prefix + fuzzy text matching
 *  - Optionally uses a Bloom Filter
 *  - Measures time decay, dwell times, frequency, Bayesian variance, shannon entropy, personal scores
 */
export class DORYNextGenHybrid {
  private pageRegistry: PageMetadataRegistry;
  private visitsData: VisitsData;
  private userId: string;
  private trie: QuickLauncherTrie;
  private bloom?: BloomFilter;
  private allPages: string[];
  private globalMeanFreq: number;
  private pageVariances: { [pageId: string]: number };
  private beta: number;
  private k: number;
  private mu: number;
  private rlLearningRate: number;
  private sessionTimeout: number;

  constructor(
    pageRegistry: PageMetadataRegistry,
    visitsData: VisitsData,
    userId: string,
    {
      useBloom = false,
      bloomCapacity = 10000,
      beta = 1.0,
      k = 0.5,
      mu = 30.0,
      rlLearningRate = 0.1,
      sessionTimeout = 30 * 60
    }: {
      useBloom?: boolean;
      bloomCapacity?: number;
      beta?: number;
      k?: number;
      mu?: number;
      rlLearningRate?: number;
      sessionTimeout?: number;
    } = {}
  ) {
    this.pageRegistry = pageRegistry;
    this.visitsData = visitsData;
    this.userId = userId;
    this.beta = beta;
    this.k = k;
    this.mu = mu;
    this.rlLearningRate = rlLearningRate;
    this.sessionTimeout = sessionTimeout;

    // Gather all page IDs for iteration
    this.allPages = Object.keys(pageRegistry);

    // Build the Trie for prefix-based searching
    this.trie = new QuickLauncherTrie();
    this.buildTrie();

    // Optionally build a Bloom filter for quick checks
    if (useBloom) {
      this.bloom = new BloomFilter(bloomCapacity, 0.01);
      this.buildBloom();
    }

    // Compute stats
    this.globalMeanFreq = this.computeGlobalMeanFrequency();
    this.pageVariances = this.computePageVariances();
    this.initializePersonalScores();
  }

  // Build the trie from all page titles
  private buildTrie(): void {
    for (let i = 0; i < this.allPages.length; i++) {
      const pageId = this.allPages[i];
      const title = (this.pageRegistry[pageId]?.title || '').toLowerCase();
      this.trie.insert(title, i);
    }
  }

  // Build the bloom filter by adding page-title prefixes
  private buildBloom(): void {
    if (!this.bloom) return;
    for (let i = 0; i < this.allPages.length; i++) {
      const pageId = this.allPages[i];
      const title = (this.pageRegistry[pageId]?.title || '').toLowerCase();
      for (let len = 1; len <= title.length; len++) {
        const prefix = title.substring(0, len);
        this.bloom.add(prefix);
      }
    }
  }

  // Average frequency across all pages
  private computeGlobalMeanFrequency(): number {
    const freqs: number[] = [];
    for (const pid in this.visitsData) {
      freqs.push(this.visitsData[pid].timestamps.length);
    }
    if (!freqs.length) return 1.0;
    return mathjs.mean(freqs) as number;
  }

  // Compute variance for each page’s visit intervals
  private computePageVariances(): { [pageId: string]: number } {
    const results: { [pageId: string]: number } = {};
    for (const pid in this.visitsData) {
      const times = this.visitsData[pid].timestamps;
      if (times.length < 2) {
        results[pid] = 1.0;
        continue;
      }
      const sorted = [...times].sort((a, b) => a - b);
      results[pid] = estimateVarianceIntervalsBayesian(sorted);
    }
    return results;
  }

  // Initialize personal scores if missing
  private initializePersonalScores(): void {
    for (const pid of Object.keys(this.visitsData)) {
      if (this.visitsData[pid].personalScore === undefined) {
        this.visitsData[pid].personalScore = 0.5;
      }
    }
  }

  // Sigmoid-based recency function
  private alphaT(t: number): number {
    return 1.0 - 1.0 / (1.0 + Math.exp(-this.k * (t - this.mu)));
  }

  // Additional weighting if the visit is in the same session window
  private sessionRecencyWeight(currentTime: number, visitTime: number): number {
    const delta = currentTime - visitTime;
    if (delta < 0) return 1.0; // future?
    if (delta <= this.sessionTimeout) {
      return 2.0;
    }
    // exponential decay for older visits
    const halfLife = 7 * 24 * 3600;
    return Math.exp(-Math.log(2) * (delta / halfLife));
  }

  // Combine time decay, dwell factor, session weighting
  private timeDecayWeight(currentTime: number, visitTime: number, sigma2v: number, dwell?: number): number {
    const delta = currentTime - visitTime;
    let result = Math.exp(-(1.0 / (2.0 * sigma2v)) * delta);
    if (dwell && dwell > 0) {
      const dwellFactor = 1.0 + (Math.atan(dwell / 30) / (Math.PI / 2)) * 0.3;
      result *= dwellFactor;
    }
    result *= this.sessionRecencyWeight(currentTime, visitTime);
    return result;
  }

  // Quick text match scoring
  private computeTextMatch(query: string, pageId: string): number {
    const meta = this.pageRegistry[pageId];
    if (!meta) return 0;
    const titleScore = hybridStringSimilarity(query, meta.title || '');
    const urlScore = hybridStringSimilarity(query, meta.url || '');
    return Math.max(titleScore, urlScore);
  }

  // Count how many visits occurred in [visitT - windowSize, visitT]
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

  // Evaluate how regularly the user visits a page (using intervals, entropy, etc.)
  private regularityFunction(pageId: string): number {
    const entry = this.visitsData[pageId];
    if (!entry || entry.timestamps.length < 2) {
      return 0.5;
    }
    const sorted = [...entry.timestamps].sort((a, b) => a - b);
    const intervals: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      intervals.push(sorted[i] - sorted[i - 1]);
    }
    if (!intervals.length) return 0.5;

    const meanInt = mathjs.mean(intervals) as number;
    const stdInt = mathjs.std(intervals, 'uncorrected') as number;
    const cv = meanInt > 0 ? stdInt / meanInt : 0;

    const sumInterval = mathjs.sum(intervals) as number;
    if (sumInterval <= 0) return 0.5;

    const p = intervals.map(x => x / sumInterval);
    const ent = shannonEntropy(p);
    const n = entry.timestamps.length;
    let normEntropyFactor = 1.0;
    if (n > 1) {
      normEntropyFactor = 1.0 + ent / Math.log(n);
    }

    const reg = (1.0 / (1.0 + cv)) * normEntropyFactor;
    if (isNaN(reg) || !isFinite(reg)) {
      return 0.5;
    }
    return reg;
  }

  // Final scoring: text match * time-based decays * frequency * regularity * personalScore
  private computeScore(pageId: string, query: string, currentTime: number): number {
    const entry = this.visitsData[pageId];
    if (!entry || !entry.timestamps.length) return 0.0;

    // Text match
    const mq = this.computeTextMatch(query, pageId);
    if (mq <= 0) return 0.0;

    // Time decay accumulation
    const sigma2v = this.pageVariances[pageId] || 1.0;
    let decaySum = 0.0;
    for (let i = 0; i < entry.timestamps.length; i++) {
      const t = entry.timestamps[i];
      const dwell = entry.dwellTimes ? entry.dwellTimes[i] : 0;
      const decayW = this.timeDecayWeight(currentTime, t, sigma2v, dwell);
      const localFreq = this.localFrequency(pageId, t);
      const freqRatio = localFreq / this.globalMeanFreq;
      const freqTerm = 1.0 + Math.log(Math.max(freqRatio, 0.1));
      decaySum += decayW * freqTerm;
    }

    const adaptiveWeight = this.alphaT(currentTime) / this.beta;
    const weightedSum = adaptiveWeight * decaySum;
    const reg = this.regularityFunction(pageId);
    const personalScore = entry.personalScore ?? 0.5;

    let score = mq * weightedSum * reg * (0.5 + personalScore);
    if (!isFinite(score)) {
      score = mq;
    }
    // minimal fallback if match is good but everything else is near 0
    if (score < 0.001 && mq > 0.5) {
      score = mq * 0.1;
    }
    return score;
  }

  /**
   * Main ranking method:
   *  1) optionally skip if bloom says “no match”
   *  2) retrieve prefix matches from Trie
   *  3) fuzzy match if needed
   *  4) compute final scores, sort descending, return top N
   */
  public rankPages(queryStr: string, maxResults: number = 5, currentTime: number = Date.now() / 1000): string[] {
    if (!queryStr.trim()) {
      return [];
    }

    // Bloom filter check => if definitely not present, skip entirely
    if (this.bloom && !this.bloom.mightContain(queryStr.toLowerCase())) {
      if (DEBUG) {
        console.log(`[DORYNextGenHybrid] Bloom says no match for "${queryStr}" => returning empty`);
      }
      return [];
    }

    // Step 1: gather prefix matches
    const prefixMatches = this.trie.getPrefixMatches(queryStr);
    const candidateIndices = new Set<number>(prefixMatches);

    // Step 2: If not enough prefix matches, do fuzzy across all pages
    if (candidateIndices.size < maxResults) {
      for (let i = 0; i < this.allPages.length; i++) {
        if (candidateIndices.has(i)) continue;
        const pid = this.allPages[i];
        const s = this.computeTextMatch(queryStr, pid);
        if (s > 0) {
          candidateIndices.add(i);
        }
      }
    }

    // Step 3: Score each candidate
    const scored: { pageId: string; score: number }[] = [];
    candidateIndices.forEach(idx => {
      const pageId = this.allPages[idx];
      const s = this.computeScore(pageId, queryStr, currentTime);
      if (s > 0) {
        scored.push({ pageId, score: s });
      }
    });

    // Step 4: sort descending
    scored.sort((a, b) => b.score - a.score);

    // Step 5: take top N
    return scored.slice(0, maxResults).map(item => item.pageId);
  }

  /**
   * Record a click => moves personalScore closer to 1
   */
  public recordClick(pageId: string): void {
    const entry = this.visitsData[pageId];
    if (!entry) return;
    const oldScore = entry.personalScore ?? 0.5;
    const newScore = oldScore + this.rlLearningRate * (1.0 - oldScore);
    entry.personalScore = Math.max(0, Math.min(1, newScore));
    // Optionally record a new timestamp
    entry.timestamps.push(Math.floor(Date.now() / 1000));
  }

  /**
   * Record an impression => moves personalScore closer to 0
   */
  public recordImpression(pageId: string): void {
    const entry = this.visitsData[pageId];
    if (!entry) return;
    const oldScore = entry.personalScore ?? 0.5;
    const newScore = oldScore + this.rlLearningRate * (0.0 - oldScore);
    entry.personalScore = Math.max(0, Math.min(1, newScore));
  }

  /**
   * Update page metadata & rebuild data structures
   */
  public updatePage(pageId: string, meta: PageMetadata): void {
    this.pageRegistry[pageId] = meta;
    this.allPages = Object.keys(this.pageRegistry);

    // Rebuild Trie
    this.trie = new QuickLauncherTrie();
    this.buildTrie();

    // Rebuild Bloom if in use
    if (this.bloom) {
      this.buildBloom();
    }
  }

  /**
   * Record a new visit (with optional dwellTime) => update stats
   */
  public recordVisit(pageId: string, visitTime: number, dwellTime?: number): void {
    if (!this.visitsData[pageId]) {
      this.visitsData[pageId] = {
        timestamps: [],
        dwellTimes: [],
        personalScore: 0.5
      };
    }
    const pageEntry = this.visitsData[pageId];
    pageEntry.timestamps.push(visitTime);

    if (!pageEntry.dwellTimes) {
      pageEntry.dwellTimes = [];
    }
    pageEntry.dwellTimes.push(dwellTime ?? 0);

    // Recompute global stats
    this.globalMeanFreq = this.computeGlobalMeanFrequency();

    // Recompute variance for this page
    const sortedTimes = [...pageEntry.timestamps].sort((a, b) => a - b);
    this.pageVariances[pageId] = estimateVarianceIntervalsBayesian(sortedTimes);
  }
}

/**
 * QuickLaunchNextGen:
 * A thin wrapper around DORYNextGenHybrid to load Dexie data, maintain a cache, and provide `search(query)` externally.
 */
class QuickLaunchNextGen {
  private dory: DORYNextGenHybrid | null = null;
  private cachedPageRegistry: PageMetadataRegistry | null = null;
  private cachedVisitsData: VisitsData | null = null;
  private lastCacheTime = 0;
  private readonly cacheTTL = 60000; // e.g. 1 minute

  constructor() {
    if (DEBUG) {
      console.log('[QuickLaunchNextGen] Service initialized');
    }
  }

  /**
   * Public search method: returns top results { pageId, title, url, score }
   */
  public async search(query: string): Promise<Array<{
    pageId: string;
    title: string;
    url: string;
    score: number;
  }>> {
    if (DEBUG) {
      console.log(`[QuickLaunchNextGen] Searching for "${query}"`);
    }
    try {
      // Make sure Dexie data is loaded and DORYNextGenHybrid is built
      await this.ensureInitialized();
      if (!this.dory || !this.cachedPageRegistry) {
        if (DEBUG) {
          console.log('[QuickLaunchNextGen] No ranking engine or page registry available');
        }
        return [];
      }

      const nowSec = Math.floor(Date.now() / 1000);
      const rankedIds = this.dory.rankPages(query, 10, nowSec);

      // Construct final return shape
      return rankedIds.map((pageId, index) => {
        const meta = this.cachedPageRegistry![pageId];
        // For demonstration, a simple approach: top result => ~1.0, last => ~0.0
        const relativeScore = (rankedIds.length - index) / rankedIds.length;
        return {
          pageId,
          title: meta.title || '',
          url: meta.url || '',
          score: relativeScore
        };
      });
    } catch (err) {
      console.error('[QuickLaunchNextGen] search error:', err);
      return [];
    }
  }

  /**
   * Ensures we have a fresh DORYNextGenHybrid instance
   */
  private async ensureInitialized(): Promise<void> {
    const now = Date.now();
    if (
      this.dory &&
      this.cachedPageRegistry &&
      this.cachedVisitsData &&
      now - this.lastCacheTime < this.cacheTTL
    ) {
      // cached
      return;
    }

    const { pageRegistry, visitsData } = await this.loadDataFromIndexedDB();
    this.cachedPageRegistry = pageRegistry;
    this.cachedVisitsData = visitsData;
    this.lastCacheTime = now;

    this.dory = new DORYNextGenHybrid(pageRegistry, visitsData, 'current-user-id', {
      useBloom: true,
      bloomCapacity: 10000,
      beta: 1.0,
      k: 0.5,
      mu: 30.0,
      rlLearningRate: 0.1,
      sessionTimeout: 1800 // 30 min
    });
    if (DEBUG) {
      console.log('[QuickLaunchNextGen] DORYNextGenHybrid initialized');
    }
  }

  /**
   * Load pages and visits from Dexie
   */
  private async loadDataFromIndexedDB(): Promise<{
    pageRegistry: PageMetadataRegistry;
    visitsData: VisitsData;
  }> {
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

        // Convert times to seconds
        const startSec = this.toSeconds(v.startTime);

        let dwell = 0;
        if (v.endTime) {
          dwell = Math.round((v.endTime - v.startTime) / 1000);
        } else if (v.totalActiveTime) {
          dwell = Math.round(v.totalActiveTime);
        }

        visitsData[pid].timestamps.push(startSec);
        visitsData[pid].dwellTimes!.push(dwell);
      }

      if (DEBUG) {
        console.log(
          `[QuickLaunchNextGen] Loaded from Dexie: pages=${Object.keys(pageRegistry).length}, visits=${Object.keys(visitsData).length}`
        );
      }
    } catch (err) {
      console.error('[QuickLaunchNextGen] Dexie load error:', err);
    }

    return { pageRegistry, visitsData };
  }

  /**
   * Helper to convert a potentially large ms-based timestamp to seconds
   */
  private toSeconds(ts: number): number {
    return ts > 10000000000 ? Math.floor(ts / 1000) : ts;
  }
}

/**
 * Finally, export a singleton instance.
 */
export const quickLaunch = new QuickLaunchNextGen();