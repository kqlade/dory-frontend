/**
 * localDoryRanking.ts
 *
 * A combined system that uses:
 *  1) Bayesian Markov transitions & time-of-day
 *  2) A Bayesian linear model for final re-ranking
 *  3) Enhanced text matching (BM25 + fuzzy edit distance, plus basic stemming, stopword removal)
 *
 * Works entirely locally, suitable for a Chrome extension or similar environment.
 */

import { DEBUG, RANKING_CONFIG } from '../config';
import * as mathjs from 'mathjs'; // For numeric/entropy ops as needed
import { PageRecord, VisitRecord, EdgeRecord, BrowsingSession } from '../types';
import {
  pageRepository,
  visitRepository,
  edgeRepository,
  sessionRepository,
  metadataRepository
} from '../db/repositories';

// ---------------------------------------------------------------------------------
// 1) Helpers, Stopwords, and Basic Preprocessing
// ---------------------------------------------------------------------------------
function log(...args: any[]) {
  if (DEBUG) console.log(...args);
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

function toSeconds(ts: number): number {
  return ts > 10000000000 ? Math.floor(ts / 1000) : ts;
}

/** Example minimal English stopword set. Extend as needed. */
const STOPWORDS = new Set([
  'the','is','at','of','on','and','a','an','for','to','in','that','this','it',
  'be','am','are','or','as','was','were','so','we','by','has','have','had','etc'
]);

/**
 * A naive stemmer demonstration. You can replace this with a real Porter stemmer.
 */
function naiveStem(word: string): string {
  return word
    .replace(/(ing|ed|ly|s)$/i, '')
    .toLowerCase();
}

/**
 * Preprocess text into normalized tokens:
 * 1) Lowercase
 * 2) Split on non-alphanumerics
 * 3) Remove stopwords
 * 4) Apply naive stemming
 */
function preprocessTextForIndex(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map(w => STOPWORDS.has(w) ? '' : naiveStem(w))
    .filter(Boolean);
}

/**
 * Substring/prefix bonus for quick matches:
 * +2 if query is a prefix of URL
 * +1 if query is a prefix of title
 * +1 if query is found anywhere in URL
 * +0.5 if query is found anywhere in title
 */
function computeSubstringBonus(query: string, page: PageRecord): number {
  if (!query) return 0;
  const q = query.toLowerCase();
  const url = page.url.toLowerCase();
  const title = page.title.toLowerCase();

  let bonus = 0;
  if (url.startsWith(q)) {
    bonus += RANKING_CONFIG.SUBSTRING_BONUS.URL_PREFIX;
  } else if (url.includes(q)) {
    bonus += RANKING_CONFIG.SUBSTRING_BONUS.URL_CONTAINS;
  }
  if (title.startsWith(q)) {
    bonus += RANKING_CONFIG.SUBSTRING_BONUS.TITLE_PREFIX;
  } else if (title.includes(q)) {
    bonus += RANKING_CONFIG.SUBSTRING_BONUS.TITLE_CONTAINS;
  }
  return bonus;
}

// ---------------------------------------------------------------------------------
// 2) BM25 Implementation (with Proper Inverted Index)
// ---------------------------------------------------------------------------------
interface InvertedIndexDoc {
  pageId: string;
  titleTokens: Record<string, number>;
  urlTokens: Record<string, number>;
  titleLen: number;
  urlLen: number;
}

class BM25Engine {
  private docs: InvertedIndexDoc[] = [];
  private avgTitleLen = 1;
  private avgUrlLen = 1;
  // Inverted index: token -> array of document indices
  private invertedIndex: Record<string, number[]> = {};
  // Map page IDs to document indices for faster lookup
  private pageIdToIndex: Map<string, number> = new Map();

  // BM25 parameters from config
  private k1 = RANKING_CONFIG.BM25.K1;
  private bTitle = RANKING_CONFIG.BM25.B_TITLE;
  private bUrl = RANKING_CONFIG.BM25.B_URL;
  private wTitle = RANKING_CONFIG.BM25.WEIGHT_TITLE;
  private wUrl = RANKING_CONFIG.BM25.WEIGHT_URL;

  constructor(pageRecords: PageRecord[]) {
    this.buildIndex(pageRecords);
  }

  private buildIndex(pageRecords: PageRecord[]) {
    // Clear previous index
    this.invertedIndex = {};
    this.pageIdToIndex.clear();
    
    // Build document representations
    this.docs = pageRecords.map((p, idx) => {
      const tArr = preprocessTextForIndex(p.title);
      const uArr = preprocessTextForIndex(p.url);
      
      // Update pageId to index mapping
      this.pageIdToIndex.set(p.pageId, idx);
      
      // Title tokens into frequencies
      const titleTokens = this.computeFrequency(tArr);
      // URL tokens into frequencies
      const urlTokens = this.computeFrequency(uArr);
      
      // Add each token to the inverted index
      const allTokens = new Set([...Object.keys(titleTokens), ...Object.keys(urlTokens)]);
      allTokens.forEach(token => {
        if (!this.invertedIndex[token]) {
          this.invertedIndex[token] = [];
        }
        this.invertedIndex[token].push(idx);
      });
      
      return {
        pageId: p.pageId,
        titleTokens,
        urlTokens,
        titleLen: tArr.length,
        urlLen: uArr.length
      };
    });

    // Calculate average lengths
    const N = this.docs.length || 1;
    this.avgTitleLen = this.docs.reduce((sum, d) => sum + d.titleLen, 0) / N;
    this.avgUrlLen = this.docs.reduce((sum, d) => sum + d.urlLen, 0) / N;
    
    // Deduplicate document indices in inverted index
    Object.keys(this.invertedIndex).forEach(token => {
      this.invertedIndex[token] = [...new Set(this.invertedIndex[token])];
    });
  }

  private computeFrequency(tokens: string[]): Record<string, number> {
    const freq: Record<string, number> = {};
    for (const tk of tokens) {
      freq[tk] = (freq[tk] || 0) + 1;
    }
    return freq;
  }

  public computeScores(query: string): Array<{ pageId: string; score: number }> {
    // Preprocess query
    const qTokens = preprocessTextForIndex(query);
    if (!qTokens.length) {
      return this.docs.map(d => ({ pageId: d.pageId, score: 0 }));
    }

    const N = this.docs.length;
    
    // Quick output for empty query
    if (!qTokens.length) {
      return this.docs.map(d => ({ pageId: d.pageId, score: 0 }));
    }
    
    // Find candidate documents that contain ANY of the query tokens
    const candidateDocIndices = new Set<number>();
    for (const qt of qTokens) {
      const indices = this.invertedIndex[qt] || [];
      indices.forEach(idx => candidateDocIndices.add(idx));
    }
    
    // No candidates found for any query terms
    if (candidateDocIndices.size === 0) {
      return [];
    }
    
    // Pre-calculate document frequencies and IDF values once
    const docFreq: Record<string, number> = {};
    const idf: Record<string, number> = {};
    
    for (const qt of qTokens) {
      docFreq[qt] = (this.invertedIndex[qt] || []).length;
      idf[qt] = Math.log((N - docFreq[qt] + 0.5) / (docFreq[qt] + 0.5) + 1);
    }

    // Calculate BM25 scores only for candidates
    const results: Array<{ pageId: string; score: number }> = [];
    candidateDocIndices.forEach(idx => {
      const doc = this.docs[idx];
      let score = 0;
      
      for (const qt of qTokens) {
        const freqT = doc.titleTokens[qt] || 0;
        const freqU = doc.urlTokens[qt] || 0;
        
        if (freqT === 0 && freqU === 0) continue; // Skip terms not in this doc

        const TFt = (this.wTitle * freqT * (this.k1 + 1)) /
          (freqT + this.k1 * (1 - this.bTitle + this.bTitle * (doc.titleLen / this.avgTitleLen)));

        const TFu = (this.wUrl * freqU * (this.k1 + 1)) /
          (freqU + this.k1 * (1 - this.bUrl + this.bUrl * (doc.urlLen / this.avgUrlLen)));

        score += (idf[qt] || 0) * (TFt + TFu);
      }
      
      results.push({ pageId: doc.pageId, score });
    });
    
    return results;
  }
}

// ---------------------------------------------------------------------------------
// 3) Simple Fuzzy Edit-Distance
// ---------------------------------------------------------------------------------
function editDistance(a: string, b: string): number {
  const dp: number[][] = [];
  for (let i = 0; i <= a.length; i++) {
    dp[i] = new Array(b.length + 1).fill(0);
    dp[i][0] = i;
  }
  for (let j = 0; j <= b.length; j++) {
    dp[0][j] = j;
  }

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[a.length][b.length];
}

function fuzzySimilarity(strA: string, strB: string): number {
  if (!strA || !strB) return 0;
  const maxLen = Math.max(strA.length, strB.length);
  if (!maxLen) return 0;
  const dist = editDistance(strA, strB);
  const ratio = 1 - dist / maxLen;
  return Math.max(0, ratio);
}

// ---------------------------------------------------------------------------------
// 4) EnhancedSearchProvider: BM25 + Fuzzy
// ---------------------------------------------------------------------------------
interface EnhancedSearchResult {
  page: PageRecord;
  score: number;
  matchType: 'exact' | 'approx' | 'partial' | 'none';
}

export class EnhancedSearchProvider {
  private pages: PageRecord[];
  private bm25Engine: BM25Engine;

  constructor(pages: PageRecord[]) {
    this.pages = pages;
    this.bm25Engine = new BM25Engine(this.pages);
  }

  public updatePages(pages: PageRecord[]) {
    this.pages = pages;
    this.bm25Engine = new BM25Engine(this.pages);
  }

  public search(query: string): EnhancedSearchResult[] {
    if (!query.trim()) return [];

    // First: BM25
    const bm25Scores = this.bm25Engine.computeScores(query);
    const scoreMap: Record<string, number> = {};
    for (const s of bm25Scores) {
      scoreMap[s.pageId] = s.score;
    }

    // Also do fuzzy pass on each page's title/URL
    const results: EnhancedSearchResult[] = [];
    const queryLower = query.toLowerCase();

    for (const page of this.pages) {
      const titleLower = page.title.toLowerCase();
      const urlLower   = page.url.toLowerCase();
      const bm25Val    = scoreMap[page.pageId] || 0;

      // Fuzzy similarity on title or URL
      const simTitle = fuzzySimilarity(titleLower, queryLower);
      const simUrl   = fuzzySimilarity(urlLower, queryLower);
      const fuzzySim = Math.max(simTitle, simUrl);

      // Weighted combination of BM25 + fuzzy
      const alpha = 0.7; // e.g., 70% weight to BM25, 30% to fuzzy
      const combinedScore = alpha * bm25Val + (1 - alpha) * fuzzySim;

      let matchType: 'exact' | 'approx' | 'partial' | 'none' = 'none';
      if (titleLower === queryLower || urlLower === queryLower) {
        matchType = 'exact';
      } else if (fuzzySim > 0.75) {
        matchType = 'approx';
      } else if (bm25Val > 0.5 || fuzzySim > 0.4) {
        matchType = 'partial';
      }

      results.push({
        page,
        score: combinedScore,
        matchType
      });
    }

    // Sort descending by combined text score
    results.sort((a, b) => b.score - a.score);
    return results;
  }
}

// ---------------------------------------------------------------------------------
// 5) Bayesian Markov Chain & Bayesian Time-of-Day
// ---------------------------------------------------------------------------------
interface BayesianEdgeState {
  fromPageId: string;
  toPageId: string;
  alpha: number;
  beta: number;
}

function bayesianMarkovTransitionMean(edge: BayesianEdgeState): number {
  return edge.alpha / (edge.alpha + edge.beta);
}

function buildBayesianMarkovChain(edges: EdgeRecord[]): Record<string, Record<string, BayesianEdgeState>> {
  const table: Record<string, Record<string, BayesianEdgeState>> = {};
  // Example: alpha=1 + count, beta=1
  for (const e of edges) {
    if (!table[e.fromPageId]) {
      table[e.fromPageId] = {};
    }
    table[e.fromPageId][e.toPageId] = {
      fromPageId: e.fromPageId,
      toPageId: e.toPageId,
      alpha: 1 + e.count,
      beta: 1
    };
  }
  return table;
}

function computeBayesianMarkovTransitionProb(
  table: Record<string, Record<string, BayesianEdgeState>>,
  fromPageId: string,
  toPageId: string
): number {
  const row = table[fromPageId];
  if (!row) return 0;
  const edge = row[toPageId];
  if (!edge) return 0;
  return bayesianMarkovTransitionMean(edge);
}

// Bayesian Time-of-Day: each page has 24 alpha-values; each new visit increments the alpha for that hour.
interface BayesianTimeOfDayState {
  [pageId: string]: number[]; // 24 alpha values
}

function buildBayesianTimeOfDay(visits: VisitRecord[]): BayesianTimeOfDayState {
  const hist: BayesianTimeOfDayState = {};
  for (const v of visits) {
    const hour = new Date(v.startTime).getHours();
    if (!hist[v.pageId]) {
      hist[v.pageId] = new Array(24).fill(1);
    }
    hist[v.pageId][hour] += 1;
  }
  return hist;
}

function computeBayesianTimeOfDayProb(hist: BayesianTimeOfDayState, pageId: string, hourNow: number): number {
  const arr = hist[pageId];
  if (!arr) return 0;
  const sum = arr.reduce((acc, x) => acc + x, 0);
  return sum ? arr[hourNow] / sum : 0;
}

// ---------------------------------------------------------------------------------
// 6) Multi-scale Recency, Session Features, etc.
// ---------------------------------------------------------------------------------
function multiScaleRecencyScore(
  page: PageRecord,
  visits: VisitRecord[],
  nowSec: number
): number {
  const pageVisits = visits.filter(v => v.pageId === page.pageId);
  if (!pageVisits.length) return 0;

  let shortTerm = 0;
  let mediumTerm = 0;
  let longTerm = 0;
  const log2 = Math.log(2);

  for (const pv of pageVisits) {
    const delta = nowSec - toSeconds(pv.startTime);
    if (delta < 0) continue;

    const shortDecay = Math.exp(- (log2 * delta) / RANKING_CONFIG.TIME_DECAY.SHORT_TERM);
    const medDecay   = Math.exp(- (log2 * delta) / RANKING_CONFIG.TIME_DECAY.MEDIUM_TERM);
    const longDecay  = Math.exp(- (log2 * delta) / RANKING_CONFIG.TIME_DECAY.LONG_TERM);

    const dwell = pv.totalActiveTime || 0;
    const dwellFactor = 1 + (Math.atan(dwell / 30) / (Math.PI / 2)) * 0.3;

    shortTerm  += shortDecay * dwellFactor;
    mediumTerm += medDecay  * dwellFactor;
    longTerm   += longDecay * dwellFactor;
  }

  return (
    RANKING_CONFIG.RECENCY_WEIGHTS.SHORT_TERM * shortTerm +
    RANKING_CONFIG.RECENCY_WEIGHTS.MEDIUM_TERM * mediumTerm +
    RANKING_CONFIG.RECENCY_WEIGHTS.LONG_TERM * longTerm
  );
}

interface SessionFeatures {
  recentDomains: Record<string, number>;
}

function buildSessionFeatures(
  sessionId: number | undefined,
  pages: PageRecord[],
  visits: VisitRecord[]
): SessionFeatures {
  const feats: SessionFeatures = { recentDomains: {} };
  if (sessionId === undefined) return feats;

  const sessionVisits = visits.filter(v => v.sessionId === sessionId);
  for (const sv of sessionVisits) {
    const page = pages.find(px => px.pageId === sv.pageId);
    if (page) {
      feats.recentDomains[page.domain] = (feats.recentDomains[page.domain] || 0) + 1;
    }
  }
  return feats;
}

function computeSessionContextWeight(
  page: PageRecord,
  features: SessionFeatures
): number {
  return Math.log1p(features.recentDomains[page.domain] || 0);
}

// ---------------------------------------------------------------------------------
// 7) Regularity & Shannon Entropy
// ---------------------------------------------------------------------------------
function computeRegularity(pageId: string, visits: VisitRecord[]): number {
  const pageVisits = visits.filter(v => v.pageId === pageId);
  if (pageVisits.length < 2) return 0.5;

  const sorted = [...pageVisits].sort((a, b) => a.startTime - b.startTime);
  const intervals: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    intervals.push(sorted[i].startTime - sorted[i - 1].startTime);
  }

  const meanInt = mathjs.mean(intervals) as number;
  const stdInt = mathjs.std(intervals, 'uncorrected') as number;
  const cv = meanInt > 0 ? (stdInt / meanInt) : 0;
  const ent = shannonEntropy(intervals);

  const entFactor = pageVisits.length > 1 ? (1.0 + ent / Math.log(pageVisits.length)) : 1.0;
  const r = (1 / (1 + cv)) * entFactor;
  return (isFinite(r) && !isNaN(r)) ? r : 0.5;
}

function shannonEntropy(vals: number[]): number {
  const sum = vals.reduce((a, b) => a + b, 0);
  if (sum === 0) return 0;
  const p = vals.map(x => x / sum);
  return -p.reduce((acc, x) => (x > 0 ? acc + x * Math.log(x) : acc), 0);
}

// ---------------------------------------------------------------------------------
// 8) Bayesian Linear Model (Mean + Variance for each feature weight)
// ---------------------------------------------------------------------------------
interface FeatureVector {
  textMatch: number;   // Tier-1 text score (BM25 + fuzzy)
  recency: number;
  frequency: number;
  navigation: number;
  timeOfDay: number;
  session: number;
  regularity: number;
}

class BayesianLinearModel {
  // For each feature, store a mean and variance; also for bias
  public weightMeans: FeatureVector;
  public weightVars: FeatureVector;
  public biasMean: number;
  public biasVar: number;

  private learningRate = 0.01; // or tune as needed

  constructor(initial?: Partial<FeatureVector>, bias?: number) {
    // Initialize means
    this.weightMeans = {
      textMatch:   0.1,
      recency:     0.0,
      frequency:   0.0,
      navigation:  0.0,
      timeOfDay:   0.0,
      session:     0.0,
      regularity:  0.0
    };
    this.weightVars = {
      textMatch:   1.0,
      recency:     1.0,
      frequency:   1.0,
      navigation:  1.0,
      timeOfDay:   1.0,
      session:     1.0,
      regularity:  1.0
    };
    this.biasMean = (typeof bias === 'number') ? bias : 0;
    this.biasVar = 1.0;

    if (initial) {
      Object.assign(this.weightMeans, initial);
    }
  }

  public predict(f: FeatureVector): number {
    let score = this.biasMean;
    score += this.weightMeans.textMatch   * f.textMatch;
    score += this.weightMeans.recency     * f.recency;
    score += this.weightMeans.frequency   * f.frequency;
    score += this.weightMeans.navigation  * f.navigation;
    score += this.weightMeans.timeOfDay   * f.timeOfDay;
    score += this.weightMeans.session     * f.session;
    score += this.weightMeans.regularity  * f.regularity;
    return score;
  }

  /**
   * A simplified Bayesian update: we do a gradient step plus reduce variance slightly.
   * outcome = 1 (clicked) or 0 (not clicked).
   */
  public update(f: FeatureVector, outcome: number) {
    // logistic
    const rawScore = this.predict(f);
    const prob = 1 / (1 + Math.exp(-rawScore));
    const error = outcome - prob;

    // bias
    const gradBias = error;
    const precisionBias = 1 / this.biasVar;
    this.biasMean += this.learningRate * gradBias;
    // shrink variance
    this.biasVar = 1 / (precisionBias + 0.01);

    // each weight
    (Object.keys(this.weightMeans) as (keyof FeatureVector)[]).forEach(key => {
      const grad = error * f[key];
      const currentPrecision = 1 / this.weightVars[key];

      // update mean
      this.weightMeans[key] += this.learningRate * grad;

      // shrink variance
      const newPrecision = currentPrecision + 0.01;
      this.weightVars[key] = 1 / newPrecision;

      // clamp means
      this.weightMeans[key] = Math.max(-5, Math.min(5, this.weightMeans[key]));
    });

    // clamp bias
    this.biasMean = Math.max(-3, Math.min(3, this.biasMean));
  }
}

// ---------------------------------------------------------------------------------
// 9) The AdvancedLocalRanker Class
// ---------------------------------------------------------------------------------
export class AdvancedLocalRanker {
  // Data
  private pages: PageRecord[] = [];
  private visits: VisitRecord[] = [];
  private edges: EdgeRecord[] = [];
  private sessions: BrowsingSession[] = [];

  // Tier-1 text search
  private searchProvider: EnhancedSearchProvider | null = null;

  // Bayesian Markov & Time-of-Day
  private bayesianMarkovTable: Record<string, Record<string, BayesianEdgeState>> = {};
  private bayesianTimeOfDay: BayesianTimeOfDayState = {};

  // Bayesian linear model for final re-ranking
  private model = new BayesianLinearModel();
  private lastDisplayedFeatures: Record<string, FeatureVector> = {};

  constructor() {
    if (DEBUG) {
      log('[AdvancedLocalRanker] Constructed: combined Bayesian + enhanced text matching.');
    }
  }

  public async initialize(): Promise<void> {
    await this.loadDataFromDB();
    await this.loadModelWeights();

    // Enhanced search with BM25 + fuzzy
    this.searchProvider = new EnhancedSearchProvider(this.pages);

    // Build Bayesian Markov chain & time-of-day
    this.bayesianMarkovTable = buildBayesianMarkovChain(this.edges);
    this.bayesianTimeOfDay = buildBayesianTimeOfDay(this.visits);

    if (DEBUG) {
      log(`[AdvancedLocalRanker] Initialized. Pages=${this.pages.length}, Visits=${this.visits.length}, Edges=${this.edges.length}`);
    }
  }

  public async rank(
    query: string,
    currentPageId?: string,
    now = Date.now()
  ): Promise<Array<{ pageId: string; title: string; url: string; score: number }>> {
    if (!this.searchProvider || !query.trim()) return [];
    const nowSec = toSeconds(now);

    // Tier-1: Enhanced text search
    const searchResults = this.searchProvider.search(query);
    if (searchResults.length === 0) {
      return [];
    }

    // Identify session for domain context
    let sessionId: number | undefined;
    let sessionFeatures: SessionFeatures | null = null;
    if (currentPageId) {
      const relevantVisits = this.visits
        .filter(v => v.pageId === currentPageId)
        .sort((a, b) => b.startTime - a.startTime);
      if (relevantVisits.length) {
        sessionId = relevantVisits[0].sessionId;
        sessionFeatures = buildSessionFeatures(sessionId, this.pages, this.visits);
      }
    }

    // Tier-2: Bayesian re-ranking. For each candidate, compute contextual features, then model.predict.
    const finalScores = searchResults.map(result => {
      const page = result.page;

      let textMatchScore = result.score;

      // Optional substring bonus
      textMatchScore += computeSubstringBonus(query, page);

      // Recency
      const recencyVal = multiScaleRecencyScore(page, this.visits, nowSec);
      // Frequency
      const freqVal = Math.log1p(page.visitCount) * (0.5 + page.personalScore);

      // Bayesian Markov transition
      const navVal = currentPageId
        ? computeBayesianMarkovTransitionProb(this.bayesianMarkovTable, currentPageId, page.pageId)
        : 0;

      // Bayesian time-of-day
      const hourNow = new Date(now).getHours();
      const todVal = computeBayesianTimeOfDayProb(this.bayesianTimeOfDay, page.pageId, hourNow);

      // Session
      const sessVal = sessionFeatures
        ? computeSessionContextWeight(page, sessionFeatures)
        : 0;

      // Regularity
      const regVal = computeRegularity(page.pageId, this.visits);

      const features: FeatureVector = {
        textMatch: textMatchScore,
        recency: recencyVal,
        frequency: freqVal,
        navigation: navVal,
        timeOfDay: todVal,
        session: sessVal,
        regularity: regVal
      };
      this.lastDisplayedFeatures[page.pageId] = features;

      const score = this.model.predict(features);
      return { pageId: page.pageId, title: page.title, url: page.url, score };
    });

    // Sort final scores descending
    finalScores.sort((a, b) => b.score - a.score);

    // (Optional) filter out extremely low scores
    const filtered = this.applyRelevanceFilter(finalScores, query);

    // Deduplicate by title/url
    const deduplicated: Array<{ pageId: string; title: string; url: string; score: number }> = [];
    const seenTitles = new Set<string>();
    const seenUrls = new Set<string>();

    for (const item of filtered) {
      if (!seenTitles.has(item.title) && !seenUrls.has(item.url)) {
        deduplicated.push(item);
        seenTitles.add(item.title);
        seenUrls.add(item.url);
      }
    }

    return deduplicated;
  }

  /**
   * Record a user click -> Bayesian model update with outcome=1 for clicked,
   * outcome=0 for the others displayed. Also updates personalScore.
   */
  public recordUserClick(pageId: string, displayedIds: string[]) {
    const rank = displayedIds.indexOf(pageId);
    if (rank < 0) return;
    const page = this.pages.find(p => p.pageId === pageId);
    if (!page) return;

    // Basic personalScore update
    const oldScore = page.personalScore;
    const boostFactor = rank >= 3 ? 0.15 : 0.1;
    const newScore = oldScore + boostFactor * (1 - oldScore);
    page.personalScore = clamp(newScore);
    this.updatePageInDB(page);

    // Bayesian model updates
    let updated = false;
    const clickedFeatures = this.lastDisplayedFeatures[pageId];
    if (clickedFeatures) {
      this.model.update(clickedFeatures, 1);
      updated = true;
    }
    for (const pid of displayedIds) {
      if (pid !== pageId) {
        const f = this.lastDisplayedFeatures[pid];
        if (f) {
          this.model.update(f, 0);
          updated = true;
        }
      }
    }
    if (updated) {
      this.saveModelWeights();
    }
  }

  /**
   * recordImpressions (optional). If you want to lightly penalize unclicked items.
   */
  public recordImpressions(pageIds: string[]) {
    for (const pid of pageIds) {
      const page = this.pages.find(p => p.pageId === pid);
      if (!page) continue;
      const oldScore = page.personalScore;
      const newScore = oldScore + 0.05 * (0 - oldScore);
      page.personalScore = clamp(newScore);
      this.updatePageInDB(page);
    }
  }

  public async refreshData(): Promise<void> {
    await this.loadDataFromDB();
    await this.loadModelWeights();
    if (!this.pages.length) return;

    if (this.searchProvider) {
      this.searchProvider.updatePages(this.pages);
    } else {
      this.searchProvider = new EnhancedSearchProvider(this.pages);
    }

    // Rebuild Bayesian structures
    this.bayesianMarkovTable = buildBayesianMarkovChain(this.edges);
    this.bayesianTimeOfDay = buildBayesianTimeOfDay(this.visits);

    if (DEBUG) {
      log(`[AdvancedLocalRanker] Refreshed. Pages=${this.pages.length}, Visits=${this.visits.length}, Edges=${this.edges.length}`);
      log(`Bayesian weight means: ${JSON.stringify(this.model.weightMeans, null, 2)}`);
      log(`Bayesian weight vars:  ${JSON.stringify(this.model.weightVars, null, 2)}`);
      log(`BiasMean: ${this.model.biasMean.toFixed(4)}, BiasVar: ${this.model.biasVar.toFixed(4)}`);
    }
  }

  // ---------------------------------------------------------------------------------
  // Internal load/save
  // ---------------------------------------------------------------------------------
  private async loadDataFromDB(): Promise<void> {
    try {
      const [pages, visits, edges, sessions] = await Promise.all([
        pageRepository.getAllPages(),
        visitRepository.getAllVisits(),
        edgeRepository.getAllEdges(),
        sessionRepository.getAllSessions()
      ]);
      this.pages = pages;
      this.visits = visits;
      this.edges = edges;
      this.sessions = sessions;
    } catch (err) {
      console.error('[AdvancedLocalRanker] DB load error:', err);
      this.pages = [];
      this.visits = [];
      this.edges = [];
      this.sessions = [];
    }
  }

  private async loadModelWeights() {
    try {
      // We store them under "rankingModelBayesian" or any key you like
      const record = await metadataRepository.getByKey('rankingModelBayesian');
      if (record) {
        const parsed = JSON.parse(record.value);
        this.model.biasMean = parsed.biasMean;
        this.model.biasVar  = parsed.biasVar;
        Object.assign(this.model.weightMeans, parsed.weightMeans);
        Object.assign(this.model.weightVars,  parsed.weightVars);
      }
    } catch (err) {
      console.error('[AdvancedLocalRanker] Failed to load model weights:', err);
    }
  }

  private async saveModelWeights() {
    try {
      await metadataRepository.saveValue(
        'rankingModelBayesian',
        JSON.stringify({
          biasMean: this.model.biasMean,
          biasVar:  this.model.biasVar,
          weightMeans: this.model.weightMeans,
          weightVars:  this.model.weightVars
        })
      );
    } catch (err) {
      console.error('[AdvancedLocalRanker] Failed to persist model weights:', err);
    }
  }

  private async updatePageInDB(page: PageRecord) {
    try {
      await pageRepository.updatePersonalScore(page.pageId, page.personalScore);
    } catch (err) {
      console.error('[AdvancedLocalRanker] Failed to update page in DB:', err);
    }
  }

  /**
   * Filter out extremely low scores using a logistic shape around topScore
   * (same approach as your original).
   */
  private applyRelevanceFilter<T extends { score: number }>(
    scores: T[],
    query: string
  ): T[] {
    if (!scores.length) return scores;
    const queryLength = query.split(/\s+/).filter(Boolean).length;
    const maxScore = scores[0].score;
    if (scores.length <= 2 || (queryLength === 1 && maxScore > 0.3)) {
      return scores;
    }
    const queryComplexity = Math.min(1.0, 0.3 + queryLength * 0.2);
    const midpoint = Math.max(0.1, maxScore * (0.25 - 0.05 * queryComplexity));
    const steepness = 8 + (queryComplexity * 4);

    return scores.filter(result => {
      const normalizedScore = result.score / maxScore;
      const adjustedMidpoint = maxScore < 0.3 ? midpoint * 0.5 : midpoint;
      const prob = 1 / (1 + Math.exp(-steepness * (normalizedScore - adjustedMidpoint)));
      return prob >= 0.3;
    });
  }
}

// Export a singleton if desired
export const localRanker = new AdvancedLocalRanker();