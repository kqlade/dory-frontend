/****************************************************************************
 * HYBRID DORY Quick Launcher (No Embeddings)
 * Merges Next-Gen advanced behavioral modeling with Enhanced in-browser data
 * structures (tries, bloom filters, RL), but removes any embedding references.
 ****************************************************************************/

import * as mathjs from 'mathjs';
import * as ss from 'simple-statistics';
import jw from 'jaro-winkler';

/****************************************************************************
 * Minimal Bloom Filter Implementation
 ****************************************************************************/
class BloomFilter {
  private sizeInBits: number;         // total number of bits in the filter
  private bitArray: Uint8Array;       // bit array for marking
  private hashCount: number;          // number of hash functions used

  /**
   * @param capacity   Approximate number of items you expect to store
   * @param errorRate  Desired false positive rate (e.g., 0.01 = 1%)
   */
  constructor(capacity: number, errorRate: number = 0.01) {
    // Formula for size (bits): m = -(n * ln(p)) / (ln(2)^2)
    const ln2 = Math.log(2);
    this.sizeInBits = Math.ceil(-(capacity * Math.log(errorRate)) / (ln2 * ln2));
    this.bitArray = new Uint8Array(Math.ceil(this.sizeInBits / 8));

    // Formula for hash count: k = (m / n) * ln(2)
    this.hashCount = Math.ceil((this.sizeInBits / capacity) * ln2);
  }

  /**
   * Add a string to the bloom filter
   */
  public add(value: string): void {
    const { hashA, hashB } = this.hashTwice(value);

    for (let i = 0; i < this.hashCount; i++) {
      const combinedHash = (hashA + i * hashB) % this.sizeInBits;
      this.setBit(combinedHash);
    }
  }

  /**
   * Check if a string might be in the filter
   * (false positives are possible, false negatives are not)
   */
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

  /**
   * Private helper to set a bit in the bit array
   */
  private setBit(bitIndex: number): void {
    const byteIndex = Math.floor(bitIndex / 8);
    const bitOffset = bitIndex % 8;
    this.bitArray[byteIndex] |= 1 << bitOffset;
  }

  /**
   * Private helper to check if a bit is set
   */
  private getBit(bitIndex: number): boolean {
    const byteIndex = Math.floor(bitIndex / 8);
    const bitOffset = bitIndex % 8;
    return (this.bitArray[byteIndex] & (1 << bitOffset)) !== 0;
  }

  /**
   * Simple double-hashing approach:
   * We compute two base hashes (hashA, hashB), then combine them
   */
  private hashTwice(value: string): { hashA: number, hashB: number } {
    // Convert string to bytes in a simple manner
    const strBytes = new TextEncoder().encode(value);

    // For demonstration, let's do a basic FNV-1a for hashA
    let hashA = 0x811c9dc5; // FNV offset
    for (const b of strBytes) {
      hashA ^= b;
      hashA = (hashA * 0x01000193) >>> 0; // multiply prime, ensure 32-bit
    }

    // For hashB, let's do a basic DJB2
    let hashB = 5381;
    for (const b of strBytes) {
      hashB = ((hashB << 5) + hashB) ^ b; // hash * 33 ^ c
    }
    // Ensure both are non-negative
    hashA = hashA >>> 0;
    hashB = hashB >>> 0;

    return { hashA, hashB };
  }
}

/****************************************************************************
 * Helper Interfaces
 ****************************************************************************/
export interface PageMetadata {
  title: string;
  url: string;
  category?: string;
  tags?: string[];
}

export interface PageMetadataRegistry {
  [pageId: string]: PageMetadata;
}

export interface VisitsData {
  [pageId: string]: {
    timestamps: number[];
    dwellTimes?: number[];
    personalScore?: number;
    lastReinforcement?: number;
  };
}

/****************************************************************************
 * Trie data structure for prefix searching
 ****************************************************************************/
class TrieNode {
  children: Map<string, TrieNode> = new Map();
  pageIndices: number[] = [];
}

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

/****************************************************************************
 * Additional helper functions
 ****************************************************************************/

// Bayesian interval variance
function estimateVarianceIntervalsBayesian(
  intervals: number[],
  priorShape: number = 2.0,
  priorScale: number = 2.0
): number {
  if (intervals.length === 0) return 1.0;
  const sorted = [...intervals].sort((a, b) => a - b);
  const diffs: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    diffs.push(sorted[i] - sorted[i - 1]);
  }
  if (diffs.length === 0) return 1.0;
  const sampleMean = mathjs.mean(diffs);
  const sumSq = diffs.reduce((acc, val) => acc + Math.pow(val - sampleMean, 2), 0);
  const n = diffs.length;
  const posteriorShape = priorShape + n / 2.0;
  const posteriorRate = 1.0 / priorScale + 0.5 * sumSq;
  if (posteriorShape <= 1) {
    // Fallback: if shape <= 1, just return naive variance
    const naiveVar = ss.variance(diffs) || 1.0;
    return naiveVar;
  }
  // Posterior mean of variance for inverse-gamma
  const postMeanVariance = posteriorRate / (posteriorShape - 1.0);
  return postMeanVariance;
}

// Shannon entropy
function shannonEntropy(p: number[]): number {
  const sum = p.reduce((acc, val) => acc + val, 0);
  if (sum === 0) return 0;
  const normalized = p.map(val => val / sum);
  return -normalized.reduce((entropy, p_i) => {
    if (p_i <= 0) return entropy;
    return entropy + p_i * Math.log(p_i);
  }, 0);
}

// If you have WASM for fuzzy match, you can define:
declare function wasmFuzzyMatch(s1: string, s2: string): number; // placeholder

function jaroWinklerFuzzy(s1: string, s2: string): number {
  // Potentially call wasmFuzzyMatch(s1, s2) if available
  return jw(s1, s2);
}

// Hybrid string matching: tries prefix, else fallback to fuzzy
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

/****************************************************************************
 * Main Hybrid Next-Gen DORY class (No Embeddings)
 ****************************************************************************/

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

    // Build the list of all pages we have
    this.allPages = Object.keys(pageRegistry);

    // Build the Trie for prefix-based searching
    this.trie = new QuickLauncherTrie();
    this.buildTrie();

    // If useBloom is requested, build it
    if (useBloom) {
      // Create an actual bloom filter with the given capacity
      this.bloom = new BloomFilter(bloomCapacity, 0.01); 
      this.buildBloom();
    }

    // Compute global stats
    this.globalMeanFreq = this.computeGlobalMeanFrequency();
    this.pageVariances = this.computePageVariances();
    
    // Initialize personal scores if not present
    this.initializePersonalScores();
  }

  /**
   * Build or rebuild the Trie structure
   */
  private buildTrie(): void {
    for (let i = 0; i < this.allPages.length; i++) {
      const pageId = this.allPages[i];
      const title = (this.pageRegistry[pageId]?.title || '').toLowerCase();
      this.trie.insert(title, i);
    }
  }

  /**
   * Build or rebuild the Bloom filter
   */
  private buildBloom(): void {
    if (!this.bloom) return;

    for (let i = 0; i < this.allPages.length; i++) {
      const pageId = this.allPages[i];
      const title = (this.pageRegistry[pageId]?.title || '').toLowerCase();

      // Add all prefixes of the title to the Bloom filter
      for (let len = 1; len <= title.length; len++) {
        const prefix = title.substring(0, len);
        this.bloom.add(prefix);
      }
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
    return mathjs.mean(freqs) as number;
  }

  /**
   * Compute page-level variance stats
   */
  private computePageVariances(): { [pageId: string]: number } {
    const results: { [pageId: string]: number } = {};
    for (const pid in this.visitsData) {
      const ts = this.visitsData[pid].timestamps;
      if (ts.length < 2) {
        results[pid] = 1.0;
        continue;
      }
      const sortedTimes = [...ts].sort((a, b) => a - b);
      results[pid] = estimateVarianceIntervalsBayesian(sortedTimes);
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
   * If a user is still in a "session window," weigh the page more heavily
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
   * Time-based decay factor, including dwell factor and session factor
   */
  private timeDecayWeight(currentTime: number, visitTime: number, sigma2v: number, dwell?: number): number {
    const delta = currentTime - visitTime;
    
    // Only log if debug is enabled
    console.log(`[RANKING_DETAIL] Computing time decay weight: currentTime=${currentTime}, visitTime=${visitTime}, sigma2v=${sigma2v}, dwell=${dwell}`);
    console.log(`[RANKING_DETAIL] Time delta (seconds): ${delta}`);
    
    const lam = 1.0 / (2.0 * sigma2v);
    console.log(`[RANKING_DETAIL] Lambda parameter: ${lam}`);
    
    let result = Math.exp(-lam * delta);
    console.log(`[RANKING_DETAIL] Base decay result: ${result}`);

    if (dwell && dwell > 0) {
      // Extra factor for dwell time
      const dwellFactor = 1.0 + (Math.atan(dwell / 30) / (Math.PI / 2)) * 0.3;
      console.log(`[RANKING_DETAIL] Dwell factor: ${dwellFactor}`);
      result *= dwellFactor;
      console.log(`[RANKING_DETAIL] Result after dwell factor: ${result}`);
    }

    // Add session-based weighting
    const sessionFactor = this.sessionRecencyWeight(currentTime, visitTime);
    console.log(`[RANKING_DETAIL] Session factor: ${sessionFactor}`);
    
    result *= sessionFactor;
    console.log(`[RANKING_DETAIL] Final time decay weight: ${result}`);
    
    return result;
  }

  /**
   * Measure how regularly the user visits a page 
   */
  private regularityFunction(pageId: string): number {
    console.log(`[RANKING_DETAIL] Computing regularity for pageId=${pageId}`);
    
    const entry = this.visitsData[pageId];
    if (!entry) {
      console.log(`[RANKING_DETAIL] No visit data for pageId=${pageId}, returning default regularity=0.5`);
      return 0.5;
    }
    
    const times = entry.timestamps;
    if (times.length < 2) {
      console.log(`[RANKING_DETAIL] Not enough timestamps (${times.length}) for pageId=${pageId}, returning default regularity=0.5`);
      return 0.5;
    }
    
    console.log(`[RANKING_DETAIL] Found ${times.length} timestamps for regularity calculation`);
    const sorted = [...times].sort((a, b) => a - b);
    console.log(`[RANKING_DETAIL] Sorted timestamps: ${JSON.stringify(sorted)}`);
    
    const intervals: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      intervals.push(sorted[i] - sorted[i - 1]);
    }
    
    if (intervals.length === 0) {
      console.log(`[RANKING_DETAIL] No intervals calculated, returning default regularity=0.5`);
      return 0.5;
    }
    
    console.log(`[RANKING_DETAIL] Calculated intervals: ${JSON.stringify(intervals)}`);

    const meanInt = mathjs.mean(intervals) as number;
    console.log(`[RANKING_DETAIL] Mean interval: ${meanInt}`);
    
    const stdInt = mathjs.std(intervals, 'uncorrected') as number;
    console.log(`[RANKING_DETAIL] Standard deviation of intervals: ${stdInt}`);
    
    const cv = meanInt > 0 ? stdInt / meanInt : 0;
    console.log(`[RANKING_DETAIL] Coefficient of variation: ${cv}`);

    const sumInterval = mathjs.sum(intervals) as number;
    console.log(`[RANKING_DETAIL] Sum of intervals: ${sumInterval}`);
    
    if (sumInterval <= 0) {
      console.log(`[RANKING_DETAIL] Sum of intervals is zero or negative, returning default regularity=0.5`);
      return 0.5;
    }

    // Probability distribution across intervals
    const p = intervals.map(x => x / sumInterval);
    console.log(`[RANKING_DETAIL] Probability distribution: ${JSON.stringify(p)}`);
    
    const ent = shannonEntropy(p);
    console.log(`[RANKING_DETAIL] Shannon entropy: ${ent}`);
    
    const n = times.length;

    // Normalized entropy factor
    let normEntropyFactor = 1.0;
    if (n > 1) {
      normEntropyFactor = 1.0 + ent / Math.log(n);
      console.log(`[RANKING_DETAIL] Normalized entropy factor: ${normEntropyFactor}`);
    }
    
    const reg = (1.0 / (1.0 + cv)) * normEntropyFactor;
    console.log(`[RANKING_DETAIL] Calculated regularity: ${reg}`);
    
    if (isNaN(reg) || !isFinite(reg)) {
      console.log(`[RANKING_DETAIL] Regularity is NaN or Infinity, returning default regularity=0.5`);
      return 0.5;
    }
    
    return reg;
  }

  /**
   * Compute text match score between query and page title/URL
   */
  private computeTextMatch(query: string, pageId: string): number {
    console.log(`[RANKING_DETAIL] Computing text match for query="${query}", pageId=${pageId}`);
    
    const meta = this.pageRegistry[pageId];
    if (!meta) {
      console.log(`[RANKING_DETAIL] No metadata found for pageId=${pageId}, returning match=0`);
      return 0.0;
    }
    
    // Check title match
    const title = meta.title || '';
    console.log(`[RANKING_DETAIL] Page title for pageId=${pageId}: "${title}"`);
    const titleSimilarity = hybridStringSimilarity(query, title);
    console.log(`[RANKING_DETAIL] Title similarity between "${query}" and "${title}": ${titleSimilarity}`);
    
    // Check URL match
    const url = meta.url || '';
    console.log(`[RANKING_DETAIL] Page URL for pageId=${pageId}: "${url}"`);
    const urlSimilarity = hybridStringSimilarity(query, url);
    console.log(`[RANKING_DETAIL] URL similarity between "${query}" and "${url}": ${urlSimilarity}`);
    
    // Take the higher score of the two
    const bestScore = Math.max(titleSimilarity, urlSimilarity);
    console.log(`[RANKING_DETAIL] Best match for pageId=${pageId}: ${bestScore}`);
    return bestScore;
  }

  /**
   * Primary scoring function for a single page vs. query
   */
  private computeScore(pageId: string, queryStr: string, currentTime: number): number {
    console.log(`[RANKING_DETAIL] Computing score for pageId=${pageId}, query="${queryStr}", currentTime=${currentTime}`);
    
    const entry = this.visitsData[pageId];
    if (!entry) {
      console.log(`[RANKING_DETAIL] No visit data for pageId=${pageId}, returning score=0`);
      return 0.0;
    }

    const times = entry.timestamps || [];
    if (times.length === 0) {
      console.log(`[RANKING_DETAIL] No timestamps for pageId=${pageId}, returning score=0`);
      return 0.0;
    }
    console.log(`[RANKING_DETAIL] Found ${times.length} visits for pageId=${pageId}`);

    const mq = this.computeTextMatch(queryStr, pageId);
    console.log(`[RANKING_DETAIL] Text match score for pageId=${pageId}: ${mq}`);
    
    if (mq <= 0.0) {
      console.log(`[RANKING_DETAIL] Text match score is zero, returning score=0`);
      return 0.0;
    }

    const sigma2v = this.pageVariances[pageId] || 1.0;
    console.log(`[RANKING_DETAIL] Page variance for pageId=${pageId}: ${sigma2v}`);
    
    let decaySum = 0.0;
    for (let i = 0; i < times.length; i++) {
      const t = times[i];
      const dwell = entry.dwellTimes ? entry.dwellTimes[i] : undefined;
      const decayW = this.timeDecayWeight(currentTime, t, sigma2v, dwell);
      // localFrequency factor
      const localFreq = this.localFrequency(pageId, t);
      const freqRatio = localFreq / this.globalMeanFreq;
      // Avoid log(0) => clamp minimum to 0.1
      const freqTerm = 1.0 + Math.log(Math.max(freqRatio, 0.1));
      decaySum += decayW * freqTerm;
      
      console.log(`[RANKING_DETAIL] Visit #${i+1}: timestamp=${t}, dwell=${dwell}, decayWeight=${decayW}, localFreq=${localFreq}, freqRatio=${freqRatio}, freqTerm=${freqTerm}`);
    }
    console.log(`[RANKING_DETAIL] Total decaySum for pageId=${pageId}: ${decaySum}`);

    // alphaT might be a recency factor, dividing by beta
    const adaptiveWeight = this.alphaT(currentTime) / this.beta;
    console.log(`[RANKING_DETAIL] Adaptive weight: ${adaptiveWeight}`);
    
    const weightedSum = adaptiveWeight * decaySum;
    console.log(`[RANKING_DETAIL] Weighted sum: ${weightedSum}`);
    
    const reg = this.regularityFunction(pageId);
    console.log(`[RANKING_DETAIL] Regularity for pageId=${pageId}: ${reg}`);
    
    const personalScore = entry.personalScore !== undefined ? entry.personalScore : 0.5;
    console.log(`[RANKING_DETAIL] Personal score for pageId=${pageId}: ${personalScore}`);

    let score = mq * weightedSum * reg * (0.5 + personalScore);
    console.log(`[RANKING_DETAIL] Raw score calculation: ${mq} * ${weightedSum} * ${reg} * (0.5 + ${personalScore}) = ${score}`);
    
    if (isNaN(score) || !isFinite(score)) {
      score = mq;
      console.log(`[RANKING_DETAIL] Score was NaN or Infinity, falling back to match quality: ${mq}`);
    }
    // If everything else is tiny but we have partial fuzzy match, preserve minimal
    if (score < 0.001 && mq > 0.5) {
      score = mq * 0.1;
      console.log(`[RANKING_DETAIL] Score was too small with good match quality, boosting to: ${score}`);
    }
    
    console.log(`[RANKING_DETAIL] Final score for pageId=${pageId}: ${score}`);
    return score;
  }

  /**
   * Count how many visits occurred in [visitT - windowSize, visitT]
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
   * Rank pages for a given query
   * Returns an array of page IDs ranked by relevance
   */
  public rankPages(queryStr: string, maxResults: number = 5, currentTime: number = Date.now() / 1000): string[] {
    console.log(`[RANKING_PROCESS] Starting ranking for query="${queryStr}", maxResults=${maxResults}, currentTime=${currentTime}`);
    
    if (!queryStr || queryStr.trim() === '') {
      console.log(`[RANKING_PROCESS] Empty query, returning empty results`);
      return [];
    }

    // Optional optimization with bloom
    if (this.bloom) {
      if (!this.bloom.mightContain(queryStr.toLowerCase())) {
        console.log(`[RANKING_PROCESS] Bloom filter indicates query might not be in any page titles`);
        // If bloom says "no," we still do a fallback fuzzy across all pages
        // because Bloom can have false positives but not false negatives.
      }
    }

    // 1) Grab prefix matches from trie
    const prefixMatches = this.trie.getPrefixMatches(queryStr);
    console.log(`[RANKING_PROCESS] Found ${prefixMatches.length} prefix matches from trie`);
    
    const candidateIndices = new Set<number>(prefixMatches);
    console.log(`[RANKING_PROCESS] Initial candidate set size: ${candidateIndices.size}`);

    // 2) If not enough matches, do fuzzy across all pages
    if (candidateIndices.size < maxResults) {
      console.log(`[RANKING_PROCESS] Not enough prefix matches, performing fuzzy matching across all pages`);
      let fuzzyMatchCount = 0;
      
      for (let i = 0; i < this.allPages.length; i++) {
        if (candidateIndices.has(i)) continue;
        const pid = this.allPages[i];
        const score = this.computeTextMatch(queryStr, pid);
        if (score > 0) {
          candidateIndices.add(i);
          fuzzyMatchCount++;
        }
      }
      console.log(`[RANKING_PROCESS] Added ${fuzzyMatchCount} fuzzy matches, new candidate set size: ${candidateIndices.size}`);
    }

    // 3) Compute final scores
    console.log(`[RANKING_PROCESS] Computing final scores for ${candidateIndices.size} candidates`);
    const scored: { pageId: string; score: number }[] = [];
    candidateIndices.forEach(idx => {
      const pageId = this.allPages[idx];
      const s = this.computeScore(pageId, queryStr, currentTime);
      if (s > 0) {
        scored.push({ pageId, score: s });
        console.log(`[RANKING_PROCESS] Candidate pageId=${pageId} received score=${s}`);
      } else {
        console.log(`[RANKING_PROCESS] Candidate pageId=${pageId} received zero score, excluding from results`);
      }
    });

    // 4) Sort descending by score
    scored.sort((a, b) => b.score - a.score);
    console.log(`[RANKING_PROCESS] Sorted ${scored.length} candidates by score`);

    // 5) Return top N
    const result: string[] = [];
    for (let i = 0; i < Math.min(maxResults, scored.length); i++) {
      result.push(scored[i].pageId);
      console.log(`[RANKING_PROCESS] Final result #${i+1}: pageId=${scored[i].pageId}, score=${scored[i].score}`);
    }
    
    console.log(`[RANKING_PROCESS] Returning ${result.length} ranked results`);
    return result;
  }

  /**
   * Record a click event => positive reinforcement
   */
  public recordClick(pageId: string): void {
    const entry = this.visitsData[pageId];
    if (!entry) return;
    const oldScore = entry.personalScore || 0.5;
    const lr = this.rlLearningRate;
    const newScore = oldScore + lr * (1.0 - oldScore);
    entry.personalScore = Math.max(0, Math.min(1, newScore));
    // Also track a new timestamp for a "click" if desired
    entry.timestamps.push(Math.floor(Date.now() / 1000));
  }

  /**
   * Record an impression event => negative reinforcement
   */
  public recordImpression(pageId: string): void {
    const entry = this.visitsData[pageId];
    if (!entry) return;
    const oldScore = entry.personalScore || 0.5;
    const lr = this.rlLearningRate;
    const newScore = oldScore + lr * (0 - oldScore);
    entry.personalScore = Math.max(0, Math.min(1, newScore));
  }

  /**
   * Update (or add) a page's metadata in the registry, then rebuild the trie/bloom
   */
  public updatePage(pageId: string, meta: PageMetadata): void {
    this.pageRegistry[pageId] = meta;
    this.allPages = Object.keys(this.pageRegistry);

    // Rebuild the Trie
    this.trie = new QuickLauncherTrie();
    this.buildTrie();

    // Rebuild the bloom if it's in use
    if (this.bloom) {
      this.buildBloom();
    }
  }

  /**
   * Record a visit with optional dwellTime
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
    if (dwellTime !== undefined) {
      pageEntry.dwellTimes.push(dwellTime);
    } else {
      pageEntry.dwellTimes.push(0);
    }

    // Recompute global stats
    this.globalMeanFreq = this.computeGlobalMeanFrequency();

    const sorted = [...pageEntry.timestamps].sort((a, b) => a - b);
    this.pageVariances[pageId] = estimateVarianceIntervalsBayesian(sorted);
  }
}