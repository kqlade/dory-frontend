// src/services/contentExtractor.ts

import { DefaultMarkdownGenerator } from "../html2text/markdownGenerator"; 
import { PruningContentFilter } from "../html2text/content_filter_strategy";

// 1) chunking
import { LangChainMarkdownChunking } from "../chunking/chunkingStrategy";

// 2) embedding via new backend
import { getEmbeddings } from "../api/client"; 

console.log("DORY: Content script loaded successfully");

async function extractAndSendContent(): Promise<void> {
  try {
    console.log("DORY: Starting content extraction");
    console.log("DORY: Current URL:", window.location.href);

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

    // 5) We'll use the 'fitMarkdown' for chunking
    const regularMarkdown = result.markdownWithCitations || result.rawMarkdown;
    const fitMarkdown = result.fitMarkdown || "";

    // 6) Further chunk that 'fitMarkdown' with a Markdown chunker
    let fitMarkdownChunks: string[] = [];
    if (fitMarkdown) {
      const chunker = new LangChainMarkdownChunking(1000, 200);
      fitMarkdownChunks = await chunker.chunk(fitMarkdown);
      console.log("DORY: fitMarkdown chunked into", fitMarkdownChunks.length, "chunks");
    }

    // 7) EMBED the chunks using your backend
    //    Instead of calling OpenAI directly, use your new getEmbeddings() from client.ts
    let fitMarkdownEmbeddings: number[][] = [];
    if (fitMarkdownChunks.length > 0) {
      fitMarkdownEmbeddings = await getEmbeddings(fitMarkdownChunks);
      console.log("DORY: Created embeddings for fitMarkdownChunks", fitMarkdownEmbeddings.length);
    }

    // 8) Now you have the chunks & embeddings from the backend
    //    Send them to the service worker or store them in your vector DB, etc.
    console.log("DORY: Sending results via chrome.runtime.sendMessage");
    chrome.runtime.sendMessage({
      type: "EXTRACTION_COMPLETE",
      data: {
        url: window.location.href,
        regularMarkdown,
        fitMarkdown,
        fitMarkdownChunks,
        fitMarkdownEmbeddings,
        metadata: {
          title: document.title,
          url: window.location.href,
          extractionTimestamp: new Date().toISOString(),
        },
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

    chrome.runtime.sendMessage({
      type: "EXTRACTION_ERROR",
      error: error instanceof Error ? error.message : "Unknown error occurred",
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