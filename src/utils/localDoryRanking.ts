/**
 * localDoryRanking.ts
 *
 * Demonstrates an advanced local ranking system with a two-tier approach:
 *  1) Fuzzy text matching with Fuse.js (replaced BM25 + specialized tokenization)
 *  2) Contextual intelligence (recency, Markov transitions, time-of-day, etc.) as tie-breakers.
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
import { HybridSearchProvider } from './hybridSearchProvider';

// -------------------------------------------------------------------------
// 1) Helper Functions
// -------------------------------------------------------------------------

function log(...args: any[]) {
  if (DEBUG) console.log(...args);
}

// -------------------------------------------------------------------------
// 2) Tokenization & Utilities
// -------------------------------------------------------------------------
function tokenizeTitle(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function tokenizeUrl(url: string): string[] {
  // Specialized URL tokenization (splits on / ? # : . - _ =)
  return url
    .toLowerCase()
    .split(/[\/\?\#\:\.\-\_\=]+/)
    .filter(Boolean);
}

function computeFrequency(tokens: string[]): Record<string, number> {
  const freq: Record<string, number> = {};
  for (const tk of tokens) {
    freq[tk] = (freq[tk] || 0) + 1;
  }
  return freq;
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

function toSeconds(ts: number): number {
  return ts > 10000000000 ? Math.floor(ts / 1000) : ts;
}

/**
 * Substring/prefix bonus for quick launch:
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

// -------------------------------------------------------------------------
// 3) BM25 Implementation (Title + URL) with Weighted URL
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
    this.docs = pageRecords.map((p) => {
      const tArr = tokenizeTitle(p.title);
      const uArr = tokenizeUrl(p.url);
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
    const qTokens = tokenizeTitle(query);
    if (!qTokens.length) {
      return this.docs.map(d => ({ pageId: d.pageId, score: 0 }));
    }

    const N = this.docs.length;
    const docFreq: Record<string, number> = {};
    for (const qt of qTokens) {
      docFreq[qt] = 0;
      for (const d of this.docs) {
        if (d.titleTokens[qt] || d.urlTokens[qt]) {
          docFreq[qt]++;
        }
      }
    }

    const idf: Record<string, number> = {};
    for (const qt of qTokens) {
      const df = docFreq[qt] || 0;
      idf[qt] = Math.log((N - df + 0.5) / (df + 0.5) + 1);
    }

    const results: Array<{ pageId: string; score: number }> = [];
    for (const doc of this.docs) {
      let score = 0;
      for (const qt of qTokens) {
        const freqT = doc.titleTokens[qt] || 0;
        const freqU = doc.urlTokens[qt] || 0;

        const TFt =
          (this.wTitle * freqT * (this.k1 + 1)) /
          (freqT + this.k1 * (1 - this.bTitle + this.bTitle * (doc.titleLen / this.avgTitleLen)));

        const TFu =
          (this.wUrl * freqU * (this.k1 + 1)) /
          (freqU + this.k1 * (1 - this.bUrl + this.bUrl * (doc.urlLen / this.avgUrlLen)));

        score += (idf[qt] || 0) * (TFt + TFu);
      }
      results.push({ pageId: doc.pageId, score });
    }
    return results;
  }
}

// -------------------------------------------------------------------------
// 4) Contextual Signals: Markov Chain, Time-of-Day, Recency, Session
// -------------------------------------------------------------------------
interface MarkovTable {
  [fromPageId: string]: {
    [toPageId: string]: number;
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

// -------------------------------------------------------------------------
// 5) Feature Vector, Model, Two-Tier Scoring
// -------------------------------------------------------------------------
interface FeatureVector {
  textMatch: number;   // Tier-1 text score
  recency: number;
  frequency: number;
  navigation: number;
  timeOfDay: number;
  session: number;
  regularity: number;
}

function computeContextualScore(features: FeatureVector, weights: FeatureVector): number {
  return (
    weights.recency     * features.recency     +
    weights.frequency   * features.frequency   +
    weights.navigation  * features.navigation  +
    weights.timeOfDay   * features.timeOfDay   +
    weights.session     * features.session     +
    weights.regularity  * features.regularity
  );
}

class OnlineLinearModel {
  public weights: FeatureVector;
  public bias = 0;
  private learningRate = 0.01;

  constructor(initial?: Partial<FeatureVector>, bias?: number) {
    this.weights = {
      textMatch: this.initRandom() + 0.1,
      recency:   this.initRandom(),
      frequency: this.initRandom(),
      navigation:this.initRandom(),
      timeOfDay: this.initRandom(),
      session:   this.initRandom(),
      regularity:this.initRandom(),
    };
    if (initial) {
      Object.assign(this.weights, initial);
    }
    if (typeof bias === 'number') {
      this.bias = bias;
    }
  }
  
  private initRandom(): number {
    return (Math.random() - 0.5) * 0.1;
  }

  /**
   * Combined scoring with textMatch as the primary signal
   */
  public predict(f: FeatureVector): number {
    const score =
      this.weights.textMatch   * f.textMatch   +
      this.weights.recency     * f.recency     +
      this.weights.frequency   * f.frequency   +
      this.weights.navigation  * f.navigation  +
      this.weights.timeOfDay   * f.timeOfDay   +
      this.weights.session     * f.session     +
      this.weights.regularity  * f.regularity;

    return score + this.bias;
  }

  public update(f: FeatureVector, outcome: number) {
    const rawScore = this.predict(f);
    const prob = 1 / (1 + Math.exp(-rawScore));
    const error = outcome - prob;
    this.bias += this.learningRate * error;

    const reg = 0.0001; // L2 regularization
    this.weights.textMatch   += this.learningRate * (error * f.textMatch   - reg * this.weights.textMatch);
    this.weights.recency     += this.learningRate * (error * f.recency     - reg * this.weights.recency);
    this.weights.frequency   += this.learningRate * (error * f.frequency   - reg * this.weights.frequency);
    this.weights.navigation  += this.learningRate * (error * f.navigation  - reg * this.weights.navigation);
    this.weights.timeOfDay   += this.learningRate * (error * f.timeOfDay   - reg * this.weights.timeOfDay);
    this.weights.session     += this.learningRate * (error * f.session     - reg * this.weights.session);
    this.weights.regularity  += this.learningRate * (error * f.regularity  - reg * this.weights.regularity);

    this.constrainWeights();
  }
  
  private constrainWeights() {
    const maxW = 5.0;
    const minW = -1.0;
    this.weights.textMatch   = clamp(this.weights.textMatch,   minW, maxW);
    this.weights.recency     = clamp(this.weights.recency,     minW, maxW);
    this.weights.frequency   = clamp(this.weights.frequency,   minW, maxW);
    this.weights.navigation  = clamp(this.weights.navigation,  minW, maxW);
    this.weights.timeOfDay   = clamp(this.weights.timeOfDay,   minW, maxW);
    this.weights.session     = clamp(this.weights.session,     minW, maxW);
    this.weights.regularity  = clamp(this.weights.regularity,  minW, maxW);
    this.bias = Math.max(-3.0, Math.min(3.0, this.bias));
  }
}

// -------------------------------------------------------------------------
// 6) The AdvancedLocalRanker Class
// -------------------------------------------------------------------------
export class AdvancedLocalRanker {
  private pages: PageRecord[] = [];
  private visits: VisitRecord[] = [];
  private edges: EdgeRecord[] = [];
  private sessions: BrowsingSession[] = [];

  private searchProvider: HybridSearchProvider | null = null;
  private markovTable: MarkovTable = {};
  private timeOfDayHist: TimeOfDayHistogram = {};

  private model = new OnlineLinearModel();
  private lastDisplayedFeatures: Record<string, FeatureVector> = {};

  constructor() {
    if (DEBUG) {
      log('[AdvancedLocalRanker] Constructed.');
    }
  }

  public async initialize(): Promise<void> {
    await this.loadDataFromDB();
    await this.loadModelWeights();

    this.searchProvider = new HybridSearchProvider(this.pages, {
      fuzzyMatchThreshold: 70 // 70% similarity is a good default
    });
    this.markovTable = buildMarkovChain(this.edges);
    this.timeOfDayHist = buildTimeOfDayHistogram(this.visits);

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

    const searchResults = this.searchProvider.search(query);
    
    if (searchResults.length === 0) {
      return [];
    }

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

    const finalScores = searchResults.map(result => {
      const page = result.page;
      
      const textMatchScore = result.matchType === 'exact' 
        ? result.score * 1.2  // Boost exact matches
        : result.score;

      const recencyVal = multiScaleRecencyScore(page, this.visits, nowSec);
      const freqVal = Math.log1p(page.visitCount) * (0.5 + page.personalScore);
      const navVal = currentPageId ? computeMarkovTransitionProb(this.markovTable, currentPageId, page.pageId) : 0;
      const hourNow = new Date(now).getHours();
      const todVal = computeTimeOfDayProb(this.timeOfDayHist, page.pageId, hourNow);
      const sessVal = sessionFeatures ? computeSessionContextWeight(page, sessionFeatures) : 0;
      const regVal = this.computeRegularity(page.pageId);

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
    
    finalScores.sort((a, b) => b.score - a.score);

    const filtered = this.applyRelevanceFilter(finalScores, query);

    const deduplicatedResults: Array<{ pageId: string; title: string; url: string; score: number }> = [];
    const seenTitles = new Set<string>();
    const seenUrls = new Set<string>();

    for (const result of filtered) {
      if (!seenTitles.has(result.title) && !seenUrls.has(result.url)) {
        deduplicatedResults.push({
          pageId: result.pageId,
          title: result.title,
          url: result.url,
          score: result.score
        });
        seenTitles.add(result.title);
        seenUrls.add(result.url);
      }
    }

    return deduplicatedResults;
  }

  public recordUserClick(pageId: string, displayedIds: string[]) {
    const rank = displayedIds.indexOf(pageId);
    if (rank < 0) return;
    const page = this.pages.find(p => p.pageId === pageId);
    if (!page) return;

    const oldScore = page.personalScore;
    const boostFactor = rank >= 3 ? 0.15 : 0.1;
    const newScore = oldScore + boostFactor * (1 - oldScore);
    page.personalScore = clamp(newScore);
    this.updatePageInDB(page);

    this.updateModelFromClick(pageId, displayedIds);
  }

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
      this.searchProvider = new HybridSearchProvider(this.pages);
    }
    
    this.markovTable = buildMarkovChain(this.edges);
    this.timeOfDayHist = buildTimeOfDayHistogram(this.visits);

    if (DEBUG) {
      log(`[AdvancedLocalRanker] Refreshed. Pages=${this.pages.length}, Visits=${this.visits.length}, Edges=${this.edges.length}`);
      log(`Model weights: ${JSON.stringify(this.model.weights, null, 2)}`);
      log(`Model bias: ${this.model.bias.toFixed(4)}`);
    }
  }

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
      const record = await metadataRepository.getByKey('rankingModel');
      if (record) {
        const parsed = JSON.parse(record.value);
        this.model.bias = parsed.bias;
        Object.assign(this.model.weights, parsed.weights);
      }
    } catch (err) {
      console.error('[AdvancedLocalRanker] Failed to load model weights:', err);
    }
  }

  private async saveModelWeights() {
    try {
      await metadataRepository.saveValue(
        'rankingModel',
        JSON.stringify({
          bias: this.model.bias,
          weights: this.model.weights
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
    const entFactor = pageVisits.length > 1 ? (1.0 + ent / Math.log(pageVisits.length)) : 1.0;
    const r = (1 / (1 + cv)) * entFactor;
    return (isFinite(r) && !isNaN(r)) ? r : 0.5;
  }

  private shannonEntropy(vals: number[]): number {
    const sum = vals.reduce((a, b) => a + b, 0);
    if (sum === 0) return 0;
    const p = vals.map(x => x / sum);
    return -p.reduce((acc, x) => (x > 0 ? acc + x * Math.log(x) : acc), 0);
  }

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

  private updateModelFromClick(clickedPageId: string, displayedIds: string[]) {
    let updated = false;
    const clickedFeatures = this.lastDisplayedFeatures[clickedPageId];
    if (clickedFeatures) {
      this.model.update(clickedFeatures, 1);
      updated = true;
    }
    for (const pid of displayedIds) {
      if (pid !== clickedPageId) {
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
}

export const localRanker = new AdvancedLocalRanker();