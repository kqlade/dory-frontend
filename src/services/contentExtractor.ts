// contentExtractor.ts (updated, no domCleaner required)

import { HTML2Text } from "../html2text/html2text"; // adjust to correct path for your new HTML2Text file

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

    // 2) Convert HTML to Markdown using HTML2Text
    console.log("DORY: Generating Markdown via HTML2Text");
    const converter = new HTML2Text({
      baseurl: window.location.href,
      bodywidth: 80, // or whatever body width you prefer
    });
    const markdown = converter.handle(rawHTMLString);
    console.log("DORY: Markdown generated successfully");

    // 3) Send results back to the extension
    console.log("DORY: Sending results via chrome.runtime.sendMessage");
    chrome.runtime.sendMessage({
      type: "EXTRACTION_COMPLETE",
      data: {
        url: window.location.href,
        markdown,
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
    console.log(
      "DORY: DOM Content Loaded, waiting 1 second before starting extraction"
    );
    setTimeout(() => {
      console.log("DORY: Starting extraction after delay");
      extractAndSendContent();
    }, 1000);
  });
} else {
  console.log(
    "DORY: Document already loaded, waiting 1 second before starting extraction"
  );
  setTimeout(() => {
    console.log("DORY: Starting extraction after delay");
    extractAndSendContent();
  }, 1000);
}