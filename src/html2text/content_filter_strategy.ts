import * as cheerio from "cheerio";
import type { Element } from "domhandler";

/**************************************************************************
 * Utility function that mirrors "clean_tokens" from Python
 **************************************************************************/
function cleanTokens(tokens: string[]): string[] {
  // Remove empty/short tokens, punctuation-only tokens, etc.
  return tokens.filter((t) => {
    const trimmed = t.trim();
    if (!trimmed) return false;
    // Skip tokens that are too short unless they match a basic alphanumeric pattern.
    if (trimmed.length < 2 && !/^[a-z0-9]$/i.test(trimmed)) return false;
    return true;
  });
}

/**************************************************************************
 * Abstract base: RelevantContentFilter
 * 
 * Provides shared functionality like extracting a query (if needed) and
 * determining if an element should be excluded.
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
    // Negative patterns for class or id that might indicate non-content areas
    this.negativePatterns = /nav|menu|footer|header|sidebar|aside|ads|comment|promo|advert|social|share|popup|modal|banner|related|widget|signup|author-bio|pagination|breadcrumb|cookie|flyout/i;
    this.minWordCount = 2;
  }

  /**
   * Abstract method to filter content.
   * Subclasses must implement this.
   */
  public abstract filterContent(html: string): string[];

  /**
   * Extracts a page query based on key elements.
   * If userQuery is provided, it takes precedence.
   */
  protected extractPageQuery($: cheerio.CheerioAPI, $body: cheerio.Cheerio<Element>): string {
    if (this.userQuery) {
      return this.userQuery;
    }

    const parts: string[] = [];

    // Title
    const title = $("title").text();
    if (title) parts.push(title);

    // First header
    const h1 = $("h1").text();
    if (h1) parts.push(h1);

    // Meta keywords/description
    for (const metaName of ["keywords", "description"]) {
      const meta = $(`meta[name='${metaName}']`);
      if (meta && meta.attr("content")) {
        parts.push(meta.attr("content")!);
      }
    }

    // Fallback: find the first paragraph with more than 150 characters
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
   * Determines whether an element should be excluded based on tag, class, or id.
   */
  protected isExcluded($el: cheerio.Cheerio<Element>): boolean {
    const node = $el.get(0);
    if (!node || node.type !== "tag") return false;
    const tagName = node.tagName.toLowerCase();

    // Exclude based on tag name
    if (this.excludedTags.has(tagName)) return true;

    // Exclude based on class or id patterns
    const className = $el.attr("class") || "";
    const idName = $el.attr("id") || "";
    const combined = (className + " " + idName).trim();
    return this.negativePatterns.test(combined);
  }

  /**
   * Cleans an element by returning its outerHTML.
   */
  protected cleanElement($node: cheerio.Cheerio<Element>): string {
    return $node.toString();
  }
}

/**************************************************************************
 * PruningContentFilter
 * 
 * This filter mimics a reader mode by recursively traversing the DOM,
 * scoring elements based on several metrics (text density, link density,
 * tag importance, etc.), and pruning elements that are unlikely to be
 * part of the main content.
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

    // Tag importance values (tweak based on your needs)
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

    // Configure which metrics to use when scoring elements
    this.metricConfig = {
      text_density: true,
      link_density: true,
      tag_weight: true,
      class_id_weight: true,
      text_length: true,
    };

    // Weights for each metric
    this.metricWeights = {
      text_density: 0.4,
      link_density: 0.2,
      tag_weight: 0.2,
      class_id_weight: 0.1,
      text_length: 0.1,
    };

    // Weights for specific tags
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
      // If no body tag is present, wrap the HTML inside one
      const $$ = cheerio.load(`<body>${html}</body>`);
      $body = $$("body");
    }

    // Remove comments and unwanted tags (nav, footer, etc.)
    this.removeComments($);
    this.removeUnwantedTags($);

    // Recursively prune the DOM tree
    const bodyEl = $body.get(0);
    if (bodyEl) {
      this.pruneTree($, bodyEl);
    }

    // Collect and return the cleaned HTML blocks
    const blocks: string[] = [];
    $body.children().each((_, el) => {
      const $el = $(el);
      if ($el.text().trim().length > 0) {
        blocks.push($el.toString());
      }
    });
    return blocks;
  }

  /**
   * Removes all comment nodes from the DOM.
   */
  private removeComments($: cheerio.CheerioAPI) {
    $("*").contents().each((_, node) => {
      if (node.type === "comment") {
        $(node).remove();
      }
    });
  }

  /**
   * Removes unwanted tags (like nav, footer, etc.) from the DOM.
   */
  private removeUnwantedTags($: cheerio.CheerioAPI) {
    this.excludedTags.forEach((tag) => {
      $(tag).remove();
    });
  }

  /**
   * Recursively prunes the DOM tree based on composite scores.
   */
  private pruneTree($: cheerio.CheerioAPI, node: Element) {
    if (!node || node.type !== "tag") return;

    const $node = $(node);
    const textLen = $node.text().trim().length;
    const htmlContent = $node.toString();
    const tagLen = htmlContent.length;

    // Sum length of text inside links (<a> tags)
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

  /**
   * Determines if an element should be removed based on its score and a threshold.
   */
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
      // For dynamic thresholds, adjust based on tag importance and ratios.
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

  /**
   * Computes a composite score for a node using multiple heuristics.
   */
  private computeCompositeScore(
    $: cheerio.CheerioAPI,
    node: Element,
    textLen: number,
    tagLen: number,
    linkTextLen: number
  ): number {
    // Force removal if word count is too low.
    if (this.minWordThreshold) {
      const wc = (($(node).text() || "").split(/\s+/).length);
      if (wc < this.minWordThreshold) {
        return -1.0;
      }
    }

    let score = 0;
    let totalWeight = 0;

    // Text density: ratio of text length to tag length.
    if (this.metricConfig.text_density) {
      const density = tagLen > 0 ? textLen / tagLen : 0;
      score += this.metricWeights.text_density * density;
      totalWeight += this.metricWeights.text_density;
    }

    // Link density: proportion of text not within links.
    if (this.metricConfig.link_density) {
      const density = textLen > 0 ? 1 - (linkTextLen / textLen) : 1;
      score += this.metricWeights.link_density * density;
      totalWeight += this.metricWeights.link_density;
    }

    // Tag weight: importance of the specific tag.
    if (this.metricConfig.tag_weight) {
      const tagName = node.tagName?.toLowerCase() || "";
      const tw = this.tagWeights[tagName] ?? 0.5;
      score += this.metricWeights.tag_weight * tw;
      totalWeight += this.metricWeights.tag_weight;
    }

    // Class and ID weight: penalize nodes with negative class/id patterns.
    if (this.metricConfig.class_id_weight) {
      const classScore = this.computeClassIdWeight($, node);
      score += this.metricWeights.class_id_weight * Math.max(0, classScore);
      totalWeight += this.metricWeights.class_id_weight;
    }

    // Text length: longer text gets a boost (using logarithmic scaling).
    if (this.metricConfig.text_length) {
      const val = Math.log(textLen + 1);
      score += this.metricWeights.text_length * val;
      totalWeight += this.metricWeights.text_length;
    }

    return totalWeight ? score / totalWeight : 0;
  }

  /**
   * Computes a small penalty based on class and id attributes.
   */
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