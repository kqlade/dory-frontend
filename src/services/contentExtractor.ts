// src/services/contentExtractor.ts

import { DefaultMarkdownGenerator } from "../html2text/markdownGenerator";
import { PruningContentFilter } from "../html2text/content_filter_strategy";
import { sendFullDocument } from "../api/client";
import { DocumentMetadata } from "../api/types";
import { USE_FIT_MARKDOWN } from "../api/config";
import { QUEUE_CONFIG } from "../background/config";

console.log("DORY: Content script loaded successfully");

/**
 * Checks if we're in a valid Chrome extension context.
 */
function isExtensionContextValid(): boolean {
  return !!(chrome?.runtime?.id);
}

/**
 * A basic Promise-based delay utility.
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Wait for the DOM to become 'idle' using a MutationObserver.
 * 
 * - We start observing for DOM changes.
 * - Every time a DOM mutation occurs, we reset an "idle check" timer.
 * - If we go DOM_IDLE_CHECK_DELAY_MS ms without new mutations, we resolve.
 * - If total wait time exceeds DOM_IDLE_TIMEOUT_MS, we resolve anyway.
 */
function waitForDomIdle(
  maxTimeoutMs: number = QUEUE_CONFIG.DOM_IDLE_TIMEOUT_MS,
  idleCheckDelayMs: number = QUEUE_CONFIG.DOM_IDLE_CHECK_DELAY_MS
): Promise<void> {
  return new Promise<void>((resolve) => {
    let observer: MutationObserver | null = null;
    let lastMutationTime = Date.now();

    // If we haven't seen a mutation in `idleCheckDelayMs` ms, the DOM is idle.
    const checkIdle = () => {
      if (Date.now() - lastMutationTime >= idleCheckDelayMs) {
        if (observer) {
          observer.disconnect();
        }
        resolve();
      }
    };

    // Set up the observer to watch for DOM changes.
    observer = new MutationObserver(() => {
      lastMutationTime = Date.now();
      // Schedule an idle check in idleCheckDelayMs.
      setTimeout(checkIdle, idleCheckDelayMs);
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: false
    });

    // Absolute fallback: stop waiting after maxTimeoutMs
    setTimeout(() => {
      if (observer) {
        observer.disconnect();
      }
      resolve();
    }, maxTimeoutMs);
  });
}

/**
 * Get the last time this page (URL) was visited, as reported by the extension.
 */
async function getLastVisitTime(url: string): Promise<number> {
  if (!isExtensionContextValid()) {
    return Date.now();
  }
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: "GET_VISIT_TIME", url },
      (response) => {
        resolve(response?.visitTime || Date.now());
      }
    );
  });
}

/**
 * Main extraction logic.
 */
async function extractAndSendContent(retryCount = 0): Promise<void> {
  // Preliminary checks
  if (!isExtensionContextValid()) {
    console.error("DORY: Extension context invalid - cannot start extraction");
    return;
  }
  if (!document.body) {
    console.error("DORY: Document body not available");
    return;
  }

  const currentUrl = window.location.href;

  try {
    // 1. Wait for DOM to become idle
    await waitForDomIdle();

    // 2. Extract raw HTML
    const rawHTMLString = document.body.innerHTML || "";
    if (!rawHTMLString) {
      throw new Error("Empty innerHTML");
    }

    // 3. Generate Markdown
    const filter = new PruningContentFilter(
      undefined,
      5,
      "dynamic",
      0.5,
      "english"
    );
    const mdGenerator = new DefaultMarkdownGenerator(filter, { body_width: 80 });

    const result = mdGenerator.generateMarkdown(
      rawHTMLString,
      currentUrl,
      { body_width: 80 },
      undefined,
      true
    );

    const sourceMarkdown = USE_FIT_MARKDOWN
      ? result.fitMarkdown
      : result.markdownWithCitations || result.rawMarkdown;

    if (!sourceMarkdown) {
      throw new Error("Failed to generate markdown");
    }

    // 4. Get last visit time
    const lastVisitTime = await getLastVisitTime(currentUrl);

    // 5. Check again for extension validity before sending
    if (!isExtensionContextValid()) {
      return;
    }

    // 6. Prepare metadata and send
    const metadata: DocumentMetadata = {
      title: document.title || "Untitled",
      url: currentUrl,
      visitedAt: lastVisitTime,
      processedAt: Date.now(),
      status: "processed",
    };

    const docId = await sendFullDocument(sourceMarkdown, metadata);

    // 7. Notify extension that extraction is complete
    if (isExtensionContextValid()) {
      chrome.runtime.sendMessage({
        type: "EXTRACTION_COMPLETE",
        data: {
          url: currentUrl,
          docId,
          metadata
        },
      });
    }
  } catch (error) {
    console.error("DORY: Extraction failed:", error);

    // 8. Retry logic
    if (retryCount < QUEUE_CONFIG.MAX_RETRIES) {
      console.log(
        `DORY: Retrying extraction (${retryCount + 1}/${QUEUE_CONFIG.MAX_RETRIES})`
      );
      await delay(QUEUE_CONFIG.RETRY_DELAY_MS);
      return extractAndSendContent(retryCount + 1);
    }

    // If retries are exhausted or context is invalid, send an error message
    if (isExtensionContextValid()) {
      chrome.runtime.sendMessage({
        type: "EXTRACTION_ERROR",
        error: error instanceof Error ? error.message : "Unknown error occurred",
        metadata: {
          title: document.title || "Untitled",
          url: window.location.href,
          visitedAt: Date.now(),
          processedAt: Date.now(),
          status: "failed",
        },
      });
    }
  }
}

/**
 * Sets a safety timer. If extraction takes too long, we send an error message.
 */
function setupExtractionTimeout(): void {
  const timeoutId = setTimeout(() => {
    if (isExtensionContextValid()) {
      chrome.runtime.sendMessage({
        type: "EXTRACTION_ERROR",
        error: "Extraction timed out",
        metadata: {
          title: document.title || "Untitled",
          url: window.location.href,
          visitedAt: Date.now(),
          processedAt: Date.now(),
          status: "failed",
        },
      });
    }
  }, QUEUE_CONFIG.PROCESSING_TIMEOUT_MS);

  // Clear the timeout if the page unloads
  window.addEventListener("unload", () => clearTimeout(timeoutId));
}

/**
 * Initialization: set up timeouts and start extraction when DOM is ready.
 */
function init(): void {
  setupExtractionTimeout();
  extractAndSendContent();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}