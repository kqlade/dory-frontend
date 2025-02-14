// chunkingStrategies.ts

import { MarkdownTextSplitter } from "langchain/text_splitter";

/*************************************************************
 * Abstract base class: ChunkingStrategy
 *************************************************************/
export abstract class ChunkingStrategy {
  public abstract chunk(text: string): Promise<string[]> | string[];
}

/*************************************************************
 * LangChainMarkdownChunking
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