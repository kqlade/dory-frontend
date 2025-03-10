// src/services/contentExtractor.ts

import { DefaultMarkdownGenerator } from "../html2text/markdownGenerator";
import { PruningContentFilter } from "../html2text/content_filter_strategy";
import { USE_FIT_MARKDOWN, QUEUE_CONFIG } from "../config";
import { createMessage, MessageType, ExtractionData } from "./messageSystem";
import { sendDoryEvent, EventTypes } from "./eventStreamer";
import { getCurrentSessionId } from "./sessionManager";

console.log("[ContentExtractor] Starting initialization...");

// Store the current page and visit IDs for extraction context
let currentPageId: string | null = null;
let currentVisitId: string | null = null;

/**
 * Set the current page and visit context for extraction
 */
export function setExtractionContext(pageId: string, visitId: string): void {
  currentPageId = pageId;
  currentVisitId = visitId;
}

/**
 * Extraction-related configuration pulled from QUEUE_CONFIG:
 * - DOM_IDLE_TIMEOUT_MS, DOM_IDLE_CHECK_DELAY_MS: used to detect a "stable" DOM.
 * - PROCESSING_TIMEOUT_MS: the maximum time we allow for extraction before declaring a timeout.
 * - RETRY_DELAY_MS, MAX_RETRIES: controls how we retry failed extractions.
 */
const DOM_IDLE_TIMEOUT_MS = QUEUE_CONFIG.DOM_IDLE_TIMEOUT_MS;
const DOM_IDLE_CHECK_DELAY_MS = QUEUE_CONFIG.DOM_IDLE_CHECK_DELAY_MS;
const PROCESSING_TIMEOUT_MS = QUEUE_CONFIG.PROCESSING_TIMEOUT_MS;
const RETRY_DELAY_MS = QUEUE_CONFIG.RETRY_DELAY_MS;
const MAX_RETRIES = QUEUE_CONFIG.MAX_RETRIES;

/** Markdown generator defaults */
const MARKDOWN_BODY_WIDTH = 80;
const CONTENT_FILTER_MIN_BLOCKS = 5;
const CONTENT_FILTER_STRATEGY = "dynamic";
const CONTENT_FILTER_THRESHOLD = 0.5;
const CONTENT_FILTER_LANGUAGE = "english";

/** Default metadata values if none are provided */
const DEFAULT_TITLE = "Untitled";
const DEFAULT_STATUS = "processed";

/** Track the extraction timeout globally */
let extractionTimeoutId: ReturnType<typeof setTimeout> | null = null;

/**
 * Waits for the DOM to be "idle" — meaning no new mutations for
 * `idleCheckDelayMs`, or until `maxTimeoutMs` has passed.
 */
function waitForDomIdle(
  maxTimeoutMs = DOM_IDLE_TIMEOUT_MS,
  idleCheckDelayMs = DOM_IDLE_CHECK_DELAY_MS
): Promise<void> {
  return new Promise((resolve) => {
    let observer: MutationObserver | null = null;
    let lastMutationTime = Date.now();

    const checkIdle = () => {
      const now = Date.now();
      const timeSinceLastMutation = now - lastMutationTime;

      if (timeSinceLastMutation >= idleCheckDelayMs) {
        if (observer) observer.disconnect();
        resolve();
      }
    };

    // Set up mutation observer to track DOM changes
    observer = new MutationObserver(() => {
      lastMutationTime = Date.now();
    });

    observer.observe(document.body, {
      childList: true,
      attributes: true,
      characterData: true,
      subtree: true,
    });

    // Fallback in case "truly idle" never occurs
    setTimeout(() => {
      if (observer) observer.disconnect();
      resolve();
    }, maxTimeoutMs);

    // Check periodically if we've been idle
    const intervalId = setInterval(() => {
      checkIdle();
    }, Math.min(idleCheckDelayMs / 2, 1000));

    // Clean up interval when we resolve
    setTimeout(() => clearInterval(intervalId), maxTimeoutMs + 100);
  });
}

/** Basic utility to pause code execution. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Main function that does:
 *  1) Wait for DOM idle
 *  2) Generate Markdown
 *  3) Send extracted content via event streaming
 *  4) Retry if extraction fails
 */
async function extractAndSendContent(retryCount = 0): Promise<void> {
  if (!chrome?.runtime?.id) {
    console.error("[ContentExtractor] Extension context invalid - cannot start extraction");
    return;
  }

  if (!document.body) {
    console.error("[ContentExtractor] Document body not available");
    return;
  }

  const currentUrl = window.location.href;

  try {
    // 1) Wait for DOM to stabilize
    await waitForDomIdle();

    // 2) Gather raw HTML
    const rawHTMLString = document.body.innerHTML || "";
    if (!rawHTMLString) throw new Error("Empty innerHTML");

    // 3) Convert HTML -> Markdown
    const filter = new PruningContentFilter(
      undefined,
      CONTENT_FILTER_MIN_BLOCKS,
      CONTENT_FILTER_STRATEGY,
      CONTENT_FILTER_THRESHOLD,
      CONTENT_FILTER_LANGUAGE
    );
    const mdGenerator = new DefaultMarkdownGenerator(filter, {
      body_width: MARKDOWN_BODY_WIDTH,
    });

    const result = mdGenerator.generateMarkdown(
      rawHTMLString,
      currentUrl,
      { body_width: MARKDOWN_BODY_WIDTH },
      undefined,
      true
    );

    const sourceMarkdown = USE_FIT_MARKDOWN
      ? result.fitMarkdown
      : result.markdownWithCitations || result.rawMarkdown;

    if (!sourceMarkdown) throw new Error("Failed to generate markdown");

    const timestamp = Date.now();
    const title = document.title || DEFAULT_TITLE;

    // If we succeed, clear the extraction timeout
    if (extractionTimeoutId !== null) {
      clearTimeout(extractionTimeoutId);
      extractionTimeoutId = null;
    }

    // 4) Notify background that extraction is complete
    const extractionMessage = createMessage<ExtractionData>(MessageType.EXTRACTION_COMPLETE, {
      title: title,
      url: currentUrl,
      timestamp
    });

    await chrome.runtime.sendMessage(extractionMessage).catch((err) => {
      console.error("[ContentExtractor] Error sending extraction data:", err);
      sendExtractionError("SEND_FAILURE", err.message || "Unknown error", currentUrl);
    });

    // 5) Send content extraction event to backend
    const sessionId = await getCurrentSessionId();
    if (sessionId && currentPageId) {
      sendDoryEvent({
        operation: EventTypes.CONTENT_EXTRACTED,
        sessionId: sessionId.toString(),
        timestamp,
        data: {
          pageId: currentPageId,
          visitId: currentVisitId,
          url: currentUrl,
          content: {
            extracted: true,
            title: title,
            markdown: sourceMarkdown,
            metadata: {
              language: CONTENT_FILTER_LANGUAGE
            }
          }
        }
      });
    }

  } catch (error) {
    // If something went wrong, decide whether to retry or emit final failure
    console.error("[ContentExtractor] Extraction failed:", error);

    if (retryCount < MAX_RETRIES) {
      console.log(`[ContentExtractor] Retrying extraction (${retryCount + 1}/${MAX_RETRIES})`);
      await delay(RETRY_DELAY_MS);
      return extractAndSendContent(retryCount + 1);
    }

    // Out of retries => send final extraction error
    const errMsg = error instanceof Error ? error.message : String(error);
    const errStack = error instanceof Error ? error.stack : undefined;
    sendExtractionError("EXTRACTION_FAILED", errMsg, currentUrl, errStack);
  }
}

/**
 * Sends an EXTRACTION_ERROR message to the background in case of
 * unrecoverable or repeated failures.
 */
function sendExtractionError(code: string, message: string, url: string, stack?: string): void {
  if (!chrome?.runtime?.id) return;

  const errorMessage = createMessage(MessageType.EXTRACTION_ERROR, {
    code,
    message,
    stack,
    context: { url },
  });

  chrome.runtime.sendMessage(errorMessage).catch(() => {
    console.error("[ContentExtractor] Failed to send error message");
  });
}

/**
 * Sets up a safety timeout to ensure we don't hang forever
 * if extraction takes too long.
 */
function setupExtractionTimeout(): void {
  // Clear any existing timeout
  if (extractionTimeoutId !== null) {
    clearTimeout(extractionTimeoutId);
  }

  extractionTimeoutId = setTimeout(() => {
    if (chrome?.runtime?.id) {
      sendExtractionError("EXTRACTION_TIMEOUT", "Extraction timed out", window.location.href);
    }
  }, PROCESSING_TIMEOUT_MS);

  // If user unloads the page, clear the timeout
  window.addEventListener("unload", () => {
    if (extractionTimeoutId !== null) {
      clearTimeout(extractionTimeoutId);
      extractionTimeoutId = null;
    }
  });
}

/** Public function to initiate extraction. */
export function extract(): void {
  console.log("[ContentExtractor] Starting content extraction");
  setupExtractionTimeout();
  void extractAndSendContent();
}

// Listen for extraction trigger messages from the background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === MessageType.TRIGGER_EXTRACTION) {
    console.log("[ContentExtractor] Received extraction trigger");
    
    // If the page is already loaded, wait a short delay then extract
    if (document.readyState === 'complete') {
      setTimeout(() => {
        console.log("[ContentExtractor] Page already loaded, starting extraction after delay");
        extract();
      }, 1000); // 1 second delay to ensure any redirects have settled
    } 
    // Otherwise wait for the load event
    else {
      window.addEventListener('load', () => {
        console.log("[ContentExtractor] Page load event fired, waiting before extraction");
        // Add a short delay after load to ensure everything is stable
        setTimeout(() => {
          console.log("[ContentExtractor] Starting extraction after page load");
          extract();
        }, 1000); // 1 second delay after load
      }, { once: true });
    }
    
    // Indicate we'll handle the response asynchronously
    return true;
  }
  
  // Handle SET_EXTRACTION_CONTEXT message
  if (message.type === MessageType.SET_EXTRACTION_CONTEXT) {
    console.log("[ContentExtractor] Received extraction context");
    const { pageId, visitId } = message.data;
    setExtractionContext(pageId, visitId);
    return true;
  }
});

// Remove automatic extraction on script load
// extract();