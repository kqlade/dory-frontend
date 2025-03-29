// src/services/contentExtractor.ts
"use strict";

import { DefaultMarkdownGenerator } from "../html2text/markdownGenerator";
import { PruningContentFilter, BM25ContentFilter } from "../html2text/content_filter_strategy";
import { USE_FIT_MARKDOWN, QUEUE_CONFIG } from "../config";
import {
  createMessage,
  MessageType,
  ExtractionData,
  ContentDataMessage
} from "../utils/messageSystem";

console.log("[ContentExtractor] Loaded content script...");

/** 
 * Current context for extraction. 
 * We only store these so we can pass them back to the background script 
 * once we generate markdown. 
 */
let currentPageId: string | null = null;
let currentVisitId: string | null = null;
let currentSessionId: string | null = null;

/** 
 * A promise that resolves once we have the extraction context. 
 */
let contextReady: Promise<void>;
let resolveContext: (() => void) | null = null;

function initContextPromise() {
  contextReady = new Promise<void>((resolve) => {
    if (currentPageId && currentVisitId && currentSessionId) {
      resolve();
    } else {
      resolveContext = resolve;
    }
  });
}
initContextPromise();

/**
 * Called from SET_EXTRACTION_CONTEXT message to store new IDs
 */
export function setExtractionContext(
  pageId: string,
  visitId: string,
  sessionId: string | null
): void {
  console.log("[ContentExtractor] setExtractionContext =>", pageId, visitId, sessionId);
  currentPageId = pageId;
  currentVisitId = visitId;
  currentSessionId = sessionId;
  if (resolveContext) {
    resolveContext();
    resolveContext = null;
  }
}

/** Config constants (loaded from QUEUE_CONFIG) */
const {
  DOM_IDLE_TIMEOUT_MS,
  DOM_IDLE_CHECK_DELAY_MS,
  PROCESSING_TIMEOUT_MS,
  RETRY_DELAY_MS,
  MAX_RETRIES
} = QUEUE_CONFIG;

const MARKDOWN_BODY_WIDTH = 80;
const BM25_THRESHOLD = 1.0;
const BM25_LANGUAGE = "english";
const DEFAULT_TITLE = "Untitled";

let extractionTimeoutId: number | null = null;

/**
 * Waits until the DOM has not changed for a short while,
 * or times out after DOM_IDLE_TIMEOUT_MS
 */
function waitForDomIdle(): Promise<void> {
  return new Promise((resolve) => {
    let observer: MutationObserver | null = null;
    let lastMutationTime = Date.now();

    const checkIdle = () => {
      if (Date.now() - lastMutationTime >= DOM_IDLE_CHECK_DELAY_MS) {
        if (observer) observer.disconnect();
        resolve();
      }
    };

    try {
      observer = new MutationObserver(() => {
        lastMutationTime = Date.now();
      });
      observer.observe(document.body, { childList: true, attributes: true, characterData: true, subtree: true });
    } catch (err) {
      console.error("[ContentExtractor] MutationObserver error =>", err);
      resolve(); // Fallback if we cannot observe
    }

    // Force end after DOM_IDLE_TIMEOUT_MS
    const maxTimeoutId = setTimeout(() => {
      if (observer) observer.disconnect();
      resolve();
    }, DOM_IDLE_TIMEOUT_MS);

    const intervalId = setInterval(() => {
      checkIdle();
    }, Math.min(DOM_IDLE_CHECK_DELAY_MS / 2, 1000));

    // Cleanup
    setTimeout(() => clearInterval(intervalId), DOM_IDLE_TIMEOUT_MS + 100);
  });
}

function delay(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

/**
 * Notifies background that extraction succeeded
 */
function sendExtractionComplete(title: string, url: string, timestamp: number) {
  if (!chrome?.runtime?.id) return;
  const msg = createMessage<ExtractionData>(
    MessageType.EXTRACTION_COMPLETE,
    { title, url, timestamp }
  );
  chrome.runtime.sendMessage(msg).catch(err => {
    console.error("[ContentExtractor] ExtractionComplete sendMessage error =>", err);
  });
}

/**
 * Notifies background that extraction had an error
 */
function sendExtractionError(code: string, message: string, url: string, stack?: string) {
  if (!chrome?.runtime?.id) return;
  const errMsg = createMessage(
    MessageType.EXTRACTION_ERROR,
    { code, message, stack, context: { url } }
  );
  chrome.runtime.sendMessage(errMsg).catch(err => {
    console.error("[ContentExtractor] ExtractionError sendMessage error =>", err);
  });
}

/**
 * Kick off extraction (triggered by TRIGGER_EXTRACTION message).
 */
export function extract() {
  setupExtractionTimeout();
  void extractAndSendContent();
}

async function extractAndSendContent(retryCount = 0): Promise<void> {
  const currentUrl = window.location.href;
  console.log("[ContentExtractor] extractAndSendContent =>", currentUrl, "retry=", retryCount);

  try {
    // Wait for DOM to settle
    await waitForDomIdle();
    const html = document.body?.innerHTML || "";
    if (!html) throw new Error("Empty document body");

    // Instantiate the BM25 filter (this will trigger the hybrid mode)
    const bm25Filter = new BM25ContentFilter(
      undefined, // No explicit user query, let it extract from page
      BM25_THRESHOLD,
      BM25_LANGUAGE
    );

    // Instantiate the generator (without a default filter)
    const mdGen = new DefaultMarkdownGenerator(undefined, { body_width: MARKDOWN_BODY_WIDTH });

    // Convert HTML -> Markdown, passing the BM25 filter to activate hybrid mode
    const result = mdGen.generateMarkdown(
      html,
      currentUrl,
      { body_width: MARKDOWN_BODY_WIDTH },
      bm25Filter, // <-- Pass the BM25 filter here
      true
    );
    const sourceMarkdown = USE_FIT_MARKDOWN
      ? result.fitMarkdown
      : (result.markdownWithCitations || result.rawMarkdown);

    if (!sourceMarkdown) {
      throw new Error("Markdown generation failed");
    }

    const now = Date.now();
    const title = document.title || DEFAULT_TITLE;

    // Clear timeout
    if (extractionTimeoutId !== null) {
      clearTimeout(extractionTimeoutId);
      extractionTimeoutId = null;
    }

    // Notify background extraction succeeded
    sendExtractionComplete(title, currentUrl, now);

    // Wait for context (pageId/visitId/sessionId)
    if (!currentPageId || !currentVisitId) {
      await Promise.race([
        contextReady,
        new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error("Context Timeout")), 30000)
        )
      ]);
    }

    // If we do have context, send the content data
    if (currentSessionId && currentPageId && currentVisitId) {
      const contentData: ContentDataMessage = {
        pageId: currentPageId,
        visitId: currentVisitId,
        sessionId: currentSessionId,
        url: currentUrl,
        title,
        markdown: sourceMarkdown,
        metadata: { language: 'en' }
      };

      console.log("[ContentExtractor] Sending content data to background script");
      try {
        chrome.runtime.sendMessage(
          createMessage(MessageType.CONTENT_DATA, contentData, 'content'),
          (response) => {
            if (chrome.runtime.lastError) {
              // This is normal if the port closes before response - just log it
              console.warn("[ContentExtractor] Message response error (this is often normal):", chrome.runtime.lastError.message);
            } else {
              console.log("[ContentExtractor] Content data sent to background:", response);
            }
          }
        );
        // Fire-and-forget approach - we don't need to wait for a response
        // The service worker will process the content asynchronously
      } catch (err) {
        // This would only happen if there's an issue sending the message
        console.error("[ContentExtractor] Failed to send content data:", err);
        // We can continue execution - this error shouldn't block the page experience
      }
    } else {
      console.warn("[ContentExtractor] Missing session or context => skipping content data send");
    }
  } catch (err) {
    console.error("[ContentExtractor] Extraction error =>", err);
    if (retryCount < MAX_RETRIES) {
      console.log(`[ContentExtractor] Retrying => attempt ${retryCount + 1}`);
      await delay(RETRY_DELAY_MS);
      return extractAndSendContent(retryCount + 1);
    }
    sendExtractionError("EXTRACTION_FAILED", String(err), currentUrl, (err as Error)?.stack);
  }
}

/**
 * Sets up a fallback timer in case extraction never completes
 */
function setupExtractionTimeout() {
  if (extractionTimeoutId !== null) {
    clearTimeout(extractionTimeoutId);
  }
  extractionTimeoutId = window.setTimeout(() => {
    console.warn("[ContentExtractor] Extraction timed out");
    sendExtractionError("EXTRACTION_TIMEOUT", "Extraction took too long", window.location.href);
  }, PROCESSING_TIMEOUT_MS);

  window.addEventListener("pagehide", (ev) => {
    // If the page is unloading (not being saved in bfcache), cancel the extraction timeout
    if (!ev.persisted && extractionTimeoutId !== null) {
      clearTimeout(extractionTimeoutId);
      extractionTimeoutId = null;
    }
  });
}

// Listen for TRIGGER_EXTRACTION + SET_EXTRACTION_CONTEXT messages
if (chrome?.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === MessageType.TRIGGER_EXTRACTION) {
      console.log("[ContentExtractor] Received TRIGGER_EXTRACTION");
      sendResponse({ received: true });
      if (document.readyState === "complete") {
        setTimeout(() => extract(), 1000);
      } else {
        window.addEventListener(
          "load",
          () => setTimeout(() => extract(), 1000),
          { once: true }
        );
      }
      return true;
    }

    if (message.type === MessageType.SET_EXTRACTION_CONTEXT) {
      console.log("[ContentExtractor] Received SET_EXTRACTION_CONTEXT =>", message.data);
      const { pageId, visitId, sessionId } = message.data;
      setExtractionContext(pageId, visitId, sessionId);
      sendResponse({ received: true });
      return true;
    }

    sendResponse({ received: false, error: "Unhandled message" });
    return false;
  });
} else {
  console.warn("[ContentExtractor] chrome.runtime.onMessage not available");
}

console.log("[ContentExtractor] contentExtractor script loaded.");