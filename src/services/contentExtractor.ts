// contentExtractor.ts

import { DefaultMarkdownGenerator } from "../html2text/markdownGenerator";
import { PruningContentFilter } from "../html2text/content_filter_strategy";

// Import the chunker of your choice from chunkingStrategies
import { LangChainMarkdownChunking } from "../chunking/chunkingStrategy";

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

    // 2) Create a content filter if desired. For example, a pruning filter:
    const filter = new PruningContentFilter(/* userQuery= */ undefined, 5, "dynamic", 0.5, "english");

    // 3) Create a DefaultMarkdownGenerator, passing the filter
    const mdGenerator = new DefaultMarkdownGenerator(filter, {
      body_width: 80,
      // e.g. ignore_images: false, protect_links: true, etc.
    });

    // 4) Generate the Markdown
    const result = mdGenerator.generateMarkdown(
      rawHTMLString,
      window.location.href, // baseUrl
      { body_width: 80 },   // optional HTML2Text options
      undefined,            // optional content filter
      true                  // citations = true
    );

    // result is a MarkdownGenerationResult with:
    // rawMarkdown, markdownWithCitations, referencesMarkdown, fitMarkdown, fitHtml

    console.log("DORY: Markdown generated successfully");
    console.log("DORY: rawMarkdown is:", result.rawMarkdown);
    console.log("DORY: referencesMarkdown is:", result.referencesMarkdown);
    console.log("DORY: fitMarkdown is:", result.fitMarkdown);

    // 5) Decide which field to send back
    const regularMarkdown = result.markdownWithCitations || result.rawMarkdown;
    const fitMarkdown = result.fitMarkdown || "";

    // 6) Optionally chunk the fitMarkdown further
    //    For example, using LangChainMarkdownChunking to produce structured chunks
    let fitMarkdownChunks: string[] = [];
    if (fitMarkdown) {
      // Create your chunker
      const chunker = new LangChainMarkdownChunking(1000, 200);
      // Because .chunk(...) is async, we await it
      fitMarkdownChunks = await chunker.chunk(fitMarkdown);
      console.log("DORY: fitMarkdown chunked into", fitMarkdownChunks.length, "chunks");
    }

    // 7) Send results back to the extension
    console.log("DORY: Sending results via chrome.runtime.sendMessage");
    console.log("DORY: Regular markdown is:", regularMarkdown);
    console.log("DORY: Fit markdown is:", fitMarkdown);
    console.log("DORY: Fit markdown chunks are:", fitMarkdownChunks);

    chrome.runtime.sendMessage({
      type: "EXTRACTION_COMPLETE",
      data: {
        url: window.location.href,
        regularMarkdown,
        fitMarkdown,
        fitMarkdownChunks,
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