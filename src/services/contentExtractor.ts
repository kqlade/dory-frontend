// src/services/contentExtractor.ts

import { DefaultMarkdownGenerator } from "../html2text/markdownGenerator"; 
import { PruningContentFilter } from "../html2text/content_filter_strategy";
import { LangChainMarkdownChunking } from "../chunking/chunkingStrategy";
import { sendFullDocument } from "../api/client"; 
import { DocumentMetadata } from "../api/types";
import { USE_FIT_MARKDOWN } from "../api/config";

console.log("DORY: Content script loaded successfully");

async function getLastVisitTime(url: string): Promise<number> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'GET_VISIT_TIME', url }, (response) => {
      resolve(response.visitTime);
    });
  });
}

async function extractAndSendContent(): Promise<void> {
  try {
    console.log("DORY: Starting content extraction");
    const currentUrl = window.location.href;
    console.log("DORY: Current URL:", currentUrl);

    // Get the actual last visit time from service worker
    const lastVisitTime = await getLastVisitTime(currentUrl);

    // 1) Get the raw HTML
    const rawHTMLString = document.body?.innerHTML;
    if (!rawHTMLString) {
      throw new Error("No document body or empty innerHTML");
    }

    // 2) Create a content filter
    const filter = new PruningContentFilter(undefined, 5, "dynamic", 0.5, "english");

    // 3) Create DefaultMarkdownGenerator for 'fitMarkdown'
    const mdGenerator = new DefaultMarkdownGenerator(filter, {
      body_width: 80,
    });

    // 4) Generate the Markdown 
    const result = mdGenerator.generateMarkdown(
      rawHTMLString,
      window.location.href,
      { body_width: 80 },
      undefined,
      true
    );

    console.log("DORY: Markdown generated successfully");

    // 5) Select source markdown based on config
    const sourceMarkdown = USE_FIT_MARKDOWN 
      ? result.fitMarkdown 
      : (result.markdownWithCitations || result.rawMarkdown);
    
    if (!sourceMarkdown) {
      throw new Error("Failed to generate markdown");
    }

    // 6) Chunk the selected markdown
    const chunker = new LangChainMarkdownChunking(1000, 200);
    const chunks = await chunker.chunk(sourceMarkdown);
    console.log("DORY: Markdown chunked into", chunks.length, "chunks");

    // 7) Prepare metadata
    const metadata: DocumentMetadata = {
      title: document.title || 'Untitled',
      url: currentUrl,
      visitedAt: lastVisitTime,
      processedAt: Date.now(),
      status: 'processed'
    };

    // 8) Send full document to backend
    const docId = await sendFullDocument(
      sourceMarkdown,
      chunks,
      metadata
    );

    console.log("DORY: Document stored successfully, docId:", docId);

    // 9) Notify service worker of completion
    chrome.runtime.sendMessage({
      type: "EXTRACTION_COMPLETE",
      data: {
        url: currentUrl,
        docId,
        metadata,
        chunkCount: chunks.length
      },
    });

    console.log("DORY: EXTRACTION_COMPLETE message sent successfully");
  } catch (error) {
    console.error("DORY: Extraction failed:", error);
    if (error instanceof Error) {
      console.log("DORY: Error details:", {
        name: error.name,
        message: error.message,
        stack: error.stack,
      });
    } else {
      console.log("DORY: Non-Error object thrown:", error);
    }

    // Create failed metadata
    const failedMetadata: DocumentMetadata = {
      title: document.title || 'Untitled',
      url: window.location.href,
      visitedAt: await getLastVisitTime(window.location.href),
      processedAt: Date.now(),
      status: 'failed'
    };

    chrome.runtime.sendMessage({
      type: "EXTRACTION_ERROR",
      error: error instanceof Error ? error.message : "Unknown error occurred",
      metadata: failedMetadata
    });
    console.log("DORY: EXTRACTION_ERROR message sent");
  }
}

// Wait for DOM to be ready before starting extraction
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    console.log("DORY: DOM Content Loaded, waiting 1 second before starting extraction");
    setTimeout(() => {
      console.log("DORY: Starting extraction after delay");
      extractAndSendContent();
    }, 1000);
  });
} else {
  console.log("DORY: Document already loaded, waiting 1 second before starting extraction");
  setTimeout(() => {
    console.log("DORY: Starting extraction after delay");
    extractAndSendContent();
  }, 1000);
}