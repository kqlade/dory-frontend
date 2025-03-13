/**
 * localDoryRanking.ts
 *
 * Demonstrates an advanced local ranking system using Dory's data.
 * 
 * Features:
 *  1. BM25 text matching (title + url)
 *  2. Multi-scale temporal weighting for recency
 *  3. Navigation context (Markov chain from edges)
 *  4. Time-of-day pattern weighting
 *  5. Session context (domain-only clustering)
 *  6. Adaptive updates (simple user-click stub)
 *  7. Online linear learning for feature weights
 */

import { getDB } from '../db/dexieDB';  // Adjust to your Dexie instance path
import { DEBUG } from '../config';
import jw from 'jaro-winkler';           // Optional for fallback fuzzy
import * as mathjs from 'mathjs';        // For advanced numeric ops if needed

// -------------------------------------------------------------------------
// 1) Data Interfaces
// -------------------------------------------------------------------------
export interface PageRecord {
  pageId: string;
  url: string;
  title: string;
  domain: string;
  firstVisit: number;
  lastVisit: number;
  visitCount: number;
  totalActiveTime: number;
  personalScore: number; // in [0..1]
  syncStatus?: 'synced' | 'pending' | 'conflict';
  updatedAt?: number;
  hasExtractedContent?: boolean;
  contentAvailability?: 'local' | 'server' | 'both' | 'none';
}

export interface VisitRecord {
  visitId: string;
  pageId: string;
  sessionId: number;
  startTime: number;
  totalActiveTime: number;
  fromPageId?: string;
  endTime?: number;
  isBackNavigation?: boolean;
}

export interface EdgeRecord {
  edgeId?: number;
  fromPageId: string;
  toPageId: string;
  sessionId: number;
  timestamp: number;
  count: number;
  firstTraversal: number;
  lastTraversal: number;
  isBackNavigation?: boolean;
}

export interface BrowsingSession {
  sessionId?: number;
  startTime: number;
  endTime?: number;
  lastActivityAt: number;
  totalActiveTime: number;
  isActive: boolean;
}

export interface DoryEvent {
  eventId: number;
  operation: string;
  sessionId: string;  // or number cast to string
  timestamp: number;
  loggedAt: number;
  data: any; // object
}

// -------------------------------------------------------------------------
// 2) Helper functions
// -------------------------------------------------------------------------
function log(...args: any[]) {
  if (DEBUG) console.log(...args);
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function toSeconds(ts: number): number {
  // Convert ms -> s if needed
  return ts > 10000000000 ? Math.floor(ts / 1000) : ts;
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

function computeFrequency(tokens: string[]): Record<string, number> {
  const freq: Record<string, number> = {};
  for (const tk of tokens) {
    freq[tk] = (freq[tk] || 0) + 1;
  }
  return freq;
}

// -------------------------------------------------------------------------
// 3) BM25 for Title + URL
// -------------------------------------------------------------------------
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

  // BM25 parameters
  private k1 = 1.2;
  private bTitle = 0.75;
  private bUrl = 0.75;
  private wTitle = 1.0;
  private wUrl = 1.0;

  constructor(
    pageRecords: PageRecord[],
    {
      k1 = 1.2,
      bTitle = 0.75,
      bUrl = 0.75,
      wTitle = 1.0,
      wUrl = 1.0
    }: Partial<{
      k1: number;
      bTitle: number;
      bUrl: number;
      wTitle: number;
      wUrl: number;
    }> = {}
  ) {
    this.k1 = k1;
    this.bTitle = bTitle;
    this.bUrl = bUrl;
    this.wTitle = wTitle;
    this.wUrl = wUrl;

    this.buildIndex(pageRecords);
  }

  private buildIndex(pageRecords: PageRecord[]) {
    this.docs = pageRecords.map((p) => {
      const tArr = tokenize(p.title);
      const uArr = tokenize(p.url);

      return {
        pageId: p.pageId,
        titleTokens: computeFrequency(tArr),
        urlTokens: computeFrequency(uArr),
        titleLen: tArr.length,
        urlLen: uArr.length
      };
    });

    const N = this.docs.length || 1;
    this.avgTitleLen = this.docs.reduce((sum, d) => sum + d.titleLen, 0) / N;
    this.avgUrlLen = this.docs.reduce((sum, d) => sum + d.urlLen, 0) / N;
  }

  public computeScores(query: string): Array<{ pageId: string; score: number }> {
    const qTokens = tokenize(query);
    log(`Query tokens: [${qTokens.join(', ')}]`);
    
    if (!qTokens.length) {
      log(`No valid tokens in query`);
      return this.docs.map(d => ({ pageId: d.pageId, score: 0 }));
    }

    const N = this.docs.length;
    log(`Total documents in index: ${N}`);
    
    // Document frequency
    const docFreq: Record<string, number> = {};
    for (const qt of qTokens) {
      docFreq[qt] = 0;
      for (const d of this.docs) {
        if (qt in d.titleTokens || qt in d.urlTokens) {
          docFreq[qt]++;
        }
      }
    }
    
    log(`Document frequency for tokens:`);
    for (const qt of qTokens) {
      log(`  "${qt}": ${docFreq[qt]} docs`);
    }

    // IDF
    const idf: Record<string, number> = {};
    for (const qt of qTokens) {
      const df = docFreq[qt] || 0;
      idf[qt] = Math.log((N - df + 0.5) / (df + 0.5) + 1);
      log(`IDF["${qt}"] = ${idf[qt].toFixed(4)}`);
    }

    log(`Computing BM25 scores (k1=${this.k1}, bTitle=${this.bTitle}, bUrl=${this.bUrl}, wTitle=${this.wTitle}, wUrl=${this.wUrl})`);
    log(`Avg title length: ${this.avgTitleLen.toFixed(2)}, Avg URL length: ${this.avgUrlLen.toFixed(2)}`);
    
    const results: Array<{ pageId: string; score: number }> = [];
    for (const doc of this.docs) {
      let score = 0;
      for (const qt of qTokens) {
        const freqT = doc.titleTokens[qt] || 0;
        const freqU = doc.urlTokens[qt] || 0;

        const TFt = (this.wTitle * freqT * (this.k1 + 1)) /
          (freqT + this.k1 * (1 - this.bTitle + this.bTitle * (doc.titleLen / this.avgTitleLen)));

        const TFu = (this.wUrl * freqU * (this.k1 + 1)) /
          (freqU + this.k1 * (1 - this.bUrl + this.bUrl * (doc.urlLen / this.avgUrlLen)));

        score += (idf[qt] || 0) * (TFt + TFu);
      }
      results.push({ pageId: doc.pageId, score });
    }
    return results;
  }
}

// -------------------------------------------------------------------------
// 4) Navigation Context (Markov Chain) & Time-of-Day Patterns
// -------------------------------------------------------------------------
interface MarkovTable {
  [fromPageId: string]: {
    [toPageId: string]: number; // frequency
  };
}

function buildMarkovChain(edges: EdgeRecord[]): MarkovTable {
  const table: MarkovTable = {};
  for (const e of edges) {
    if (!table[e.fromPageId]) table[e.fromPageId] = {};
    table[e.fromPageId][e.toPageId] = (table[e.fromPageId][e.toPageId] || 0) + e.count;
  }
  return table;
}

function computeMarkovTransitionProb(
  table: MarkovTable,
  fromPageId: string,
  toPageId: string
): number {
  if (!table[fromPageId]) return 0;
  const total = Object.values(table[fromPageId]).reduce((acc, c) => acc + c, 0) || 1;
  const freq = table[fromPageId][toPageId] || 0;
  return freq / total;
}

interface TimeOfDayHistogram {
  [pageId: string]: number[]; // 24 bins
}

function buildTimeOfDayHistogram(visits: VisitRecord[]): TimeOfDayHistogram {
  const hist: TimeOfDayHistogram = {};
  for (const v of visits) {
    const hour = new Date(v.startTime).getHours(); // 0..23
    if (!hist[v.pageId]) hist[v.pageId] = new Array(24).fill(0);
    hist[v.pageId][hour]++;
  }
  return hist;
}

function computeTimeOfDayProb(hist: TimeOfDayHistogram, pageId: string, hourNow: number): number {
  const arr = hist[pageId];
  if (!arr) return 0;
  const sum = arr.reduce((acc, x) => acc + x, 0);
  return sum ? arr[hourNow] / sum : 0;
}

// -------------------------------------------------------------------------
// 5) Multi-Scale Recency
// -------------------------------------------------------------------------
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

    // Exponential decays
    const shortDecay = Math.exp(- (log2 * delta) / 7200);    // ~2 hrs half-life
    const medDecay   = Math.exp(- (log2 * delta) / 86400);   // ~1 day half-life
    const longDecay  = Math.exp(- (log2 * delta) / 604800);  // ~7 days half-life

    // Dwell-based boost
    const dwell = pv.totalActiveTime || 0;
    const dwellFactor = 1 + (Math.atan(dwell / 30) / (Math.PI / 2)) * 0.3;

    shortTerm  += shortDecay * dwellFactor;
    mediumTerm += medDecay  * dwellFactor;
    longTerm   += longDecay * dwellFactor;
  }
  return shortTerm + 0.5 * mediumTerm + 0.2 * longTerm;
}

// -------------------------------------------------------------------------
// 6) Session Context: Domain Clustering
// -------------------------------------------------------------------------
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

// -------------------------------------------------------------------------
// Feature Vector for Online Learning
// -------------------------------------------------------------------------
interface FeatureVector {
  textMatch: number;
  recency: number;
  frequency: number;
  navigation: number;
  timeOfDay: number;
  session: number;
  regularity: number;
}

/**
 * Online Linear Model for learning ranking weights
 */
class OnlineLinearModel {
  // Weights for each feature (initialized with small random values)
  public weights: FeatureVector;

  // Bias term to shift scores
  public bias = 0;

  // Learning rate controls step size for updates
  private learningRate = 0.01;

  constructor(initial?: Partial<FeatureVector>, bias?: number) {
    // Initialize with small random values by default
    this.weights = {
      textMatch: this.randomInit(),
      recency: this.randomInit(),
      frequency: this.randomInit(),
      navigation: this.randomInit(),
      timeOfDay: this.randomInit(),
      session: this.randomInit(),
      regularity: this.randomInit(),
    };
    
    // Override with any provided initial weights
    if (initial) {
      Object.assign(this.weights, initial);
    }
    
    if (typeof bias === 'number') {
      this.bias = bias;
    }
  }
  
  /**
   * Generate a small random value for weight initialization
   * @returns Random value in range [-0.05, 0.05]
   */
  private randomInit(): number {
    // Uniform distribution in [-0.05, 0.05]
    return (Math.random() - 0.5) * 0.1;
  }

  /**
   * Compute the weighted score for a feature vector
   */
  public predict(f: FeatureVector): number {
    return (
      this.bias +
      this.weights.textMatch   * f.textMatch   +
      this.weights.recency     * f.recency     +
      this.weights.frequency   * f.frequency   +
      this.weights.navigation  * f.navigation  +
      this.weights.timeOfDay   * f.timeOfDay   +
      this.weights.session     * f.session     +
      this.weights.regularity  * f.regularity
    );
  }

  /**
   * Update the model based on user feedback
   * @param f Feature vector
   * @param outcome 1 for click, 0 for skip
   */
  public update(f: FeatureVector, outcome: number) {
    const rawScore = this.predict(f);
    const prob = 1 / (1 + Math.exp(-rawScore));  // logistic (sigmoid)
    const error = outcome - prob;                // difference from target

    // Update bias
    this.bias += this.learningRate * error;
    
    // Update feature weights with L2 regularization (weight decay)
    const regularizationRate = 0.0001; // L2 regularization strength
    
    this.weights.textMatch   += this.learningRate * (error * f.textMatch   - regularizationRate * this.weights.textMatch);
    this.weights.recency     += this.learningRate * (error * f.recency     - regularizationRate * this.weights.recency);
    this.weights.frequency   += this.learningRate * (error * f.frequency   - regularizationRate * this.weights.frequency);
    this.weights.navigation  += this.learningRate * (error * f.navigation  - regularizationRate * this.weights.navigation);
    this.weights.timeOfDay   += this.learningRate * (error * f.timeOfDay   - regularizationRate * this.weights.timeOfDay);
    this.weights.session     += this.learningRate * (error * f.session     - regularizationRate * this.weights.session);
    this.weights.regularity  += this.learningRate * (error * f.regularity  - regularizationRate * this.weights.regularity);
    
    // Ensure weight bounds (optional, prevents extreme values)
    this.constrainWeights();
  }
  
  /**
   * Prevent weights from becoming too extreme
   */
  private constrainWeights() {
    const maxWeight = 5.0;
    const minWeight = -1.0;
    
    this.weights.textMatch   = Math.max(minWeight, Math.min(maxWeight, this.weights.textMatch));
    this.weights.recency     = Math.max(minWeight, Math.min(maxWeight, this.weights.recency));
    this.weights.frequency   = Math.max(minWeight, Math.min(maxWeight, this.weights.frequency));
    this.weights.navigation  = Math.max(minWeight, Math.min(maxWeight, this.weights.navigation));
    this.weights.timeOfDay   = Math.max(minWeight, Math.min(maxWeight, this.weights.timeOfDay));
    this.weights.session     = Math.max(minWeight, Math.min(maxWeight, this.weights.session));
    this.weights.regularity  = Math.max(minWeight, Math.min(maxWeight, this.weights.regularity));
    
    // Also constrain bias
    this.bias = Math.max(-3.0, Math.min(3.0, this.bias));
  }
}

// -------------------------------------------------------------------------
// 7) The AdvancedLocalRanker
// -------------------------------------------------------------------------
export class AdvancedLocalRanker {
  private pages: PageRecord[] = [];
  private visits: VisitRecord[] = [];
  private edges: EdgeRecord[] = [];
  private sessions: BrowsingSession[] = [];

  private bm25: BM25Engine | null = null;
  private markovTable: MarkovTable = {};
  private timeOfDayHist: TimeOfDayHistogram = {};

  // Online learning model
  private model = new OnlineLinearModel();
  
  // Store features for each displayed result to enable learning
  private lastDisplayedFeatures: Record<string, FeatureVector> = {};

  constructor() {
    if (DEBUG) {
      log('[AdvancedLocalRanker] Constructed (no category, no tags).');
    }
  }

  public async initialize(): Promise<void> {
    await this.loadDataFromDB();
    await this.loadModelWeights();

    // BM25
    this.bm25 = new BM25Engine(this.pages);

    // Markov chain
    this.markovTable = buildMarkovChain(this.edges);

    // Time-of-day histogram
    this.timeOfDayHist = buildTimeOfDayHistogram(this.visits);

    if (DEBUG) {
      log(
        `[AdvancedLocalRanker] Initialized. Pages=${this.pages.length},` + 
        ` Visits=${this.visits.length}, Edges=${this.edges.length}`
      );
    }
  }

  public async rank(
    query: string,
    currentPageId?: string,
    now = Date.now()
  ): Promise<Array<{ pageId: string; title: string; url: string; score: number }>> {
    log(`\n=== RANKING CALCULATION FOR QUERY: "${query}" ===`);
    log(`Current page ID: ${currentPageId || 'None'}, Timestamp: ${new Date(now).toISOString()}`);

    if (!this.bm25) return [];
    const nowSec = toSeconds(now);

    // 1) BM25 text
    log(`\n[1. TEXT MATCHING] Computing BM25 text match scores...`);
    let results = this.bm25.computeScores(query);
    results.sort((a, b) => b.score - a.score);
    log(`Found ${results.length} candidate pages`);

    // 2) Fallback fuzzy if all 0 & query is decently long
    const allZero = results.every(d => d.score === 0);
    if (allZero && query.length > 2) {
      log(`\n[FALLBACK] No BM25 matches, using fuzzy fallback...`);
      results = this.fuzzyFallback(query);
      results.sort((a, b) => b.score - a.score);
      log(`Fuzzy fallback found ${results.length} candidates`);
    }

    // 3) Build session context if we have currentPageId => find session
    let sessionId = -1;
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

    // 4) Compute final scores
    log(`\n[2. FACTOR CALCULATION] Computing ranking factors...`);
    const finalScores: Array<{ pageId: string; title: string; url: string; score: number }> = [];
    
    // Clear previous features to store new ones
    this.lastDisplayedFeatures = {};
    
    for (const doc of results) {
      const p = this.pages.find(px => px.pageId === doc.pageId);
      if (!p) continue;

      // Calculate all the individual features
      const textMatchScore = doc.score;
      const recencyVal = multiScaleRecencyScore(p, this.visits, nowSec);
      const freqFactor = Math.log1p(p.visitCount) * (0.5 + p.personalScore);

      let navContextVal = 0;
      if (currentPageId) {
        navContextVal = computeMarkovTransitionProb(
          this.markovTable,
          currentPageId,
          p.pageId
        );
      }

      const hourNow = new Date(now).getHours();
      const todVal = computeTimeOfDayProb(this.timeOfDayHist, p.pageId, hourNow);

      let sessVal = 0;
      if (sessionFeatures) {
        sessVal = computeSessionContextWeight(p, sessionFeatures);
      }

      const regularityFactor = this.computeRegularity(p.pageId);

      // Create feature vector
      const features: FeatureVector = {
        textMatch: textMatchScore,
        recency: recencyVal,
        frequency: freqFactor,
        navigation: navContextVal,
        timeOfDay: todVal,
        session: sessVal,
        regularity: regularityFactor
      };
      
      // Store features for learning
      this.lastDisplayedFeatures[p.pageId] = features;

      // Calculate total score using model
      const total = this.model.predict(features);

      finalScores.push({ 
        pageId: p.pageId, 
        title: p.title || '',
        url: p.url || '',
        score: total 
      });
    }

    finalScores.sort((a, b) => b.score - a.score);

    // 5) Smooth relevance filter
    const filteredScores = this.applyRelevanceFilter(finalScores, query);

    log(`\n[3. FINAL RESULTS] Sorted ${filteredScores.length} results (filtered from ${finalScores.length}).`);
    log(`=== END OF RANKING CALCULATION ===\n`);
    return filteredScores;
  }

  public recordUserClick(pageId: string, displayedIds: string[]) {
    const rank = displayedIds.indexOf(pageId);
    if (rank < 0) return;
    
    const page = this.pages.find(p => p.pageId === pageId);
    if (!page) return;
    
    // Positive reinforcement with diminishing returns
    const oldScore = page.personalScore;
    // Higher boost for deeper results
    const boostFactor = rank >= 3 ? 0.15 : 0.1; 
    const newScore = oldScore + boostFactor * (1 - oldScore);
    
    page.personalScore = clamp(newScore);

    if (DEBUG) {
      log(
        `[REINFORCE] Click pageId=${pageId}, rank=${rank}, ` + 
        `score: ${oldScore.toFixed(2)} -> ${page.personalScore.toFixed(2)}`
      );
    }
    this.updatePageInDB(page);
    
    // Update the model with click feedback
    this.updateModelFromClick(pageId, displayedIds);
  }
  
  public recordImpressions(pageIds: string[]) {
    // Negative reinforcement for unclicked items
    for (const pageId of pageIds) {
      const page = this.pages.find(p => p.pageId === pageId);
      if (!page) continue;

      const oldScore = page.personalScore;
      const newScore = oldScore + 0.05 * (0 - oldScore);
      page.personalScore = clamp(newScore);

      if (DEBUG) {
        log(
          `[REINFORCE] Impression pageId=${pageId}, ` +
          `score: ${oldScore.toFixed(2)} -> ${page.personalScore.toFixed(2)}`
        );
      }
      this.updatePageInDB(page);
    }
    
    // For impressions, we don't update the model
    // since there's no clear user signal on what was preferred
  }

  public async refreshData(): Promise<void> {
    await this.loadDataFromDB();
    await this.loadModelWeights();
    if (!this.pages.length) return;

    this.bm25 = new BM25Engine(this.pages);
    this.markovTable = buildMarkovChain(this.edges);
    this.timeOfDayHist = buildTimeOfDayHistogram(this.visits);

    if (DEBUG) {
      log(
        `[AdvancedLocalRanker] Refreshed. Pages=${this.pages.length},` + 
        ` Visits=${this.visits.length}, Edges=${this.edges.length},` +
        ` Model weights loaded`
      );
      
      // Debug log the current model weights
      log(`Model weights: ${JSON.stringify(this.model.weights, null, 2)}`);
      log(`Model bias: ${this.model.bias.toFixed(4)}`);
    }
  }

  // -----------------------------------------------------------------------
  // Private / Helper Methods
  // -----------------------------------------------------------------------
  private async saveModelWeights() {
    try {
      const db = await getDB();
      await db.metadata.put({
        key: 'rankingModel',
        value: JSON.stringify({
          bias: this.model.bias,
          weights: this.model.weights,
        }),
        updatedAt: Date.now()
      });
      if (DEBUG) {
        log('[AdvancedLocalRanker] Saved model weights to DB');
      }
    } catch (err) {
      console.error('[AdvancedLocalRanker] Failed to persist model weights:', err);
    }
  }

  private async loadModelWeights() {
    try {
      const db = await getDB();
      const record = await db.metadata.get('rankingModel');
      if (record) {
        const parsed = JSON.parse(record.value);
        this.model.bias = parsed.bias;
        Object.assign(this.model.weights, parsed.weights);
        if (DEBUG) {
          log('[AdvancedLocalRanker] Loaded model weights from DB');
        }
      }
    } catch (err) {
      console.error('[AdvancedLocalRanker] Failed to load model weights:', err);
    }
  }

  private async updatePageInDB(page: PageRecord) {
    try {
      const db = await getDB();
      await db.pages.update(page.pageId, {
        personalScore: page.personalScore,
        updatedAt: Date.now()
      });
    } catch (err) {
      console.error('[AdvancedLocalRanker] Failed to update page in DB:', err);
    }
  }

  private fuzzyFallback(query: string): Array<{ pageId: string; score: number }> {
    const results: Array<{ pageId: string; score: number }> = [];
    for (const p of this.pages) {
      const sim = jw(query.toLowerCase(), p.title.toLowerCase());
      if (sim > 0.5) {
        results.push({ pageId: p.pageId, score: sim });
      }
    }
    return results;
  }

  private async loadDataFromDB(): Promise<void> {
    try {
      const db = await getDB();
      const [pages, visits, edges, sessions] = await Promise.all([
        db.pages.toArray(),
        db.visits.toArray(),
        db.edges.toArray(),
        db.sessions.toArray()
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

  private computeRegularity(pageId: string): number {
    const pageVisits = this.visits.filter(v => v.pageId === pageId);
    if (pageVisits.length < 2) return 0.5;
    
    const sorted = [...pageVisits].sort((a, b) => a.startTime - b.startTime);
    const intervals: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      intervals.push(sorted[i].startTime - sorted[i - 1].startTime);
    }

    const meanInt = mathjs.mean(intervals) as number;
    const stdInt = mathjs.std(intervals, 'uncorrected') as number;
    const cv = meanInt > 0 ? (stdInt / meanInt) : 0;

    const ent = this.shannonEntropy(intervals);
    const entFactor = pageVisits.length > 1 ? 1.0 + ent / Math.log(pageVisits.length) : 1.0;

    const r = (1 / (1 + cv)) * entFactor;
    return (isFinite(r) && !isNaN(r)) ? r : 0.5;
  }

  private shannonEntropy(vals: number[]): number {
    const sum = vals.reduce((a, b) => a + b, 0);
    if (sum === 0) return 0;
    const p = vals.map(x => x / sum);
    return -p.reduce((acc, x) => (x > 0 ? acc + x * Math.log(x) : acc), 0);
  }

  private applyRelevanceFilter(
    scores: Array<{ pageId: string; title: string; url: string; score: number }>,
    query: string
  ): Array<{ pageId: string; title: string; url: string; score: number }> {
    if (!scores.length) return scores;

    const queryLength = query.split(/\s+/).filter(Boolean).length;
    const queryComplexity = Math.min(1.0, 0.3 + (queryLength * 0.2)); 
    const maxScore = scores[0].score;

    // If there are very few results, or a single short query with a decent max score, skip filter.
    if (scores.length <= 2 || (queryLength === 1 && maxScore > 0.3)) {
      log(`[RELEVANCE FILTER] Skipping: ${scores.length} results, query length ${queryLength}, max score ${maxScore.toFixed(4)}`);
      return scores;
    }
    
    // Sigmoid parameters
    const midpoint = Math.max(0.1, maxScore * (0.25 - 0.05 * queryComplexity));
    const steepness = 8 + (queryComplexity * 4);

    const relevantResults = scores.filter(result => {
      const prob = this.computeRelevanceProbability(
        result.score / maxScore,
        midpoint,
        steepness,
        maxScore
      );
      return prob >= 0.3;
    });

    log(`[RELEVANCE FILTER] Filtered out ${scores.length - relevantResults.length} from ${scores.length}`);
    return relevantResults;
  }

  private computeRelevanceProbability(
    normalizedScore: number,
    midpoint: number,
    steepness: number,
    maxScore: number
  ): number {
    // Be more lenient if maxScore is very low
    const adjustedMidpoint = maxScore < 0.3 ? midpoint * 0.5 : midpoint;
    // Sigmoid function
    return 1 / (1 + Math.exp(-steepness * (normalizedScore - adjustedMidpoint)));
  }

  // -----------------------------------------------------------------------
  // Model Learning
  // -----------------------------------------------------------------------
  private updateModelFromClick(clickedPageId: string, displayedIds: string[]) {
    let modelUpdated = false;
    
    // Clicked item is a positive example
    const clickedFeatures = this.lastDisplayedFeatures[clickedPageId];
    if (clickedFeatures) {
      if (DEBUG) {
        log(`[MODEL] Training positive example for pageId=${clickedPageId}`);
        const oldWeights = {...this.model.weights};
        const oldBias = this.model.bias;
        
        this.model.update(clickedFeatures, 1); // outcome=1 means clicked
        
        log(`[MODEL] Weight changes from positive example:`);
        for (const key of Object.keys(this.model.weights) as Array<keyof FeatureVector>) {
          const delta = this.model.weights[key] - oldWeights[key];
          if (Math.abs(delta) > 0.0001) {
            log(`  ${key}: ${oldWeights[key].toFixed(4)} -> ${this.model.weights[key].toFixed(4)} (Δ=${delta.toFixed(4)})`);
          }
        }
        const biasDelta = this.model.bias - oldBias;
        if (Math.abs(biasDelta) > 0.0001) {
          log(`  bias: ${oldBias.toFixed(4)} -> ${this.model.bias.toFixed(4)} (Δ=${biasDelta.toFixed(4)})`);
        }
      } else {
        this.model.update(clickedFeatures, 1);
      }
      modelUpdated = true;
    }
    
    // Items shown but not clicked are negative examples
    for (const pageId of displayedIds) {
      if (pageId !== clickedPageId) {
        const notClickedFeatures = this.lastDisplayedFeatures[pageId];
        if (notClickedFeatures) {
          if (DEBUG) {
            log(`[MODEL] Training negative example for pageId=${pageId}`);
            const oldWeights = {...this.model.weights};
            const oldBias = this.model.bias;
            
            this.model.update(notClickedFeatures, 0); // outcome=0 means not clicked
            
            // Only log significant changes
            let hasSignificantChange = false;
            const changes: string[] = [];
            
            for (const key of Object.keys(this.model.weights) as Array<keyof FeatureVector>) {
              const delta = this.model.weights[key] - oldWeights[key];
              if (Math.abs(delta) > 0.0001) {
                hasSignificantChange = true;
                changes.push(`  ${key}: ${oldWeights[key].toFixed(4)} -> ${this.model.weights[key].toFixed(4)} (Δ=${delta.toFixed(4)})`);
              }
            }
            
            const biasDelta = this.model.bias - oldBias;
            if (Math.abs(biasDelta) > 0.0001) {
              hasSignificantChange = true;
              changes.push(`  bias: ${oldBias.toFixed(4)} -> ${this.model.bias.toFixed(4)} (Δ=${biasDelta.toFixed(4)})`);
            }
            
            if (hasSignificantChange) {
              log(`[MODEL] Weight changes from negative example:`);
              changes.forEach(change => log(change));
            }
          } else {
            this.model.update(notClickedFeatures, 0);
          }
          modelUpdated = true;
        }
      }
    }
    
    // Save model weights if any updates occurred
    if (modelUpdated) {
      this.saveModelWeights();
      
      // Periodically log overall model state
      if (DEBUG) {
        log(`[MODEL] Current model state after updates:`);
        log(`  Bias: ${this.model.bias.toFixed(4)}`);
        log(`  Feature weights: ${JSON.stringify(
          Object.fromEntries(
            Object.entries(this.model.weights)
              .map(([k, v]) => [k, parseFloat(v.toFixed(4))])
          ), 
        null, 2)}`);
      }
    }
  }
}

export const localRanker = new AdvancedLocalRanker();