import * as cheerio from "cheerio";
import { BM25 } from "wink-bm25-text-search";
import { stemmer as SnowballStemmer, Stemmer } from "snowball-stemmers";
import type { Element } from "domhandler";

/**************************************************************************
 * Utility function that mirrors "clean_tokens" from Python
 **************************************************************************/
function cleanTokens(tokens: string[]): string[] {
  // Example approach: remove empty/short tokens, punctuation-only, etc.
  return tokens.filter((t) => {
    const trimmed = t.trim();
    if (!trimmed) return false;
    // e.g. skip single punctuation or extremely short tokens
    if (trimmed.length < 2 && !/^[a-z0-9]$/i.test(trimmed)) return false;
    return true;
  });
}

/**************************************************************************
 * Abstract base: RelevantContentFilter
 **************************************************************************/
export abstract class RelevantContentFilter {
  protected userQuery?: string;

  protected includedTags: Set<string>;
  protected excludedTags: Set<string>;
  protected headerTags: Set<string>;
  protected negativePatterns: RegExp;
  protected minWordCount: number;

  constructor(userQuery?: string) {
    this.userQuery = userQuery;

    this.includedTags = new Set([
      // Primary structure
      "article", "main", "section", "div",
      // List structures
      "ul", "ol", "li", "dl", "dt", "dd",
      // Text content
      "p", "span", "blockquote", "pre", "code",
      // Headers
      "h1", "h2", "h3", "h4", "h5", "h6",
      // Tables
      "table", "thead", "tbody", "tr", "td", "th",
      // Other semantic elements
      "figure", "figcaption", "details", "summary",
      // Text formatting
      "em", "strong", "b", "i", "mark", "small",
      // Rich content
      "time", "address", "cite", "q",
      // Images
      "img",
      // Links
      "a",
    ]);

    this.excludedTags = new Set([
      "nav", "footer", "header", "aside",
      "script", "style", "form", "iframe", "noscript",
    ]);

    this.headerTags = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);
    // Similar negative patterns as Python
    this.negativePatterns = /nav|footer|header|sidebar|ads|comment|promo|advert|social|share/i;
    this.minWordCount = 2;
  }

  /**
   * "filter_content" from Python. Subclasses must override.
   */
  public abstract filterContent(html: string): string[];

  /**
   * Python: "extract_page_query(self, soup, body)"
   * We replicate by using cheerio. We'll gather <title>, <h1>, meta keywords, etc.
   */
  protected extractPageQuery($: cheerio.CheerioAPI, $body: cheerio.Cheerio<Element>): string {
    if (this.userQuery) {
      return this.userQuery;
    }

    const parts: string[] = [];

    // Title
    const title = $("title").text();
    if (title) parts.push(title);

    // h1
    const h1 = $("h1").text();
    if (h1) parts.push(h1);

    // meta keywords/description
    for (const metaName of ["keywords", "description"]) {
      const meta = $(`meta[name='${metaName}']`);
      if (meta && meta.attr("content")) {
        parts.push(meta.attr("content")!);
      }
    }

    // If still empty, find first <p> > 150 chars
    if (parts.length === 0) {
      const paragraphs = $body.find("p").toArray();
      for (const p of paragraphs) {
        const text = $(p).text() || "";
        if (text.length > 150) {
          parts.push(text.slice(0, 150));
          break;
        }
      }
    }

    return parts.join(" ");
  }

  /**
   * Python: "is_excluded(self, tag)"
   * Check if tag is in excluded list or negative pattern.
   */
  protected isExcluded($el: cheerio.Cheerio<Element>): boolean {
    const node = $el.get(0);
    if (!node || node.type !== "tag") return false;
    const tagName = node.tagName.toLowerCase();

    // If tag name is in excludedTags
    if (this.excludedTags.has(tagName)) return true;

    // class + id
    const className = $el.attr("class") || "";
    const idName = $el.attr("id") || "";
    const combined = (className + " " + idName).trim();
    return this.negativePatterns.test(combined);
  }

  /**
   * Python: "clean_element(self, tag)"
   * Minimal overhead cleaning, removing some attributes, etc.
   * We'll just return the outerHTML in this example.
   */
  protected cleanElement($node: cheerio.Cheerio<Element>): string {
    return $node.toString();
  }
}

/**************************************************************************
 * BM25ContentFilter
 * 
 * Equivalent to your Python BM25ContentFilter that uses rank_bm25.
 * We use wink-bm25-text-search for near exact functionality.
 *************************************************************************/
export class BM25ContentFilter extends RelevantContentFilter {
  private bm25Threshold: number;
  private language: string;
  private priorityTags: Record<string, number>;
  private stemmer: Stemmer;

  constructor(userQuery?: string, bm25Threshold = 1.0, language = "english") {
    super(userQuery);
    this.bm25Threshold = bm25Threshold;
    this.language = language;

    // Same priority weights as your Python code
    this.priorityTags = {
      h1: 5.0, h2: 4.0, h3: 3.0, title: 4.0,
      strong: 2.0, b: 1.5, em: 1.5, blockquote: 2.0,
      code: 2.0, pre: 1.5, th: 1.5
    };

    // Initialize snowball stemmer for the specified language
    this.stemmer = SnowballStemmer(this.language);
  }

  public filterContent(html: string): string[] {
    if (!html || typeof html !== "string") return [];

    // Parse with Cheerio
    const $ = cheerio.load(html);
    let $body = $("body");
    if (!$body.length) {
      // wrap
      const $$ = cheerio.load(`<body>${html}</body>`);
      $body = $$("body");
    }

    // Get user query fallback
    const query = this.extractPageQuery($, $body);
    if (!query) return [];

    // Extract text chunks (like "extract_text_chunks")
    const candidates = this.extractTextChunks($, $body);
    if (!candidates.length) return [];

    // Tokenize corpus
    const corpus = candidates.map(([_, chunkText, el]) => {
      const words = chunkText.toLowerCase().split(/\s+/);
      // Stem each word using stem() method
      const stemmed = words.map((w) => this.stemmer.stem(w));
      return cleanTokens(stemmed);
    });

    // Tokenize query
    const qwords = query.toLowerCase().split(/\s+/);
    const qstemmed = qwords.map((w) => this.stemmer.stem(w));
    const tokenizedQuery = cleanTokens(qstemmed);

    // wink-bm25-text-search usage
    const bm25 = BM25();
    bm25.init(corpus);

    const scores = bm25.search(tokenizedQuery);
    
    // Adjust by priority tags
    const adjusted: Array<[number, number, string, Element]> = [];
    for (let i = 0; i < scores.length; i++) {
      const score = scores[i];
      const [index, text, elem] = candidates[i];
      const tagName = elem.tagName?.toLowerCase() || "";
      const tagWeight = this.priorityTags[tagName] || 1.0;
      const adjScore = score * tagWeight;

      adjusted.push([adjScore, index, text, elem]);
    }

    // Filter by threshold
    const selected = adjusted.filter(([score]) => score >= this.bm25Threshold);

    // Sort by original index
    selected.sort((a, b) => a[1] - b[1]);

    // Return cleaned HTML
    return selected.map(([_, __, ___, elem]) => {
      const $node = $(elem);
      return this.cleanElement($node);
    });
  }

  /**
   * Python "extract_text_chunks(body, min_word_threshold=None)"
   * We'll replicate BFS/DFS. We store (index, text, element).
   */
  private extractTextChunks($: cheerio.CheerioAPI, $body: cheerio.Cheerio<Element>): Array<[number, string, Element]> {
    const results: Array<[number, string, Element]> = [];
    let chunkIndex = 0;

    const stack = [$body];
    while (stack.length) {
      const $el = stack.pop()!;
      $el.each((_, node) => {
        if (node.type === "tag") {
          const $node = $(node);
          if (!this.isExcluded($node)) {
            const tagName = node.tagName.toLowerCase();
            // If it's an included or a header
            if (this.includedTags.has(tagName) || this.headerTags.has(tagName)) {
              const text = $node.text().trim();
              const wc = text.split(/\s+/).length;
              if (wc >= this.minWordCount) {
                results.push([chunkIndex, text, node]);
                chunkIndex++;
              }
            }
            // push children
            stack.push($node.children());
          }
        }
      });
    }
    return results;
  }
}

/***************************************************************************
 * PruningContentFilter
 * 
 * Mirrors your Python class with dynamic/fixed threshold, text_density, etc.
 ***************************************************************************/
export class PruningContentFilter extends RelevantContentFilter {
  private minWordThreshold?: number;
  private thresholdType: "fixed" | "dynamic";
  private threshold: number;
  private language: string;

  private tagImportance: Record<string, number>;
  private metricConfig: Record<string, boolean>;
  private metricWeights: Record<string, number>;
  private tagWeights: Record<string, number>;

  constructor(
    userQuery?: string,
    minWordThreshold?: number,
    thresholdType: "fixed" | "dynamic" = "fixed",
    threshold = 0.48,
    language = "english"
  ) {
    super(userQuery);
    this.minWordThreshold = minWordThreshold;
    this.thresholdType = thresholdType;
    this.threshold = threshold;
    this.language = language;

    // from the Python code
    this.tagImportance = {
      article: 1.5,
      main: 1.4,
      section: 1.3,
      p: 1.2,
      h1: 1.4,
      h2: 1.3,
      h3: 1.2,
      div: 0.7,
      span: 0.6,
    };

    this.metricConfig = {
      text_density: true,
      link_density: true,
      tag_weight: true,
      class_id_weight: true,
      text_length: true,
    };

    this.metricWeights = {
      text_density: 0.4,
      link_density: 0.2,
      tag_weight: 0.2,
      class_id_weight: 0.1,
      text_length: 0.1,
    };

    this.tagWeights = {
      div: 0.5,
      p: 1.0,
      article: 1.5,
      section: 1.0,
      span: 0.3,
      li: 0.5,
      ul: 0.5,
      ol: 0.5,
      h1: 1.2,
      h2: 1.1,
      h3: 1.0,
      h4: 0.9,
      h5: 0.8,
      h6: 0.7,
    };
  }

  public filterContent(html: string): string[] {
    if (!html || typeof html !== "string") return [];

    const $ = cheerio.load(html);
    let $body = $("body");
    if (!$body.length) {
      const $$ = cheerio.load(`<body>${html}</body>`);
      $body = $$("body");
    }

    // Remove comments and excluded tags
    this.removeComments($);
    this.removeUnwantedTags($);

    // Prune
    const bodyEl = $body.get(0);
    if (bodyEl) {
      this.pruneTree($, bodyEl);
    }

    // Collect leftover content
    const blocks: string[] = [];
    $body.children().each((_, el) => {
      const $el = $(el);
      if ($el.text().trim().length > 0) {
        blocks.push($el.toString());
      }
    });
    return blocks;
  }

  private removeComments($: cheerio.CheerioAPI) {
    $("*").contents().each((_, node) => {
      if (node.type === "comment") {
        $(node).remove();
      }
    });
  }

  private removeUnwantedTags($: cheerio.CheerioAPI) {
    this.excludedTags.forEach((tag) => {
      $(tag).remove();
    });
  }

  private pruneTree($: cheerio.CheerioAPI, node: Element) {
    if (!node || node.type !== "tag") return;

    const $node = $(node);
    const textLen = $node.text().trim().length;
    const htmlContent = $node.toString();
    const tagLen = htmlContent.length;

    // sum of <a> direct text
    let linkTextLen = 0;
    $node.find("a").each((_, a) => {
      linkTextLen += $(a).text().length;
    });

    const score = this.computeCompositeScore($, node, textLen, tagLen, linkTextLen);
    const remove = this.shouldRemoveNode($node, score, textLen, tagLen, linkTextLen);

    if (remove) {
      $node.remove();
    } else {
      $node.children().each((_, child) => {
        this.pruneTree($, child);
      });
    }
  }

  private shouldRemoveNode(
    $node: cheerio.Cheerio<Element>,
    score: number,
    textLen: number,
    tagLen: number,
    linkTextLen: number
  ): boolean {
    if (this.thresholdType === "fixed") {
      return score < this.threshold;
    } else {
      // dynamic
      const tagName = $node.get(0)?.tagName.toLowerCase() || "";
      const tagImp = this.tagImportance[tagName] ?? 0.7;
      const textRatio = tagLen > 0 ? textLen / tagLen : 0;
      const linkRatio = textLen > 0 ? linkTextLen / textLen : 1;

      let dynamicThreshold = this.threshold;
      if (tagImp > 1) dynamicThreshold *= 0.8;
      if (textRatio > 0.4) dynamicThreshold *= 0.9;
      if (linkRatio > 0.6) dynamicThreshold *= 1.2;

      return score < dynamicThreshold;
    }
  }

  private computeCompositeScore(
    $: cheerio.CheerioAPI,
    node: Element,
    textLen: number,
    tagLen: number,
    linkTextLen: number
  ): number {
    // If there's a minWordThreshold, check it
    if (this.minWordThreshold) {
      const wc = (($(node).text() || "").split(/\s+/).length);
      if (wc < this.minWordThreshold) {
        return -1.0; // forced removal
      }
    }

    let score = 0;
    let totalWeight = 0;

    // text_density
    if (this.metricConfig.text_density) {
      const density = tagLen > 0 ? textLen / tagLen : 0;
      score += this.metricWeights.text_density * density;
      totalWeight += this.metricWeights.text_density;
    }

    // link_density
    if (this.metricConfig.link_density) {
      const density = textLen > 0 ? 1 - (linkTextLen / textLen) : 1;
      score += this.metricWeights.link_density * density;
      totalWeight += this.metricWeights.link_density;
    }

    // tag_weight
    if (this.metricConfig.tag_weight) {
      const tagName = node.tagName?.toLowerCase() || "";
      const tw = this.tagWeights[tagName] ?? 0.5;
      score += this.metricWeights.tag_weight * tw;
      totalWeight += this.metricWeights.tag_weight;
    }

    // class_id_weight
    if (this.metricConfig.class_id_weight) {
      const classScore = this.computeClassIdWeight($, node);
      score += this.metricWeights.class_id_weight * Math.max(0, classScore);
      totalWeight += this.metricWeights.class_id_weight;
    }

    // text_length
    if (this.metricConfig.text_length) {
      const val = Math.log(textLen + 1);
      score += this.metricWeights.text_length * val;
      totalWeight += this.metricWeights.text_length;
    }

    return totalWeight ? score / totalWeight : 0;
  }

  private computeClassIdWeight($: cheerio.CheerioAPI, node: Element): number {
    let classIdScore = 0;
    const $node = $(node);
    const className = $node.attr("class") || "";
    const idName = $node.attr("id") || "";
    const combined = className + " " + idName;

    if (this.negativePatterns.test(combined)) {
      classIdScore -= 0.5;
    }
    return classIdScore;
  }
}