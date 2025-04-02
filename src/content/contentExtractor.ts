/**
 * @file contentExtractor.ts
 * Exposes an API to extract content from the current page, via Comlink.
 */

import { exposeBackgroundAPI } from '../utils/comlinkSetup';
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

const contentAPI = {
  async extractContent(options: { retryCount?: number } = {}): Promise<ExtractedContent> {
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
        return this.extractContent({ retryCount: retryCount + 1 });
      }
      clearExtractionTimeout();
      throw err;
    }
  },

  isPageReady(): boolean {
    return document.readyState === 'complete';
  },
};

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

// Expose the contentAPI via Comlink using the utility from comlinkSetup

if (typeof chrome !== 'undefined' && chrome.runtime) {
  exposeBackgroundAPI(contentAPI);
  console.log('[ContentExtractor] Ready and exposing API via Comlink.');
}