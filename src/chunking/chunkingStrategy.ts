// chunkingStrategies.ts

import { split as sentenceSplit } from "sentence-splitter";
import { segment } from "text-segmentation";
import { WordTokenizer } from "natural";
import * as stopwords from "natural/lib/natural/util/stopwords_en";
import * as punctuation from "natural/lib/natural/util/tokenizer_punc";
import { MarkdownTextSplitter } from "langchain/text_splitter";

/**
 * A small "Counter" class to replicate Python's collections.Counter usage,
 * for counting frequency of words (in topic-based segmentation).
 */
class Counter<T> {
  private counts: Map<T, number>;
  constructor() {
    this.counts = new Map();
  }

  public increment(item: T, n: number = 1) {
    const current = this.counts.get(item) || 0;
    this.counts.set(item, current + n);
  }

  public mostCommon(k?: number): Array<[T, number]> {
    const arr = Array.from(this.counts.entries());
    arr.sort((a, b) => b[1] - a[1]);
    if (typeof k === "number") {
      return arr.slice(0, k);
    }
    return arr;
  }
}

/*************************************************************
 * Abstract base class: ChunkingStrategy
 *************************************************************/
export abstract class ChunkingStrategy {
  public abstract chunk(text: string): Promise<string[]> | string[];
}

/*************************************************************
 * 1) IdentityChunking
 *************************************************************/
export class IdentityChunking extends ChunkingStrategy {
  public chunk(text: string): string[] {
    // Return the entire text as one chunk
    return [text];
  }
}

/*************************************************************
 * 2) RegexChunking
 * Splits text by a list of regex patterns, default = [/\n\n/].
 *************************************************************/
export class RegexChunking extends ChunkingStrategy {
  private patterns: RegExp[];

  constructor(patterns?: (string | RegExp)[]) {
    super();
    if (!patterns || patterns.length === 0) {
      // Default split pattern = double newline
      patterns = [/\n\n/];
    }
    // Convert any string patterns to RegExp
    this.patterns = patterns.map((pat) =>
      typeof pat === "string" ? new RegExp(pat, "g") : pat
    );
  }

  public chunk(text: string): string[] {
    let paragraphs: string[] = [text];
    for (const pattern of this.patterns) {
      const newParagraphs: string[] = [];
      for (const paragraph of paragraphs) {
        const splitted = paragraph.split(pattern);
        newParagraphs.push(...splitted);
      }
      paragraphs = newParagraphs;
    }
    return paragraphs;
  }
}

/*************************************************************
 * 3) NlpSentenceChunking
 * Uses 'sentence-splitter' to approximate NLTK's 'sent_tokenize'.
 *************************************************************/
export class NlpSentenceChunking extends ChunkingStrategy {
  constructor() {
    super();
  }

  public chunk(text: string): string[] {
    const result = sentenceSplit(text);
    const sentences = result
      .filter((seg) => seg.type === "Sentence")
      .map((seg) => seg.raw.trim())
      .filter((v: string) => v.length > 0);

    return sentences;
  }
}

/*************************************************************
 * 4) TopicSegmentationChunking
 * Using text-segmentation for topic-based text segmentation
 *************************************************************/
export class TopicSegmentationChunking extends ChunkingStrategy {
  private numKeywords: number;
  private minSegmentLength: number;

  constructor(numKeywords: number = 3, minSegmentLength: number = 100) {
    super();
    this.numKeywords = numKeywords;
    this.minSegmentLength = minSegmentLength;
  }

  public chunk(text: string): string[] {
    // Use text-segmentation's segment function
    const segments = segment(text, {
      minLength: this.minSegmentLength,
      // Additional options if needed
    });
    return segments;
  }

  public extract_keywords(text: string): string[] {
    const tokenizer = new WordTokenizer();
    const tokens = tokenizer.tokenize(text.toLowerCase());

    const validTokens = tokens.filter((tok) => {
      if (stopwords.includes(tok)) return false;
      if (punctuation.PUNCTUATIONS.includes(tok)) return false;
      return tok.trim().length > 0;
    });

    const freq = new Counter<string>();
    for (const t of validTokens) {
      freq.increment(t);
    }
    const sorted = freq.mostCommon(this.numKeywords);
    return sorted.map(([word]) => word);
  }

  public chunk_with_topics(text: string): Array<[string, string[]]> {
    const segments = this.chunk(text);
    return segments.map((seg) => [seg, this.extract_keywords(seg)]);
  }
}

/*************************************************************
 * 5) FixedLengthWordChunking
 *************************************************************/
export class FixedLengthWordChunking extends ChunkingStrategy {
  private chunkSize: number;

  constructor(chunkSize: number = 100) {
    super();
    this.chunkSize = chunkSize;
  }

  public chunk(text: string): string[] {
    const words = text.split(/\s+/);
    const results: string[] = [];

    for (let i = 0; i < words.length; i += this.chunkSize) {
      const slice = words.slice(i, i + this.chunkSize);
      results.push(slice.join(" "));
    }
    return results;
  }
}

/*************************************************************
 * 6) SlidingWindowChunking
 *  Overlapping windows with a 'window_size' and 'step'
 *************************************************************/
export class SlidingWindowChunking extends ChunkingStrategy {
  private windowSize: number;
  private step: number;

  constructor(windowSize: number = 100, step: number = 50) {
    super();
    this.windowSize = windowSize;
    this.step = step;
  }

  public chunk(text: string): string[] {
    const words = text.split(/\s+/);
    const chunks: string[] = [];

    if (words.length <= this.windowSize) {
      return [text];
    }

    let i = 0;
    for (; i <= words.length - this.windowSize; i += this.step) {
      const slice = words.slice(i, i + this.windowSize);
      chunks.push(slice.join(" "));
    }

    if (i < words.length) {
      const leftoverStart = Math.max(words.length - this.windowSize, 0);
      chunks.push(words.slice(leftoverStart).join(" "));
    }
    return chunks;
  }
}

/*************************************************************
 * 7) OverlappingWindowChunking
 *  window_size=1000, overlap=100
 *************************************************************/
export class OverlappingWindowChunking extends ChunkingStrategy {
  private windowSize: number;
  private overlap: number;

  constructor(windowSize: number = 1000, overlap: number = 100) {
    super();
    this.windowSize = windowSize;
    this.overlap = overlap;
  }

  public chunk(text: string): string[] {
    const words = text.split(/\s+/);
    if (words.length <= this.windowSize) {
      return [text];
    }

    const chunks: string[] = [];
    let start = 0;
    while (start < words.length) {
      const end = start + this.windowSize;
      const slice = words.slice(start, end);
      chunks.push(slice.join(" "));

      if (end >= words.length) {
        break;
      }
      start = end - this.overlap;
      if (start < 0) start = 0;
    }
    return chunks;
  }
}

/*************************************************************
 * 8) LangChainMarkdownChunking (NEW)
 * Uses langchain's MarkdownTextSplitter to chunk markdown
 *************************************************************/
export class LangChainMarkdownChunking extends ChunkingStrategy {
  private chunkSize: number;
  private chunkOverlap: number;

  constructor(chunkSize = 1000, chunkOverlap = 200) {
    super();
    this.chunkSize = chunkSize;
    this.chunkOverlap = chunkOverlap;
  }

  /**
   * Because MarkdownTextSplitter returns an array of Document,
   * each with `pageContent`, we'll map them to strings.
   */
  public async chunk(text: string): Promise<string[]> {
    const splitter = new MarkdownTextSplitter({
      chunkSize: this.chunkSize,
      chunkOverlap: this.chunkOverlap,
    });
    const docs = await splitter.splitText(text);
    return docs;
  }
}