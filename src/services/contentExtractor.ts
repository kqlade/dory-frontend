// [IMPROVEMENT] Using strict mode for safer JavaScript
"use strict";

// src/services/contentExtractor.ts

console.log("[ContentExtractor] Debug: Starting import process");
console.log("[ContentExtractor] Debug: About to import DefaultMarkdownGenerator");
import { DefaultMarkdownGenerator } from "../html2text/markdownGenerator";
console.log("[ContentExtractor] Debug: About to import PruningContentFilter");
import { PruningContentFilter } from "../html2text/content_filter_strategy";
console.log("[ContentExtractor] Debug: About to import config values");
import { USE_FIT_MARKDOWN, QUEUE_CONFIG } from "../config";
console.log("[ContentExtractor] Debug: About to import message system");
import { createMessage, MessageType, ExtractionData } from "./messageSystem";
console.log("[ContentExtractor] Debug: About to import event streamer");

/**
 * IMPORTANT: Content extraction events are special-cased to be sent directly to the backend API
 * instead of being stored in the local Dexie database. This is why we're importing from the 
 * API-based eventStreamer instead of dexieEventStreamer.
 * 
 * These content extraction events are the only events that will be sent to the backend in real-time.
 */
import { sendDoryEvent, EventTypes } from "./eventStreamer";

console.log("[ContentExtractor] Debug: About to import session manager");
// We still want to use the Dexie session manager to get the current session ID
import { getCurrentSessionId } from "./dexieSessionManager";
console.log("[ContentExtractor] Debug: All imports completed");

console.log("[ContentExtractor] File loaded - before initialization");
console.log("[ContentExtractor] Starting initialization...");

// Store the current page and visit IDs for extraction context
let currentPageId: string | null = null;
let currentVisitId: string | null = null;

console.log("[ContentExtractor] Variables initialized");

// Add a Promise that resolves when context is set
let contextReadyPromise: Promise<void> | null = null;
let resolveContextPromise: (() => void) | null = null;

// Initialize the context Promise
function initContextPromise() {
  if (!contextReadyPromise) {
    contextReadyPromise = new Promise<void>((resolve) => {
      // If we already have context, resolve immediately
      if (currentPageId && currentVisitId) {
        resolve();
      } else {
        // Otherwise store the resolver for later
        resolveContextPromise = resolve;
      }
    });
  }
}

/**
 * Set the current page and visit context for extraction
 */
export function setExtractionContext(pageId: string, visitId: string): void {
  console.log(`[ContentExtractor] setExtractionContext called with pageId=${pageId}, visitId=${visitId}`);
  currentPageId = pageId;
  currentVisitId = visitId;
  console.log(`[ContentExtractor] Context set: pageId=${currentPageId}, visitId=${currentVisitId}`);
  
  // Resolve the context promise if it exists
  if (resolveContextPromise) {
    console.log(`[ContentExtractor] Resolving context promise`);
    resolveContextPromise();
    resolveContextPromise = null;
  }
}

// Initialize the context promise when the module loads
initContextPromise();

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
  console.log(`[ContentExtractor] waitForDomIdle called with maxTimeoutMs=${maxTimeoutMs}, idleCheckDelayMs=${idleCheckDelayMs}`);
  return new Promise((resolve) => {
    let observer: MutationObserver | null = null;
    let lastMutationTime = Date.now();
    console.log(`[ContentExtractor] waitForDomIdle: initializing observer`);

    const checkIdle = () => {
      const now = Date.now();
      const timeSinceLastMutation = now - lastMutationTime;
      console.log(`[ContentExtractor] checkIdle: timeSinceLastMutation=${timeSinceLastMutation}`);

      if (timeSinceLastMutation >= idleCheckDelayMs) {
        console.log(`[ContentExtractor] DOM is idle (${timeSinceLastMutation}ms since last mutation)`);
        if (observer) observer.disconnect();
        resolve();
      }
    };

    // Set up mutation observer to track DOM changes
    try {
      console.log(`[ContentExtractor] Setting up MutationObserver`);
      observer = new MutationObserver(() => {
        lastMutationTime = Date.now();
        console.log(`[ContentExtractor] DOM mutation detected at ${lastMutationTime}`);
      });

      observer.observe(document.body, {
        childList: true,
        attributes: true,
        characterData: true,
        subtree: true,
      });
      console.log(`[ContentExtractor] MutationObserver started`);
    } catch (error) {
      console.error(`[ContentExtractor] Error setting up MutationObserver:`, error);
      resolve(); // Continue even if observer setup fails
    }

    // Fallback in case "truly idle" never occurs
    console.log(`[ContentExtractor] Setting up timeout fallback for ${maxTimeoutMs}ms`);
    setTimeout(() => {
      console.log(`[ContentExtractor] Maximum idle time (${maxTimeoutMs}ms) reached`);
      if (observer) observer.disconnect();
      resolve();
    }, maxTimeoutMs);

    // [IMPROVEMENT] We set up a repeated check of DOM idle state
    // but also ensure we clear it at the same time as fallback expires.
    console.log(`[ContentExtractor] Setting up idle check interval`);
    const intervalId = setInterval(() => {
      checkIdle();
    }, Math.min(idleCheckDelayMs / 2, 1000));

    // Clean up interval when we resolve (or after fallback)
    setTimeout(() => {
      console.log(`[ContentExtractor] Cleaning up idle check interval`);
      clearInterval(intervalId);
    }, maxTimeoutMs + 100);
  });
}

/** Basic utility to pause code execution. */
function delay(ms: number): Promise<void> {
  console.log(`[ContentExtractor] Delaying for ${ms}ms`);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Sends an EXTRACTION_COMPLETE message to the background in a fire-and-forget pattern.
 */
function sendExtractionComplete(title: string, url: string, timestamp: number): void {
  console.log(`[ContentExtractor] Sending extraction complete message: ${title}`);
  
  // [IMPROVEMENT] Check for valid extension context a bit more explicitly
  if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.id) {
    console.error("[ContentExtractor] Cannot send extraction complete - extension context invalid");
    return;
  }

  const extractionMessage = createMessage<ExtractionData>(MessageType.EXTRACTION_COMPLETE, {
    title: title,
    url: url,
    timestamp
  });

  try {
    chrome.runtime.sendMessage(extractionMessage)
      .then(response => {
        console.log(`[ContentExtractor] Extraction complete message acknowledged:`, response);
      })
      .catch(err => {
        console.error("[ContentExtractor] Error sending extraction data:", err);
      });
  } catch (err) {
    console.error("[ContentExtractor] Failed to send extraction complete message:", err);
  }
}

/**
 * Sends an EXTRACTION_ERROR message to the background in case of
 * unrecoverable or repeated failures.
 */
function sendExtractionError(code: string, message: string, url: string, stack?: string): void {
  console.log(`[ContentExtractor] sendExtractionError: code=${code}, message=${message}`);
  
  // [IMPROVEMENT] Same stronger check for extension context
  if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.id) {
    console.error("[ContentExtractor] Cannot send error - extension context invalid");
    return;
  }

  const errorMessage = createMessage(MessageType.EXTRACTION_ERROR, {
    code,
    message,
    stack,
    context: { url },
  });

  try {
    chrome.runtime.sendMessage(errorMessage)
      .then(response => {
        console.log(`[ContentExtractor] Error message acknowledged:`, response);
      })
      .catch(err => {
        console.error("[ContentExtractor] Failed to send error message:", err);
      });
  } catch (err) {
    console.error("[ContentExtractor] Failed to send error message:", err);
  }
}

/**
 * Main function that does:
 *  1) Wait for DOM idle
 *  2) Generate Markdown
 *  3) Send extracted content via event streaming
 *  4) Retry if extraction fails
 */
async function extractAndSendContent(retryCount = 0): Promise<void> {
  console.log(`[ContentExtractor] extractAndSendContent started (retryCount=${retryCount})`);
  
  // [IMPROVEMENT] Check for extension context more explicitly
  if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.id) {
    console.error("[ContentExtractor] Extension context invalid - cannot start extraction");
    return;
  }
  console.log(`[ContentExtractor] Chrome runtime ID valid: ${chrome.runtime.id}`);

  if (!document.body) {
    console.error("[ContentExtractor] Document body not available");
    return;
  }
  console.log(`[ContentExtractor] Document body available`);

  const currentUrl = window.location.href;
  console.log(`[ContentExtractor] Current URL: ${currentUrl}`);

  try {
    // 1) Wait for DOM to stabilize
    console.log(`[ContentExtractor] Waiting for DOM to stabilize...`);
    await waitForDomIdle();
    console.log(`[ContentExtractor] DOM is now stable`);

    // 2) Gather raw HTML
    console.log(`[ContentExtractor] Gathering raw HTML...`);
    const rawHTMLString = document.body.innerHTML || "";
    if (!rawHTMLString) {
      console.error("[ContentExtractor] Empty innerHTML");
      throw new Error("Empty innerHTML");
    }
    console.log(`[ContentExtractor] Raw HTML collected (${rawHTMLString.length} characters)`);

    // 3) Convert HTML -> Markdown
    console.log(`[ContentExtractor] Creating PruningContentFilter...`);
    const filter = new PruningContentFilter(
      undefined,
      CONTENT_FILTER_MIN_BLOCKS,
      CONTENT_FILTER_STRATEGY,
      CONTENT_FILTER_THRESHOLD,
      CONTENT_FILTER_LANGUAGE
    );
    console.log(`[ContentExtractor] Creating DefaultMarkdownGenerator...`);
    const mdGenerator = new DefaultMarkdownGenerator(filter, {
      body_width: MARKDOWN_BODY_WIDTH,
    });

    console.log(`[ContentExtractor] Generating markdown...`);
    const result = mdGenerator.generateMarkdown(
      rawHTMLString,
      currentUrl,
      { body_width: MARKDOWN_BODY_WIDTH },
      undefined,
      true
    );
    console.log(`[ContentExtractor] Markdown generation complete`);

    const sourceMarkdown = USE_FIT_MARKDOWN
      ? result.fitMarkdown
      : result.markdownWithCitations || result.rawMarkdown;

    if (!sourceMarkdown) {
      console.error("[ContentExtractor] Failed to generate markdown");
      throw new Error("Failed to generate markdown");
    }
    console.log(`[ContentExtractor] Final markdown length: ${sourceMarkdown.length} characters`);

    // Use integer milliseconds since epoch for timestamp
    const timestamp = Math.floor(Date.now());
    const title = document.title || DEFAULT_TITLE;
    console.log(`[ContentExtractor] Page title: "${title}"`);

    // If we succeed, clear the extraction timeout
    if (extractionTimeoutId !== null) {
      console.log(`[ContentExtractor] Clearing extraction timeout`);
      clearTimeout(extractionTimeoutId);
      extractionTimeoutId = null;
    }

    // 4) Notify background that extraction is complete - using the one-way pattern
    sendExtractionComplete(title, currentUrl, timestamp);

    // 5) Wait for context if needed before sending to backend
    if (!currentPageId || !currentVisitId) {
      console.log(`[ContentExtractor] Context not set yet, waiting for context...`);
      try {
        await Promise.race([
          contextReadyPromise,
          // Add a maximum wait time to avoid hanging forever
          new Promise<void>((_, reject) => setTimeout(() => reject(new Error("Context timeout")), 30000))
        ]);
        console.log(`[ContentExtractor] Context is now available: pageId=${currentPageId}, visitId=${currentVisitId}`);
      } catch (contextError) {
        console.error(`[ContentExtractor] Error waiting for context:`, contextError);
        // Continue anyway - we'll check again below if context is available
      }
    }
    
    // 6) Send content extraction event to backend if context is available
    console.log(`[ContentExtractor] Getting current session ID...`);
    const sessionId = await getCurrentSessionId();
    console.log(`[ContentExtractor] Session ID: ${sessionId}`);
    
    if (sessionId && currentPageId) {
      console.log(`[ContentExtractor] Preparing to send event to backend: pageId=${currentPageId}, visitId=${currentVisitId}`);
      try {
        console.log(`[ContentExtractor] Sending CONTENT_EXTRACTED event to API instead of local storage`);
        await sendDoryEvent({
          operation: EventTypes.CONTENT_EXTRACTED,
          sessionId: sessionId.toString(),
          timestamp,
          data: {
            pageId: currentPageId,
            visitId: currentVisitId,
            url: currentUrl,
            content: {
              title: title,
              markdown: sourceMarkdown,
              metadata: {
                language: "en"
              }
            }
          }
        });
        console.log(`[ContentExtractor] Content extraction event successfully sent to API backend`);
      } catch (eventError) {
        console.error("[ContentExtractor] Error sending event to backend:", eventError);
      }
    } else {
      console.warn(`[ContentExtractor] Cannot send event: sessionId=${sessionId}, pageId=${currentPageId}, visitId=${currentVisitId}`);
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
    console.error(`[ContentExtractor] Out of retries, sending final error: ${errMsg}`);
    sendExtractionError("EXTRACTION_FAILED", errMsg, currentUrl, errStack);
  }
  console.log(`[ContentExtractor] extractAndSendContent complete`);
}

/**
 * Sets up a safety timeout to ensure we don't hang forever
 * if extraction takes too long.
 */
function setupExtractionTimeout(): void {
  console.log(`[ContentExtractor] Setting up extraction timeout (${PROCESSING_TIMEOUT_MS}ms)`);
  // Clear any existing timeout
  if (extractionTimeoutId !== null) {
    console.log(`[ContentExtractor] Clearing existing extraction timeout`);
    clearTimeout(extractionTimeoutId);
  }

  extractionTimeoutId = setTimeout(() => {
    console.warn(`[ContentExtractor] Extraction timeout triggered after ${PROCESSING_TIMEOUT_MS}ms`);
    if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.id) {
      sendExtractionError("EXTRACTION_TIMEOUT", "Extraction timed out", window.location.href);
    }
  }, PROCESSING_TIMEOUT_MS);

  // Replace unload with pagehide to clear the timeout when page is unloaded
  console.log(`[ContentExtractor] Adding pagehide event listener for cleanup`);
  window.addEventListener("pagehide", (event) => {
    console.log(`[ContentExtractor] pagehide event triggered, persisted=${event.persisted}`);
    // Only clear if the page is truly unloading, not just being put in bfcache
    if (!event.persisted && extractionTimeoutId !== null) {
      console.log(`[ContentExtractor] Clearing timeout on pagehide`);
      clearTimeout(extractionTimeoutId);
      extractionTimeoutId = null;
    }
  });
}

/** Public function to initiate extraction. */
export function extract(): void {
  console.log("[ContentExtractor] extract() called");
  setupExtractionTimeout();
  console.log("[ContentExtractor] Starting content extraction");
  void extractAndSendContent();
}

// Listen for extraction trigger messages from the background script
console.log("[ContentExtractor] Setting up message listener");
// [IMPROVEMENT] Check chrome.runtime.onMessage before adding listener
if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log(`[ContentExtractor] Message received:`, message);
    
    if (message.type === MessageType.TRIGGER_EXTRACTION) {
      console.log("[ContentExtractor] Received extraction trigger");
      
      // Respond immediately to close the message channel
      sendResponse({ received: true });
      
      // If the page is already loaded, wait a short delay then extract
      if (document.readyState === 'complete') {
        console.log(`[ContentExtractor] Document ready state: ${document.readyState}`);
        setTimeout(() => {
          console.log("[ContentExtractor] Page already loaded, starting extraction after delay");
          extract();
        }, 1000); // 1 second delay to ensure any redirects have settled
      } 
      // Otherwise wait for the load event
      else {
        console.log(`[ContentExtractor] Document ready state: ${document.readyState}, waiting for load`);
        window.addEventListener('load', () => {
          console.log("[ContentExtractor] Page load event fired, waiting before extraction");
          // Add a short delay after load to ensure everything is stable
          setTimeout(() => {
            console.log("[ContentExtractor] Starting extraction after page load");
            extract();
          }, 1000); // 1 second delay after load
        }, { once: true });
      }
      
      // Return false to avoid keeping the channel open
      return false;
    }
    
    // Handle SET_EXTRACTION_CONTEXT message
    if (message.type === MessageType.SET_EXTRACTION_CONTEXT) {
      console.log("[ContentExtractor] Received extraction context");
      const { pageId, visitId } = message.data;
      console.log(`[ContentExtractor] Context data: pageId=${pageId}, visitId=${visitId}`);
      
      // Respond immediately to close the message channel
      sendResponse({ received: true });
      
      // Set the context asynchronously
      setTimeout(() => {
        setExtractionContext(pageId, visitId);
        console.log("[ContentExtractor] Context set successfully");
      }, 0);
      
      // Return false to avoid keeping the channel open
      return false;
    }
    
    console.log(`[ContentExtractor] Unhandled message type: ${message.type}`);
    // Always respond to close the message channel
    sendResponse({ received: false, error: "Unhandled message type" });
    return false;
  });
} else {
  console.warn("[ContentExtractor] chrome.runtime.onMessage is unavailable in this context.");
}

console.log("[ContentExtractor] Module initialization complete");
// Remove automatic extraction on script load
// extract();