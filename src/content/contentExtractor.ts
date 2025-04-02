/**
 * @file contentExtractor.ts
 * Simple content extractor that responds to direct message requests.
 */

import { DefaultMarkdownGenerator } from '../html2text/markdownGenerator';
import { PruningContentFilter } from '../html2text/content_filter_strategy';
import { USE_FIT_MARKDOWN, QUEUE_CONFIG } from '../config';
import { ExtractedContent } from '../types';

const {
  DOM_IDLE_TIMEOUT_MS = 10000,
  DOM_IDLE_CHECK_DELAY_MS = 1000,
  PROCESSING_TIMEOUT_MS = 30000,
  RETRY_DELAY_MS = 2000,
  MAX_RETRIES = 3,
} = QUEUE_CONFIG;

let extractionTimeoutId: number | null = null;

/**
 * Extracts content from the current page
 */
async function extractContent(options: { retryCount?: number } = {}): Promise<ExtractedContent> {
  const { retryCount = 0 } = options;
  setupExtractionTimeout();

  try {
    await waitForDomIdle();
    const html = document.body?.innerHTML || '';
    if (!html) throw new Error('Empty document');

    const filter = new PruningContentFilter(
      undefined,
      5,             // Min blocks
      'dynamic',     // Strategy
      0.5,           // Threshold
      'english'      // Language
    );

    const mdGen = new DefaultMarkdownGenerator(undefined, { body_width: 80 });
    const result = mdGen.generateMarkdown(html, location.href, { body_width: 80 }, filter, true);

    const sourceMarkdown = USE_FIT_MARKDOWN
      ? result.fitMarkdown
      : result.markdownWithCitations || result.rawMarkdown;

    if (!sourceMarkdown) throw new Error('Markdown generation failed');

    clearExtractionTimeout();

    return {
      title: document.title || 'Untitled',
      url: location.href,
      markdown: sourceMarkdown,
      timestamp: Date.now(),
      metadata: { language: 'en' },
    };
  } catch (err) {
    if (retryCount < MAX_RETRIES) {
      await delay(RETRY_DELAY_MS);
      return extractContent({ retryCount: retryCount + 1 });
    }
    clearExtractionTimeout();
    throw err;
  }
}

/**
 * Checks if the page is ready for content extraction
 */
function isPageReady(): boolean {
  return document.readyState === 'complete';
}

function setupExtractionTimeout() {
  clearExtractionTimeout();
  extractionTimeoutId = window.setTimeout(() => {
    console.warn('[ContentExtractor] Extraction timed out');
    extractionTimeoutId = null;
  }, PROCESSING_TIMEOUT_MS);

  window.addEventListener('pagehide', ev => {
    if (!ev.persisted) clearExtractionTimeout();
  });
}

function clearExtractionTimeout() {
  if (extractionTimeoutId !== null) {
    clearTimeout(extractionTimeoutId);
    extractionTimeoutId = null;
  }
}

/**
 * Waits for the DOM to remain idle for a short period, or times out.
 */
async function waitForDomIdle(): Promise<void> {
  return new Promise(resolve => {
    let observer: MutationObserver | null = null;
    let lastMutation = Date.now();

    const checkIdle = () => {
      if (Date.now() - lastMutation >= DOM_IDLE_CHECK_DELAY_MS) {
        observer?.disconnect();
        resolve();
      }
    };

    try {
      observer = new MutationObserver(() => (lastMutation = Date.now()));
      observer.observe(document.body, { childList: true, attributes: true, characterData: true, subtree: true });
    } catch {
      // If MutationObserver fails, proceed immediately
      resolve();
    }

    const idleInterval = setInterval(checkIdle, Math.min(DOM_IDLE_CHECK_DELAY_MS / 2, 1000));
    const fallbackTimer = setTimeout(() => {
      observer?.disconnect();
      resolve();
    }, DOM_IDLE_TIMEOUT_MS);

    // Cleanup once we're done
    setTimeout(() => clearInterval(idleInterval), DOM_IDLE_TIMEOUT_MS + 200);
    setTimeout(() => clearTimeout(fallbackTimer), DOM_IDLE_TIMEOUT_MS + 200);
  });
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Set up message listeners for content extraction requests
if (typeof chrome !== 'undefined' && chrome.runtime) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Handle the extract content request
    if (message.type === 'EXTRACT_CONTENT') {
      // Extract content and send back the result (waitForDomIdle is called inside extractContent)
      extractContent()
        .then(content => {
          sendResponse({ success: true, content });
        })
        .catch(err => {
          console.error('[ContentExtractor] Extraction error:', err);
          sendResponse({ 
            success: false, 
            error: err instanceof Error ? err.message : 'Unknown extraction error' 
          });
        });
      
      // Return true to indicate we'll respond asynchronously
      return true;
    }
    
    // Handle ready check request
    if (message.type === 'IS_PAGE_READY') {
      sendResponse({ success: true, isReady: isPageReady() });
      return false; // No async response needed
    }
    
    // Simple ping-pong to check if content script is loaded
    if (message.type === 'PING') {
      sendResponse({ success: true, pong: true });
      return false; // No async response needed
    }
  });

  console.log('[ContentExtractor] Ready and listening for extraction requests');
}