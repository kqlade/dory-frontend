// src/services/contentExtractor.ts

"use strict";

import { DefaultMarkdownGenerator } from "../html2text/markdownGenerator";
import { PruningContentFilter } from "../html2text/content_filter_strategy";
import { USE_FIT_MARKDOWN, QUEUE_CONFIG } from "../config";
import { createMessage, MessageType, ExtractionData } from "../background/messageSystem";
import { sendContentEvent } from "../services/eventService";
import { getCurrentSessionId } from "../utils/dexieSessionManager";
import { getUserInfo } from "../auth/googleAuth";

console.log("[ContentExtractor] Loading content script...");

// Tracking IDs set via background -> content messaging
let currentPageId: string | null = null;
let currentVisitId: string | null = null;

// A promise to resolve once the context is set
let contextReadyPromise: Promise<void>;
let contextReadyResolver: (() => void) | null = null;

function initContextPromise() {
  contextReadyPromise = new Promise<void>((resolve) => {
    // If context is already known, resolve immediately
    if (currentPageId && currentVisitId) {
      return resolve();
    }
    contextReadyResolver = resolve;
  });
}
initContextPromise();

/**
 * Called by background to set the context (pageId, visitId).
 */
export function setExtractionContext(pageId: string, visitId: string): void {
  console.log("[ContentExtractor] setExtractionContext => ", { pageId, visitId });
  currentPageId = pageId;
  currentVisitId = visitId;

  if (contextReadyResolver) {
    contextReadyResolver();
    contextReadyResolver = null;
  }
}

/** 
 * Settings from your QUEUE_CONFIG or defaults 
 */
const {
  DOM_IDLE_TIMEOUT_MS,
  DOM_IDLE_CHECK_DELAY_MS,
  PROCESSING_TIMEOUT_MS,
  RETRY_DELAY_MS,
  MAX_RETRIES
} = QUEUE_CONFIG;

const MARKDOWN_BODY_WIDTH = 80;
const CONTENT_FILTER_MIN_BLOCKS = 5;
const CONTENT_FILTER_STRATEGY = "dynamic";
const CONTENT_FILTER_THRESHOLD = 0.5;
const CONTENT_FILTER_LANGUAGE = "english";
const DEFAULT_TITLE = "Untitled";

let extractionTimeoutId: number | null = null;

/**
 * Wait for DOM to become stable, or time out after DOM_IDLE_TIMEOUT_MS
 */
function waitForDomIdle(
  maxTimeoutMs = DOM_IDLE_TIMEOUT_MS,
  idleCheckDelayMs = DOM_IDLE_CHECK_DELAY_MS
): Promise<void> {
  return new Promise<void>((resolve) => {
    let observer: MutationObserver | null = null;
    let lastMutationTime = Date.now();

    const checkIdle = () => {
      const now = Date.now();
      if (now - lastMutationTime >= idleCheckDelayMs) {
        if (observer) observer.disconnect();
        resolve();
      }
    };

    try {
      observer = new MutationObserver(() => {
        lastMutationTime = Date.now();
      });
      observer.observe(document.body, {
        childList: true,
        attributes: true,
        characterData: true,
        subtree: true,
      });
    } catch (err) {
      console.error("[ContentExtractor] MutationObserver error:", err);
      resolve(); // fallback
    }

    // Fallback: forcibly resolve after maxTimeoutMs
    setTimeout(() => {
      if (observer) observer.disconnect();
      resolve();
    }, maxTimeoutMs);

    // Periodic check
    const intervalId = setInterval(() => {
      checkIdle();
    }, Math.min(1000, idleCheckDelayMs / 2));

    // Clean up after maxTimeoutMs
    setTimeout(() => {
      clearInterval(intervalId);
    }, maxTimeoutMs + 100);
  });
}

/** Utility to pause. */
function delay(ms: number) {
  return new Promise<void>(res => setTimeout(res, ms));
}

/**
 * Send a message to the background about extraction complete.
 */
function sendExtractionComplete(title: string, url: string, timestamp: number): void {
  if (!chrome?.runtime?.id) {
    console.error("[ContentExtractor] No extension context");
    return;
  }
  const msg = createMessage<ExtractionData>(MessageType.EXTRACTION_COMPLETE, {
    title,
    url,
    timestamp
  });
  chrome.runtime.sendMessage(msg).catch(err => {
    console.error("[ContentExtractor] ExtractionComplete sendMessage error:", err);
  });
}

/**
 * Notify background of an extraction error
 */
function sendExtractionError(code: string, message: string, url: string, stack?: string) {
  if (!chrome?.runtime?.id) {
    console.error("[ContentExtractor] No extension context for error");
    return;
  }
  const errorMsg = createMessage(MessageType.EXTRACTION_ERROR, {
    code, message, stack,
    context: { url }
  });
  chrome.runtime.sendMessage(errorMsg).catch(err => {
    console.error("[ContentExtractor] ExtractionError sendMessage error:", err);
  });
}

/**
 * Public function to start extraction
 */
export function extract(): void {
  setupExtractionTimeout();
  void extractAndSendContent();
}

/**
 * Main extraction logic with optional retries
 */
async function extractAndSendContent(retryCount = 0): Promise<void> {
  const currentUrl = window.location.href;
  console.log(`[ContentExtractor] extractAndSendContent: url=${currentUrl}, retry=${retryCount}`);

  try {
    await waitForDomIdle();
    const rawHTMLString = document.body?.innerHTML || "";
    if (!rawHTMLString) throw new Error("Empty document body");

    // Generate markdown
    const filter = new PruningContentFilter(
      undefined,
      CONTENT_FILTER_MIN_BLOCKS,
      CONTENT_FILTER_STRATEGY,
      CONTENT_FILTER_THRESHOLD,
      CONTENT_FILTER_LANGUAGE
    );
    const mdGenerator = new DefaultMarkdownGenerator(filter, { body_width: MARKDOWN_BODY_WIDTH });

    const result = mdGenerator.generateMarkdown(rawHTMLString, currentUrl, { body_width: MARKDOWN_BODY_WIDTH }, undefined, true);
    const sourceMarkdown = USE_FIT_MARKDOWN
      ? result.fitMarkdown
      : (result.markdownWithCitations || result.rawMarkdown);

    if (!sourceMarkdown) throw new Error("Markdown generation failed");
    const timestamp = Date.now();
    const title = document.title || DEFAULT_TITLE;

    // Clear any existing timeout
    if (extractionTimeoutId !== null) {
      clearTimeout(extractionTimeoutId);
      extractionTimeoutId = null;
    }

    // Notify background of success
    sendExtractionComplete(title, currentUrl, timestamp);

    // Wait for context if not set
    if (!currentPageId || !currentVisitId) {
      await Promise.race([
        contextReadyPromise,
        new Promise<void>((_, reject) => setTimeout(() => reject(new Error("Context Timeout")), 30000))
      ]);
    }

    // Optionally send content to backend
    const sessionId = await getCurrentSessionId();
    if (sessionId && currentPageId && currentVisitId) {
      try {
        const userInfo = await getUserInfo(false);
        const userId = userInfo?.id;
        await sendContentEvent({
          pageId: currentPageId,
          visitId: currentVisitId,
          url: currentUrl,
          title,
          markdown: sourceMarkdown,
          metadata: { language: 'en' },
        });
        console.log("[ContentExtractor] Content sent to backend successfully.");
      } catch (err) {
        console.error("[ContentExtractor] sendContentEvent error:", err);
      }
    } else {
      console.warn("[ContentExtractor] Missing session or context => skipping immediate backend send");
    }
  } catch (err: any) {
    console.error("[ContentExtractor] Extraction error:", err);
    if (retryCount < MAX_RETRIES) {
      console.log(`[ContentExtractor] Retrying... attempt ${retryCount + 1}`);
      await delay(RETRY_DELAY_MS);
      return extractAndSendContent(retryCount + 1);
    }
    sendExtractionError("EXTRACTION_FAILED", String(err?.message || err), currentUrl, err?.stack);
  }
}

/**
 * Setup a safety timeout to avoid indefinite hanging
 */
function setupExtractionTimeout() {
  if (extractionTimeoutId !== null) {
    clearTimeout(extractionTimeoutId);
  }
  extractionTimeoutId = window.setTimeout(() => {
    console.warn("[ContentExtractor] Extraction timed out");
    sendExtractionError("EXTRACTION_TIMEOUT", "Extraction took too long", window.location.href);
  }, PROCESSING_TIMEOUT_MS);

  // Clear on pagehide if page is actually unloading
  window.addEventListener("pagehide", (ev) => {
    if (!ev.persisted && extractionTimeoutId !== null) {
      clearTimeout(extractionTimeoutId);
      extractionTimeoutId = null;
    }
  });
}

// Listen for messages (TRIGGER_EXTRACTION, SET_EXTRACTION_CONTEXT)
if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === MessageType.TRIGGER_EXTRACTION) {
      sendResponse({ received: true });
      if (document.readyState === 'complete') {
        setTimeout(() => extract(), 1000);
      } else {
        window.addEventListener('load', () => {
          setTimeout(() => extract(), 1000);
        }, { once: true });
      }
      return false;
    } else if (message.type === MessageType.SET_EXTRACTION_CONTEXT) {
      const { pageId, visitId } = message.data;
      setExtractionContext(pageId, visitId);
      sendResponse({ received: true });
      return false;
    }
    // Fallback
    sendResponse({ received: false, error: 'Unhandled message type' });
    return false;
  });
} else {
  console.warn("[ContentExtractor] chrome.runtime.onMessage not available");
}

console.log("[ContentExtractor] contentExtractor script loaded.");