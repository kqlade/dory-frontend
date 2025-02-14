// markdownGenerator.ts

import { MarkdownGenerationResult } from "./models"; // or wherever your interface is defined
import { HTML2Text } from "./html2text";       // your TS port of the Python "HTML2Test"
import { RelevantContentFilter } from "./content_filter_strategy"; 

// ---------------------
//   Regex for finding Markdown links (including images)
//   e.g. [text](url "title") or ![text](url "title")
//   Groups:
//       1 => link text
//       2 => link URL
//       3 => optional title in quotes
// ---------------------
const LINK_PATTERN = /!?\[([^\]]+)\]\(([^)]+?)(?:\s+"([^"]*)")?\)/g;

/**
 * Fast URL joining for common cases, matching the Python approach.
 * Because we are in a browser environment, we rely on the global `URL` constructor.
 */
function fastUrlJoin(base: string, url: string): string {
  // If it already looks absolute or starts with mailto///
  if (
    url.startsWith("http://") ||
    url.startsWith("https://") ||
    url.startsWith("mailto:") ||
    url.startsWith("//")
  ) {
    return url;
  }
  // If it starts with "/", handle as absolute path
  if (url.startsWith("/")) {
    if (base.endsWith("/")) {
      return base.slice(0, -1) + url; // remove trailing slash from base
    }
    return base + url;
  }
  // Otherwise, do a standard join using the global URL object in browsers
  try {
    return new URL(url, base).toString();
  } catch {
    // fallback: if there's some invalid URL scenario, just return raw
    return url;
  }
}

// -------------------------
// Abstract base class
// (like MarkdownGenerationStrategy in Python)
// -------------------------
export abstract class MarkdownGenerationStrategy {
  protected contentFilter?: RelevantContentFilter;
  protected options: Record<string, any>;

  constructor(
    contentFilter?: RelevantContentFilter,
    options?: Record<string, any>
  ) {
    this.contentFilter = contentFilter;
    this.options = options || {};
  }

  /**
   * Abstract method to generate Markdown from cleaned HTML.
   */
  public abstract generateMarkdown(
    cleanedHtml: string,
    baseUrl?: string,
    html2textOptions?: Record<string, any>,
    contentFilter?: RelevantContentFilter,
    citations?: boolean
  ): MarkdownGenerationResult;
}

// -------------------------
// DefaultMarkdownGenerator
// (like DefaultMarkdownGenerator in Python)
// -------------------------
export class DefaultMarkdownGenerator extends MarkdownGenerationStrategy {
  /**
   * The default implementation:
   * 1) Convert HTML -> Markdown (using HTML2Test).
   * 2) Convert links to citations (if `citations` = true).
   * 3) If a `RelevantContentFilter` is provided, also generate "fitMarkdown" from filtered HTML.
   * 4) Return a MarkdownGenerationResult with raw/cited/filtered content.
   */
  constructor(
    contentFilter?: RelevantContentFilter,
    options?: Record<string, any>
  ) {
    super(contentFilter, options);
  }

  /**
   * Convert all Markdown links into "citation" style references.
   * For example:
   *   [Title](https://example.com "desc") 
   * becomes
   *   Title⟨1⟩
   * plus references appended at the end:
   *   ⟨1⟩ https://example.com: desc
   */
  private convertLinksToCitations(
    markdown: string,
    baseUrl: string = ""
  ): [string, string] {
    const linkMap: Record<string, [number, string]> = {};
    const urlCache: Record<string, string> = {};

    let lastEnd = 0;
    let counter = 1;
    const parts: string[] = [];

    // reset the regex state
    LINK_PATTERN.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = LINK_PATTERN.exec(markdown)) !== null) {
      // text before the match
      parts.push(markdown.slice(lastEnd, match.index));

      const text = match[1];
      let url = match[2];
      const title = match[3] || "";

      // Possibly fix up the URL
      if (baseUrl && !/^https?:\/\//.test(url) && !url.startsWith("mailto:")) {
        if (!urlCache[url]) {
          urlCache[url] = fastUrlJoin(baseUrl, url);
        }
        url = urlCache[url];
      }

      // If this url hasn't been seen, record it in linkMap
      if (!linkMap[url]) {
        const descParts: string[] = [];
        if (title) descParts.push(title);
        if (text && text !== title) descParts.push(text);
        // e.g. ": desc - text"
        const desc = descParts.length ? ": " + descParts.join(" - ") : "";
        linkMap[url] = [counter, desc];
        counter++;
      }

      const [num] = linkMap[url];

      // If it's an image link => match[0].startsWith("!")
      if (match[0].startsWith("!")) {
        parts.push(`![${text}⟨${num}⟩]`);
      } else {
        parts.push(`${text}⟨${num}⟩`);
      }

      lastEnd = match.index + match[0].length;
    }

    // push the remainder
    parts.push(markdown.slice(lastEnd));

    // references
    const references: string[] = [];
    references.push("\n\n## References\n\n");

    const sortedUrls = Object.entries(linkMap).sort((a, b) => a[1][0] - b[1][0]);
    for (const [thisUrl, [num, desc]] of sortedUrls) {
      references.push(`⟨${num}⟩ ${thisUrl}${desc}\n`);
    }

    const convertedText = parts.join("");
    const referencesText = references.join("");

    return [convertedText, referencesText];
  }

  /**
   * Main method that orchestrates the entire Markdown generation flow:
   * 1) Build a `HTML2Test` with default or user-supplied options.
   * 2) Convert HTML -> rawMarkdown.
   * 3) Optionally convert links -> citations.
   * 4) Optionally filter content, re-convert to get "fitMarkdown".
   * 5) Return final `MarkdownGenerationResult`.
   */
  public generateMarkdown(
    cleanedHtml: string,
    baseUrl: string = "",
    html2textOptions?: Record<string, any>,
    contentFilter?: RelevantContentFilter,
    citations: boolean = true
  ): MarkdownGenerationResult {
    try {
      // Merge default + user-supplied HTML2Text options
      const defaultOptions: Record<string, any> = {
        body_width: 0,         
        ignore_emphasis: false,
        ignore_links: true,
        ignore_images: false,
        protect_links: true,
        single_line_break: true,
        mark_code: true,
        escape_snob: false,
        inline_links: false,   // Force reference-style links
      };

      if (html2textOptions) {
        Object.assign(defaultOptions, html2textOptions);
      } else if (this.options) {
        Object.assign(defaultOptions, this.options);
      }

      // contentFilter to actually use
      const activeFilter = contentFilter || this.contentFilter;

      // 1) Create the converter
      const h = new HTML2Text({ baseurl: baseUrl });
      h.update_params(defaultOptions);

      // 2) Convert the raw HTML
      let rawMarkdown = "";
      try {
        if (!cleanedHtml) {
          cleanedHtml = "";
        }
        rawMarkdown = h.handle(cleanedHtml);
      } catch (convErr) {
        rawMarkdown = `Error converting HTML to markdown: ${String(convErr)}`;
      }

      // replicate the python code that replaced "    ```" with "```"
      rawMarkdown = rawMarkdown.replace(/ {4}```/g, "```");

      // 3) Optionally convert links -> citations
      let markdownWithCitations = rawMarkdown;
      let referencesMarkdown = "";
      if (citations) {
        try {
          const [md, refs] = this.convertLinksToCitations(rawMarkdown, baseUrl);
          markdownWithCitations = md;
          referencesMarkdown = refs;
        } catch (e) {
          markdownWithCitations = rawMarkdown;
          referencesMarkdown = `Error generating citations: ${String(e)}`;
        }
      }

      // 4) If a filter is provided, produce "fitMarkdown"
      let fitMarkdown = "";
      let fitHtml = "";
      if (activeFilter) {
        try {
          // Suppose relevant content is returned as an array of HTML chunks
          const filteredChunks = activeFilter.filterContent(cleanedHtml);
          fitHtml = filteredChunks.map((c) => `<div>${c}</div>`).join("\n");

          // Re-run the converter on the filtered HTML
          const h2 = new HTML2Text({ baseurl: baseUrl });
          h2.update_params(defaultOptions);
          fitMarkdown = h2.handle(fitHtml);
        } catch (filterErr) {
          fitMarkdown = `Error generating fit markdown: ${String(filterErr)}`;
          fitHtml = "";
        }
      }

      // 5) Build final result
      return {
        rawMarkdown: rawMarkdown || "",
        markdownWithCitations: markdownWithCitations || "",
        referencesMarkdown: referencesMarkdown || "",
        fitMarkdown: fitMarkdown || "",
        fitHtml: fitHtml || "",
      };
    } catch (err) {
      // On catastrophic error, produce an error message in the fields
      const errorMsg = `Error in markdown generation: ${String(err)}`;
      return {
        rawMarkdown: errorMsg,
        markdownWithCitations: errorMsg,
        referencesMarkdown: "",
        fitMarkdown: "",
        fitHtml: "",
      };
    }
  }
}