/**
 * localDoryRanking.ts
 *
 * Demonstrates an advanced local ranking system using Dory's data:
 *  - Pages (PageRecord)
 *  - Visits (VisitRecord)
 *  - Edges (EdgeRecord)
 *  - Sessions (BrowsingSession)
 *  - Events (DoryEvent) [not explicitly used here]
 *
 * No references to "category" or "tags".
 *
 * Features:
 *  1. BM25 text matching (title + url)
 *  2. Multi-scale temporal weighting for recency
 *  3. Navigation context (Markov chain from edges)
 *  4. Time-of-day pattern weighting
 *  5. Session context (domain-only clustering)
 *  6. Adaptive updates (simple user-click stub)
 */

import { getDB } from '../db/dexieDB';  // Adjust to your Dexie instance path
import { DEBUG } from '../config';
import jw from 'jaro-winkler';           // Optional for fallback fuzzy
import * as mathjs from 'mathjs';        // For advanced numeric ops if needed

// -------------------------------------------------------------------------
// 1) Data Interfaces (No category, no tags)
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
// 2) Helpers: Tokenization, Timestamp Conversion
// -------------------------------------------------------------------------
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

      const tFreq: Record<string, number> = {};
      const uFreq: Record<string, number> = {};

      for (const tk of tArr) {
        tFreq[tk] = (tFreq[tk] || 0) + 1;
      }
      for (const uk of uArr) {
        uFreq[uk] = (uFreq[uk] || 0) + 1;
      }

      return {
        pageId: p.pageId,
        titleTokens: tFreq,
        urlTokens: uFreq,
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
    console.log(`Query tokens: [${qTokens.join(', ')}]`);
    
    if (!qTokens.length) {
      console.log(`No valid tokens in query`);
      return this.docs.map(d => ({ pageId: d.pageId, score: 0 }));
    }

    const N = this.docs.length;
    console.log(`Total documents in index: ${N}`);
    
    // docFreq
    const docFreq: Record<string, number> = {};
    for (const qt of qTokens) {
      docFreq[qt] = 0;
      for (const d of this.docs) {
        if (qt in d.titleTokens || qt in d.urlTokens) {
          docFreq[qt]++;
        }
      }
    }
    
    console.log(`Document frequency for tokens:`);
    for (const qt of qTokens) {
      console.log(`  "${qt}": ${docFreq[qt]} docs`);
    }

    // IDF
    const idf: Record<string, number> = {};
    for (const qt of qTokens) {
      const df = docFreq[qt] || 0;
      idf[qt] = Math.log((N - df + 0.5) / (df + 0.5) + 1);
    }
    
    console.log(`IDF values for tokens:`);
    for (const qt of qTokens) {
      console.log(`  "${qt}": ${idf[qt].toFixed(4)}`);
    }

    // BM25 scoring
    console.log(`Computing BM25 scores (k1=${this.k1}, bTitle=${this.bTitle}, bUrl=${this.bUrl}, wTitle=${this.wTitle}, wUrl=${this.wUrl})`);
    console.log(`Avg title length: ${this.avgTitleLen.toFixed(2)}, Avg URL length: ${this.avgUrlLen.toFixed(2)}`);
    
    const results: Array<{ pageId: string; score: number }> = [];
    for (const doc of this.docs) {
      let score = 0;
      const docScores: Record<string, number> = {};
      
      for (const qt of qTokens) {
        const freqT = doc.titleTokens[qt] || 0;
        const freqU = doc.urlTokens[qt] || 0;

        const TFt = (this.wTitle * freqT * (this.k1 + 1)) /
          (freqT + this.k1 * (1 - this.bTitle + this.bTitle * (doc.titleLen / this.avgTitleLen)));

        const TFu = (this.wUrl * freqU * (this.k1 + 1)) /
          (freqU + this.k1 * (1 - this.bUrl + this.bUrl * (doc.urlLen / this.avgUrlLen)));

        const tokenScore = (idf[qt] || 0) * (TFt + TFu);
        docScores[qt] = tokenScore;
        score += tokenScore;
      }
      
      if (score > 0) {
        console.log(`Document ${doc.pageId.slice(0, 8)}... scored ${score.toFixed(4)}:`);
        for (const qt of qTokens) {
          console.log(`  Token "${qt}": ${docScores[qt]?.toFixed(4) || 0}`);
        }
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
    if (!table[e.fromPageId]) {
      table[e.fromPageId] = {};
    }
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
    if (!hist[v.pageId]) {
      hist[v.pageId] = new Array(24).fill(0);
    }
    hist[v.pageId][hour]++;
  }
  return hist;
}

function computeTimeOfDayProb(hist: TimeOfDayHistogram, pageId: string, hourNow: number): number {
  const arr = hist[pageId];
  if (!arr) return 0;
  const sum = arr.reduce((acc, x) => acc + x, 0);
  if (sum === 0) return 0;
  return arr[hourNow] / sum;
}

// -------------------------------------------------------------------------
// 5) Multi-Scale Recency
// -------------------------------------------------------------------------
function multiScaleRecencyScore(
  page: PageRecord,
  visits: VisitRecord[],
  nowSec: number
): number {
  // e.g. shortTerm (hours), mediumTerm (days), longTerm (weeks)
  const pageVisits = visits.filter(v => v.pageId === page.pageId);
  if (!pageVisits.length) return 0;

  let shortTerm = 0;
  let mediumTerm = 0;
  let longTerm = 0;

  const log2 = Math.log(2);
  for (const pv of pageVisits) {
    const delta = nowSec - toSeconds(pv.startTime);
    if (delta < 0) continue;

    const shortDecay = Math.exp(- (log2 * delta) / 7200);    // ~2 hrs
    const medDecay   = Math.exp(- (log2 * delta) / 86400);   // 1 day
    const longDecay  = Math.exp(- (log2 * delta) / 604800);  // 7 days

    const dwell = pv.totalActiveTime || 0;
    const dwellFactor = 1 + (Math.atan(dwell / 30) / (Math.PI / 2)) * 0.3;

    shortTerm  += shortDecay * dwellFactor;
    mediumTerm += medDecay  * dwellFactor;
    longTerm   += longDecay * dwellFactor;
  }

  // Weighted sum
  return shortTerm + 0.5 * mediumTerm + 0.2 * longTerm;
}

// -------------------------------------------------------------------------
// 6) Session Context: Domain Clustering
// -------------------------------------------------------------------------
interface SessionFeatures {
  recentDomains: Record<string, number>; // domain => freq
}

function buildSessionFeatures(
  sessionId: number | undefined,
  pages: PageRecord[],
  visits: VisitRecord[]
): SessionFeatures {
  const feats: SessionFeatures = { recentDomains: {} };
  
  // If sessionId is undefined, return empty features
  if (sessionId === undefined) {
    return feats;
  }
  
  const sessionVisits = visits.filter(v => v.sessionId === sessionId);

  for (const sv of sessionVisits) {
    const page = pages.find(px => px.pageId === sv.pageId);
    if (!page) continue;
    feats.recentDomains[page.domain] = (feats.recentDomains[page.domain] || 0) + 1;
  }
  return feats;
}

function computeSessionContextWeight(
  page: PageRecord,
  features: SessionFeatures
): number {
  const domainCount = features.recentDomains[page.domain] || 0;
  return Math.log1p(domainCount);
}

// -------------------------------------------------------------------------
// 7) The AdvancedLocalRanker (No category, no tags)
// -------------------------------------------------------------------------
export class AdvancedLocalRanker {
  private pages: PageRecord[] = [];
  private visits: VisitRecord[] = [];
  private edges: EdgeRecord[] = [];
  private sessions: BrowsingSession[] = [];

  private bm25: BM25Engine | null = null;
  private markovTable: MarkovTable = {};
  private timeOfDayHist: TimeOfDayHistogram = {};

  constructor() {
    if (DEBUG) {
      console.log('[AdvancedLocalRanker] Constructed (no category, no tags).');
    }
  }

  public async initialize(): Promise<void> {
    await this.loadDataFromDB();

    // BM25
    this.bm25 = new BM25Engine(this.pages);

    // Markov chain
    this.markovTable = buildMarkovChain(this.edges);

    // Time-of-day histogram
    this.timeOfDayHist = buildTimeOfDayHistogram(this.visits);

    if (DEBUG) {
      console.log(
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
    console.log(`\n=== RANKING CALCULATION FOR QUERY: "${query}" ===`);
    console.log(`Current page ID: ${currentPageId || 'None'}, Timestamp: ${new Date(now).toISOString()}`);

    if (!this.bm25) return [];
    const nowSec = toSeconds(now);

    // 1) BM25 text
    console.log(`\n[1. TEXT MATCHING] Computing BM25 text match scores...`);
    let results = this.bm25.computeScores(query);
    console.log(`Found ${results.length} candidate pages`);
    if (results.length > 0) {
      console.log(`Top 3 initial text matches:`);
      results
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .forEach((r, i) => {
          const page = this.pages.find(p => p.pageId === r.pageId);
          console.log(`  ${i + 1}. [${r.pageId.slice(0, 8)}...] "${page?.title || ''}": ${r.score.toFixed(4)}`);
        });
    }

    // 2) Fallback fuzzy if all 0 & query is decently long
    const allZero = results.every(d => d.score === 0);
    if (allZero && query.length > 2) {
      console.log(`\n[FALLBACK] No BM25 matches found, using fuzzy fallback...`);
      results = this.fuzzyFallback(query);
      console.log(`Fuzzy fallback found ${results.length} candidates`);
    }

    // 3) Build session context if we have currentPageId => find session
    let sessionId = -1;
    let sessionFeatures: SessionFeatures | null = null;
    if (currentPageId) {
      console.log(`\n[SESSION CONTEXT] Finding session for current page ${currentPageId}`);
      const relevantVisits = this.visits.filter(v => v.pageId === currentPageId);
      if (relevantVisits.length) {
        relevantVisits.sort((a, b) => b.startTime - a.startTime);
        sessionId = relevantVisits[0].sessionId || -1; // Handle undefined sessionId
        console.log(`Found session ID: ${sessionId}`);
        sessionFeatures = buildSessionFeatures(sessionId, this.pages, this.visits);
        if (sessionFeatures) {
          console.log(`Session domains: ${Object.keys(sessionFeatures.recentDomains).join(', ')}`);
        }
      } else {
        console.log(`No visits found for current page ID`);
      }
    }

    // 4) Compute final scores for each doc
    console.log(`\n[2. FACTOR CALCULATION] Computing ranking factors for each candidate...`);
    const finalScores: Array<{ pageId: string; title: string; url: string; score: number }> = [];
    for (const doc of results) {
      const p = this.pages.find(px => px.pageId === doc.pageId);
      if (!p) continue;

      console.log(`\n--- Page ID: ${p.pageId.slice(0, 8)}... | Title: "${p.title}" ---`);
      
      let score = doc.score;
      console.log(`Base text match score: ${score.toFixed(4)}`);

      // Multi-scale recency
      const recencyVal = multiScaleRecencyScore(p, this.visits, nowSec);
      console.log(`Recency value: ${recencyVal.toFixed(4)} (weight: 0.3)`);

      // Frequency => e.g. log(1 + visitCount) * personalScore
      const freqFactor = Math.log1p(p.visitCount) * (0.5 + p.personalScore);
      console.log(`Frequency factor: ${freqFactor.toFixed(4)} (visits: ${p.visitCount}, personal: ${p.personalScore.toFixed(2)}, weight: 0.2)`);

      // Markov chain
      let navContextVal = 0;
      if (currentPageId) {
        navContextVal = computeMarkovTransitionProb(
          this.markovTable,
          currentPageId,
          p.pageId
        );
        console.log(`Navigation context: ${navContextVal.toFixed(4)} (from ${currentPageId.slice(0, 8)}..., weight: 0.5)`);
      } else {
        console.log(`Navigation context: ${navContextVal.toFixed(4)} (no current page, weight: 0.5)`);
      }

      // Time-of-day
      const hourNow = new Date(now).getHours();
      const todVal = computeTimeOfDayProb(this.timeOfDayHist, p.pageId, hourNow);
      console.log(`Time-of-day (hour ${hourNow}): ${todVal.toFixed(4)} (weight: 0.2)`);

      // Session domain context
      let sessVal = 0;
      if (sessionFeatures) {
        sessVal = computeSessionContextWeight(p, sessionFeatures);
        console.log(`Session context: ${sessVal.toFixed(4)} (weight: 0.4)`);
      } else {
        console.log(`Session context: ${sessVal.toFixed(4)} (no session features, weight: 0.4)`);
      }

      // Regularity factor
      const regularityFactor = this.computeRegularity(p.pageId);
      console.log(`Regularity factor: ${regularityFactor.toFixed(4)} (weight: 0.3)`);

      // Combine additively
      const total =
        score +
        0.3 * recencyVal +
        0.2 * freqFactor +
        0.5 * navContextVal +
        0.2 * todVal +
        0.4 * sessVal +
        0.3 * regularityFactor;
      
      console.log(`Final score calculation:`);
      console.log(`  ${score.toFixed(4)} (text) + `);
      console.log(`  0.3 * ${recencyVal.toFixed(4)} (recency) + `);
      console.log(`  0.2 * ${freqFactor.toFixed(4)} (frequency) + `);
      console.log(`  0.5 * ${navContextVal.toFixed(4)} (navigation) + `);
      console.log(`  0.2 * ${todVal.toFixed(4)} (time-of-day) + `);
      console.log(`  0.4 * ${sessVal.toFixed(4)} (session) + `);
      console.log(`  0.3 * ${regularityFactor.toFixed(4)} (regularity)`);
      console.log(`= ${total.toFixed(4)}`);

      finalScores.push({ 
        pageId: p.pageId, 
        title: p.title || '',
        url: p.url || '',
        score: total 
      });
    }

    finalScores.sort((a, b) => b.score - a.score);
    
    console.log(`\n[3. FINAL RESULTS] Sorted ${finalScores.length} results by score:`);
    finalScores.slice(0, 5).forEach((r, i) => {
      console.log(`  ${i + 1}. [${r.pageId.slice(0, 8)}...] "${r.title}": ${r.score.toFixed(4)}`);
    });
    console.log(`=== END OF RANKING CALCULATION ===\n`);
    
    return finalScores;
  }

  public recordUserClick(pageId: string, displayedIds: string[]) {
    const rank = displayedIds.indexOf(pageId);
    if (rank < 0) return;
    
    // Find the page record
    const page = this.pages.find(p => p.pageId === pageId);
    if (!page) return;
    
    // Apply positive reinforcement with diminishing returns
    const oldScore = page.personalScore;
    // Higher boost for deeper results (user specifically sought these out)
    const boostFactor = rank >= 3 ? 0.15 : 0.1; 
    const newScore = oldScore + boostFactor * (1 - oldScore);
    
    // Update score (bounded to [0,1])
    page.personalScore = Math.max(0, Math.min(1, newScore));
    
    if (DEBUG) {
      console.log(
        `[REINFORCE] Click recorded for pageId=${pageId}, rank=${rank}, ` + 
        `personal score: ${oldScore.toFixed(2)} -> ${page.personalScore.toFixed(2)}`
      );
    }
    
    // Persist changes to database
    this.updatePageInDB(page);
  }
  
  /**
   * Record when a result is shown but not clicked - applies negative reinforcement
   * @param pageIds Array of page IDs that were displayed but not clicked
   */
  public recordImpressions(pageIds: string[]) {
    for (const pageId of pageIds) {
      const page = this.pages.find(p => p.pageId === pageId);
      if (!page) continue;
      
      // Apply negative reinforcement - more gentle than positive
      const oldScore = page.personalScore;
      const newScore = oldScore + 0.05 * (0 - oldScore);
      
      // Update score (bounded to [0,1])
      page.personalScore = Math.max(0, Math.min(1, newScore));
      
      if (DEBUG) {
        console.log(
          `[REINFORCE] Impression recorded for pageId=${pageId}, ` + 
          `personal score: ${oldScore.toFixed(2)} -> ${page.personalScore.toFixed(2)}`
        );
      }
      
      // Persist changes to database
      this.updatePageInDB(page);
    }
  }

  /**
   * Refresh data from the database to ensure the ranker is using the latest information.
   * Call this method when you know new visits have been recorded elsewhere.
   */
  public async refreshData(): Promise<void> {
    await this.loadDataFromDB();
    
    // Rebuild derivative data structures
    this.bm25 = new BM25Engine(this.pages);
    this.markovTable = buildMarkovChain(this.edges);
    this.timeOfDayHist = buildTimeOfDayHistogram(this.visits);

    if (DEBUG) {
      console.log(
        `[AdvancedLocalRanker] Refreshed data. Pages=${this.pages.length},` + 
        ` Visits=${this.visits.length}, Edges=${this.edges.length}`
      );
    }
  }

  /**
   * Helper to update a page record in the database
   */
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
    
    // Sort visits by time
    const sorted = [...pageVisits].sort((a, b) => a.startTime - b.startTime);
    
    // Calculate intervals
    const intervals: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      intervals.push(sorted[i].startTime - sorted[i - 1].startTime);
    }
    
    // Calculate metrics
    const meanInt = mathjs.mean(intervals) as number;
    const stdInt = mathjs.std(intervals, 'uncorrected') as number;
    const cv = meanInt > 0 ? (stdInt / meanInt) : 0;
    
    // Shannon entropy component
    const ent = this.shannonEntropy(intervals);
    let entFactor = 1.0;
    if (pageVisits.length > 1) {
      entFactor += ent / Math.log(pageVisits.length);
    }
    
    // Final regularity score
    const r = (1 / (1 + cv)) * entFactor;
    return isFinite(r) && !isNaN(r) ? r : 0.5;
  }

  private shannonEntropy(vals: number[]): number {
    const sum = vals.reduce((a, b) => a + b, 0);
    if (sum === 0) return 0;
    const p = vals.map(x => x / sum);
    return -p.reduce((acc, x) => (x > 0 ? acc + x * Math.log(x) : acc), 0);
  }
}

export const localRanker = new AdvancedLocalRanker();