

import { Parser } from "htmlparser2";
import wrap from "word-wrap";  // Make sure to install this via npm/yarn if you need actual word-wrapping
import * as config from "./config";
import {
  dumbCssParser,
  elementStyle,
  escapeMd,
  escapeMdSection,
  googleFixedWidthFont,
  googleHasHeight,
  googleListStyle,
  googleTextEmphasis,
  hn,
  listNumberingStart,
  padTablesInText,
  skipwrap,
  unifiableN,
} from "./utils";
import { AnchorElement, ListElement } from "./elements";
import type { OutCallback } from "./typing";

export class HTML2Text {
  // -----------------------------------------------------
  // Class fields that track parsing state & configuration
  // -----------------------------------------------------

  // Output buffer and state variables
  outtextlist: string[] = [];
  quiet: number = 0;
  p_p: number = 0; // newline counter
  outcount: number = 0;
  start: boolean = true;
  space: boolean = false;

  // For anchor and link tracking
  a: AnchorElement[] = [];
  astack: Array<{ [key: string]: string | null } | null> = [];
  maybe_automatic_link: string | null = null;
  empty_link: boolean = false;
  absolute_url_matcher: RegExp = /^[a-zA-Z+]+:\/\//;
  acount: number = 0;

  // Lists, blockquotes, code blocks, quotes
  list: ListElement[] = [];
  blockquote: number = 0;
  pre: boolean = false;
  startpre: boolean = false;
  code: boolean = false;
  quote: boolean = false;
  br_toggle: string = "";
  lastWasNL: boolean = false;
  lastWasList: boolean = false;

  // Style parsing
  style: number = 0;
  style_def: { [selector: string]: { [prop: string]: string } } = {};
  tag_stack: Array<[string, { [key: string]: string | null }, { [key: string]: string }]> = [];

  // Emphasis
  emphasis: number = 0;
  drop_white_space: number = 0;
  inheader: boolean = false;
  abbr_title: string | null = null;
  abbr_data: string | null = null;
  abbr_list: { [abbr: string]: string } = {};
  current_tag: string = "";
  preceding_data: string = "";
  stressed: boolean = false;
  preceding_stressed: boolean = false;

  // Table-related variables (previously missing)
  table_start: boolean = false;
  split_next_td: boolean = false;
  td_count: number = 0;

  // Configuration options (defaults from config)
  unicode_snob: boolean = config.UNICODE_SNOB;
  escape_snob: boolean = config.ESCAPE_SNOB;
  escape_backslash: boolean = config.ESCAPE_BACKSLASH;
  escape_dot: boolean = config.ESCAPE_DOT;
  escape_plus: boolean = config.ESCAPE_PLUS;
  escape_dash: boolean = config.ESCAPE_DASH;
  links_each_paragraph: boolean = config.LINKS_EACH_PARAGRAPH;
  body_width: number = config.BODY_WIDTH;
  skip_internal_links: boolean = config.SKIP_INTERNAL_LINKS;
  inline_links: boolean = config.INLINE_LINKS;
  protect_links: boolean = config.PROTECT_LINKS;
  google_list_indent: number = config.GOOGLE_LIST_INDENT;
  ignore_links: boolean = config.IGNORE_ANCHORS;
  ignore_mailto_links: boolean = config.IGNORE_MAILTO_LINKS;
  ignore_images: boolean = config.IGNORE_IMAGES;
  images_as_html: boolean = config.IMAGES_AS_HTML;
  images_to_alt: boolean = config.IMAGES_TO_ALT;
  images_with_size: boolean = config.IMAGES_WITH_SIZE;
  ignore_emphasis: boolean = config.IGNORE_EMPHASIS;
  bypass_tables: boolean = config.BYPASS_TABLES;
  ignore_tables: boolean = config.IGNORE_TABLES;
  google_doc: boolean = false;
  ul_item_mark: string = "*";
  emphasis_mark: string = "_";
  strong_mark: string = "**";
  single_line_break: boolean = config.SINGLE_LINE_BREAK;
  use_automatic_links: boolean = config.USE_AUTOMATIC_LINKS;
  hide_strikethrough: boolean = false;
  mark_code: boolean = config.MARK_CODE;
  wrap_list_items: boolean = config.WRAP_LIST_ITEMS;
  wrap_links: boolean = config.WRAP_LINKS;
  wrap_tables: boolean = config.WRAP_TABLES;
  pad_tables: boolean = config.PAD_TABLES;
  default_image_alt: string = config.DEFAULT_IMAGE_ALT;
  tag_callback:
    | ((
        self: HTML2Text,
        tag: string,
        attrs: { [key: string]: string | null },
        start: boolean
      ) => boolean)
    | null = null;
  open_quote: string = config.OPEN_QUOTE;
  close_quote: string = config.CLOSE_QUOTE;
  include_sup_sub: boolean = config.INCLUDE_SUP_SUB;

  // Output function/callback
  out: OutCallback;

  // Base URL for resolving relative links
  baseurl: string;

  constructor(options?: { baseurl?: string; bodywidth?: number; out?: OutCallback }) {
    this.baseurl = options?.baseurl || "";
    this.body_width = options?.bodywidth ?? config.BODY_WIDTH;
    this.out = options?.out || ((s: string) => this.outtextf(s));
    this.outtextlist = [];

    // In Python equivalent, we replaced "nbsp" with a placeholder
    config.UNIFIABLE["nbsp"] = "&nbsp_place_holder;";
  }

  // -----------------------------------------------------
  // Basic output method
  // -----------------------------------------------------
  outtextf(s: string): void {
    this.outtextlist.push(s);
    if (s.length > 0) {
      this.lastWasNL = s[s.length - 1] === "\n";
    }
  }

  // -----------------------------------------------------
  // Main conversion entry point
  // -----------------------------------------------------
  handle(html: string): string {
    this.start = true;

    const parser = new Parser(
      {
        onopentag: (name, attribs) =>
          this.handleTag(name.toLowerCase(), attribs, true),
        ontext: (text) => this.handleData(text, false),
        onclosetag: (name) =>
          this.handleTag(name.toLowerCase(), {}, false),
      },
      { decodeEntities: true }
    );

    parser.write(html);
    parser.end();

    const markdown = this.optwrap(this.finish());

    if (this.pad_tables) {
      return padTablesInText(markdown);
    } else {
      return markdown;
    }
  }

  // -----------------------------------------------------
  // Wrap-up after parsing
  // -----------------------------------------------------
  finish(): string {
    this.pbr();
    this.o("", true, "end");
    let outtext = this.outtextlist.join("");

    // Replace placeholder with actual space or &nbsp;
    const nbsp = this.unicode_snob ? "&nbsp;" : " ";
    outtext = outtext.replace(/&nbsp_place_holder;/g, nbsp);

    this.outtextlist = [];
    return outtext;
  }

  // -----------------------------------------------------
  // Entity/Char references
  // (Not directly used by htmlparser2 callbacks, but included)
  // -----------------------------------------------------
  handle_charref(c: string): void {
    this.handleData(this.charref(c), true);
  }

  handle_entityref(c: string): void {
    const ref = this.entityref(c);
    if (ref) {
      this.handleData(ref, true);
    }
  }

  // -----------------------------------------------------
  // Tag handler
  // -----------------------------------------------------
  handleTag(
    tag: string,
    attrs: { [key: string]: string | null },
    start: boolean
  ): void {
    this.current_tag = tag;

    // Tag callback if given
    if (this.tag_callback) {
      if (this.tag_callback(this, tag, attrs, start) === true) {
        return;
      }
    }

    // Automatic link checking
    if (
      start &&
      this.maybe_automatic_link !== null &&
      !["p", "div", "style", "dl", "dt"].includes(tag) &&
      (tag !== "img" || this.ignore_images)
    ) {
      this.o("[");
      this.maybe_automatic_link = null;
      this.empty_link = false;
    }

    // If we are in "google_doc" mode, gather style info
    let tag_style: { [key: string]: string } = {};
    let parent_style: { [key: string]: string } = {};
    if (this.google_doc) {
      if (start) {
        if (this.tag_stack.length > 0) {
          parent_style = this.tag_stack[this.tag_stack.length - 1][2];
        }
        tag_style = elementStyle(attrs, this.style_def, parent_style);
        this.tag_stack.push([tag, attrs, tag_style]);
      } else {
        const popped = this.tag_stack.pop();
        if (popped) {
          // destructure to retrieve second and third element
          [, attrs, tag_style] = popped;
        }
        if (this.tag_stack.length > 0) {
          parent_style = this.tag_stack[this.tag_stack.length - 1][2];
        }
      }
    }

    // Headings
    if (hn(tag) > 0) {
      if (this.astack.length > 0) {
        // If inside an <a> element
        if (start) {
          this.inheader = true;
          if (
            this.outtextlist.length > 0 &&
            this.outtextlist[this.outtextlist.length - 1] === "["
          ) {
            // Edge case if we had inserted "["
            this.outtextlist.pop();
            this.space = false;
            this.o("#".repeat(hn(tag)) + " ");
            this.o("[");
          }
        } else {
          this.p_p = 0;
          this.inheader = false;
          return;
        }
      } else {
        // Normal heading
        this.p();
        if (start) {
          this.inheader = true;
          this.o("#".repeat(hn(tag)) + " ");
        } else {
          this.inheader = false;
          return;
        }
      }
    }

    // Paragraph-like tags
    if (["p", "div"].includes(tag)) {
      if (this.google_doc) {
        if (start && googleHasHeight(tag_style)) {
          this.p();
        } else {
          this.soft_br();
        }
      } else if (this.astack.length > 0 || this.split_next_td) {
        // do nothing, they're inside a table cell or anchor
      } else {
        this.p();
      }
    }

    // Line breaks
    if (tag === "br" && start) {
      if (this.blockquote > 0) {
        this.o("  \n> ");
      } else {
        this.o("  \n");
      }
    }

    // Horizontal rule
    if (tag === "hr" && start) {
      this.p();
      this.o("* * *");
      this.p();
    }

    // Head/Style/Script => quiet mode
    if (["head", "style", "script"].includes(tag)) {
      if (start) {
        this.quiet += 1;
      } else {
        this.quiet -= 1;
      }
    }

    // For style parsing in google_doc mode
    if (tag === "style") {
      if (start) {
        this.style += 1;
      } else {
        this.style -= 1;
      }
    }

    // Body => reset quiet
    if (tag === "body") {
      this.quiet = 0;
    }

    // Blockquotes
    if (tag === "blockquote") {
      if (start) {
        this.p();
        this.o("> ", true);
        this.start = true;
        this.blockquote += 1;
      } else {
        this.blockquote -= 1;
        this.p();
      }
    }

    // Basic emphasis: em, i, u
    if (["em", "i", "u"].includes(tag) && !this.ignore_emphasis) {
      if (start) {
        // Insert an emphasis mark, might handle spacing
        let emphStr = "";
        if (
          this.preceding_data &&
          !/\s/.test(this.preceding_data[this.preceding_data.length - 1]) &&
          !/[^\w]/.test(this.preceding_data[this.preceding_data.length - 1])
        ) {
          emphStr = " " + this.emphasis_mark;
          this.preceding_data += " ";
        } else {
          emphStr = this.emphasis_mark;
        }
        this.o(emphStr);
        this.stressed = true;
      }
    }

    // Strong, b
    if (["strong", "b"].includes(tag) && !this.ignore_emphasis) {
      if (start) {
        let strongStr = "";
        if (
          this.preceding_data &&
          this.strong_mark.length > 0 &&
          this.preceding_data[this.preceding_data.length - 1] ===
            this.strong_mark[0]
        ) {
          strongStr = " " + this.strong_mark;
          this.preceding_data += " ";
        } else {
          strongStr = this.strong_mark;
        }
        this.o(strongStr);
        this.stressed = true;
      }
    }

    // Strike-through
    if (["del", "strike", "s"].includes(tag)) {
      if (start) {
        let strike = "";
        if (
          this.preceding_data &&
          this.preceding_data[this.preceding_data.length - 1] === "~"
        ) {
          strike = " ~~";
          this.preceding_data += " ";
        } else {
          strike = "~~";
        }
        this.o(strike);
        this.stressed = true;
      }
    }

    // Additional emphasis for google docs style
    if (this.google_doc && !this.inheader) {
      this.handle_emphasis(start, tag_style, parent_style);
    }

    // Inline code
    if (["kbd", "code", "tt"].includes(tag) && !this.pre) {
      this.o("`");
      this.code = !this.code;
    }

    // Abbreviation
    if (tag === "abbr") {
      if (start) {
        this.abbr_title = null;
        this.abbr_data = "";
        if ("title" in attrs) {
          this.abbr_title = attrs["title"];
        }
      } else {
        if (this.abbr_title !== null && this.abbr_data !== null) {
          this.abbr_list[this.abbr_data] = this.abbr_title;
          this.abbr_title = null;
        }
        this.abbr_data = null;
      }
    }

    // <q> => inline quotes
    if (tag === "q") {
      if (!this.quote) {
        this.o(this.open_quote);
      } else {
        this.o(this.close_quote);
      }
      this.quote = !this.quote;
    }

    // Helper function for link output
    function link_url(self: HTML2Text, link: string, title: string = ""): void {
      const url = new URL(link, self.baseurl).toString();
      const titleStr = title.trim() ? ` "${title}"` : "";
      self.o(`](${escapeMd(url)}${titleStr})`);
    }

    // Anchors
    if (tag === "a" && !this.ignore_links) {
      if (start) {
        if (
          "href" in attrs &&
          attrs["href"] !== null &&
          !(
            this.skip_internal_links && 
            attrs["href"].startsWith("#")
          ) &&
          !(
            this.ignore_mailto_links && 
            attrs["href"].startsWith("mailto:")
          )
        ) {
          this.astack.push(attrs);
          this.maybe_automatic_link = attrs["href"];
          this.empty_link = true;
          if (this.protect_links) {
            attrs["href"] = "<" + attrs["href"] + ">";
          }
        } else {
          this.astack.push(null);
        }
      } else {
        if (this.astack.length > 0) {
          const a = this.astack.pop();
          if (this.maybe_automatic_link && !this.empty_link) {
            // We had data in the link
            this.maybe_automatic_link = null;
          } else if (a) {
            if (this.empty_link) {
              // The link text was empty
              this.o("[");
              this.empty_link = false;
              this.maybe_automatic_link = null;
            }
            // Inline links?
            if (this.inline_links) {
              this.p_p = 0;
              let title = a["title"] || "";
              title = escapeMd(title);
              link_url(this, a["href"]!, title);
            } else {
              // Reference-style link
              const i = this.previousIndex(a);
              if (i !== null) {
                const a_props = this.a[i];
                this.o("][" + a_props.count + "]");
              } else {
                this.acount += 1;
                const a_props = new AnchorElement(a, this.acount, this.outcount);
                this.a.push(a_props);
                this.o("][" + a_props.count + "]");
              }
            }
          }
        }
      }
    }

    // Images
    if (tag === "img" && start && !this.ignore_images) {
      if ("src" in attrs && attrs["src"] !== null) {
        // if images_to_alt => we just show the alt text
        if (!this.images_to_alt) {
          attrs["href"] = attrs["src"];
        }
        const alt = attrs["alt"] || this.default_image_alt;
        if (
          this.images_as_html ||
          (this.images_with_size &&
            (("width" in attrs) || ("height" in attrs)))
        ) {
          // Output as raw HTML
          this.o("<img src='" + attrs["src"] + "' ");
          if ("width" in attrs && attrs["width"] !== null) {
            this.o("width='" + attrs["width"] + "' ");
          }
          if ("height" in attrs && attrs["height"] !== null) {
            this.o("height='" + attrs["height"] + "' ");
          }
          if (alt) {
            this.o("alt='" + alt + "' ");
          }
          this.o("/>");
          return;
        }

        // If we were in an automatic link context
        if (this.maybe_automatic_link !== null) {
          const href = this.maybe_automatic_link;
          if (
            this.images_to_alt &&
            escapeMd(alt) === href &&
            this.absolute_url_matcher.test(href)
          ) {
            this.o("<" + escapeMd(alt) + ">");
            this.empty_link = false;
            return;
          } else {
            this.o("[");
            this.maybe_automatic_link = null;
            this.empty_link = false;
          }
        }

        // Output as markdown image
        if (this.images_to_alt) {
          this.o(escapeMd(alt));
        } else {
          this.o("![" + escapeMd(alt) + "]");
          if (this.inline_links) {
            const href = attrs["href"] || "";
            this.o(
              "(" + escapeMd(new URL(href, this.baseurl).toString()) + ")"
            );
          } else {
            const i = this.previousIndex(attrs);
            if (i !== null) {
              const a_props = this.a[i];
              this.o("[" + a_props.count + "]");
            } else {
              this.acount += 1;
              const a_props = new AnchorElement(attrs, this.acount, this.outcount);
              this.a.push(a_props);
              this.o("[" + a_props.count + "]");
            }
          }
        }
      }
    }

    // Definition lists
    if (tag === "dl" && start) {
      this.p();
    }
    if (tag === "dt" && !start) {
      this.pbr();
    }
    if (tag === "dd" && start) {
      this.o("    ");
    }
    if (tag === "dd" && !start) {
      this.pbr();
    }

    // Lists (ol, ul)
    if (["ol", "ul"].includes(tag)) {
      if (this.list.length === 0 && !this.lastWasList) {
        this.p();
      }
      if (start) {
        const list_style = this.google_doc ? googleListStyle(tag_style) : tag;
        const numbering_start = listNumberingStart(attrs);
        this.list.push(new ListElement(list_style, numbering_start));
      } else {
        if (this.list.length > 0) {
          this.list.pop();
          if (!this.google_doc && this.list.length === 0) {
            this.o("\n");
          }
        }
      }
      this.lastWasList = true;
    } else {
      this.lastWasList = false;
    }

    // Tables
    if (["table", "tr", "td", "th"].includes(tag)) {
      // ignoring entirely
      if (this.ignore_tables) {
        if (tag === "tr") {
          if (!start) {
            this.soft_br();
          }
        }
      } else if (this.bypass_tables) {
        // show table tags as raw HTML
        if (start) {
          this.soft_br();
        }
        if (["td", "th"].includes(tag)) {
          if (start) {
            this.o(`<${tag}>\n\n`);
          } else {
            this.o(`\n</${tag}>`);
          }
        } else {
          if (start) {
            this.o(`<${tag}>`);
          } else {
            this.o(`</${tag}>`);
          }
        }
      } else {
        // Normal table processing
        if (tag === "table") {
          if (start) {
            this.table_start = true;
            if (this.pad_tables) {
              this.o("<" + config.TABLE_MARKER_FOR_PAD + ">");
              this.o("  \n");
            }
          } else {
            if (this.pad_tables) {
              this.soft_br();
              this.o("</" + config.TABLE_MARKER_FOR_PAD + ">");
              this.o("  \n");
            }
          }
        }
        if (["td", "th"].includes(tag) && start) {
          if (this.split_next_td) {
            this.o("| ");
          }
          this.split_next_td = true;
        }
        if (tag === "tr" && start) {
          this.td_count = 0;
        }
        if (tag === "tr" && !start) {
          this.split_next_td = false;
          this.soft_br();
        }
        if (tag === "tr" && !start && this.table_start) {
          // Insert alignment row
          this.o("|" + Array(this.td_count).fill("---").join("|"));
          this.soft_br();
          this.table_start = false;
        }
        if (["td", "th"].includes(tag) && start) {
          this.td_count += 1;
        }
      }
    }

    // Pre/code blocks
    if (tag === "pre") {
      if (start) {
        this.startpre = true;
        this.pre = true;
      } else {
        this.pre = false;
        if (this.mark_code) {
          this.out("\n[/code]");
        }
      }
      this.p();
    }

    // Sup/Sub
    if (["sup", "sub"].includes(tag) && this.include_sup_sub) {
      if (start) {
        this.o(`<${tag}>`);
      } else {
        this.o(`</${tag}>`);
      }
    }
  }

  // -----------------------------------------------------
  // Insert paragraph break
  // -----------------------------------------------------
  pbr(): void {
    if (this.p_p === 0) {
      this.p_p = 1;
    }
  }

  // Insert blank line (or single line if config says so)
  p(): void {
    this.p_p = this.single_line_break ? 1 : 2;
  }

  // Soft line break
  soft_br(): void {
    this.pbr();
    this.br_toggle = "  ";
  }

  // Output function that respects blockquote, pre, etc.
  o(
    data: string,
    puredata: boolean = false,
    force: boolean | string = false
  ): void {
    if (this.abbr_data !== null) {
      this.abbr_data += data;
    }

    if (!this.quiet) {
      if (this.google_doc) {
        const lstripped_data = data.trimStart();
        if (this.drop_white_space && !this.pre && !this.code) {
          data = lstripped_data;
        }
        if (lstripped_data !== "") {
          this.drop_white_space = 0;
        }
      }

      if (puredata && !this.pre) {
        data = data.replace(/\s+/g, " ");
        if (data && data[0] === " ") {
          this.space = true;
          data = data.substring(1);
        }
      }

      if (!data && !force) {
        return;
      }

      if (this.startpre) {
        if (!data.startsWith("\n") && !data.startsWith("\r\n")) {
          data = "\n" + data;
        }
        if (this.mark_code) {
          this.out("\n[code]");
          this.p_p = 0;
        }
      }

      let bq = ">".repeat(this.blockquote);
      if (this.blockquote && !(force && data && data[0] === ">")) {
        bq += " ";
      }

      // Indentation for <pre>
      if (this.pre) {
        if (this.list.length === 0) {
          bq += "    ";
        }
        bq += "    ".repeat(this.list.length);
        data = data.replace(/\n/g, "\n" + bq);
      }

      if (this.startpre) {
        this.startpre = false;
        if (this.list.length > 0) {
          data = data.replace(/^\n+/, "");
        }
      }

      if (this.start) {
        this.space = false;
        this.p_p = 0;
        this.start = false;
      }

      if (force === "end") {
        this.p_p = 0;
        this.out("\n");
        this.space = false;
      }

      if (this.p_p) {
        this.out((this.br_toggle + "\n" + bq).repeat(this.p_p));
        this.space = false;
        this.br_toggle = "";
      }

      if (this.space) {
        if (!this.lastWasNL) {
          this.out(" ");
        }
        this.space = false;
      }

      // If we have un-posted anchors and we finished a paragraph or the doc
      if (
        this.a.length > 0 &&
        ((this.p_p === 2 && this.links_each_paragraph) || force === "end")
      ) {
        if (force === "end") {
          this.out("\n");
        }
        const newa: AnchorElement[] = [];
        for (const link of this.a) {
          if (this.outcount > link.outcount) {
            this.out(
              "   [" +
                link.count +
                "]: " +
                new URL(link.attrs["href"]!, this.baseurl).toString()
            );
            if (link.attrs["title"]) {
              this.out(" (" + link.attrs["title"] + ")");
            }
            this.out("\n");
          } else {
            newa.push(link);
          }
        }
        if (this.a.toString() !== newa.toString()) {
          this.out("\n");
        }
        this.a = newa;
      }

      // Write out abbreviations at the end
      if (Object.keys(this.abbr_list).length > 0 && force === "end") {
        for (const abbr in this.abbr_list) {
          if (this.abbr_list.hasOwnProperty(abbr)) {
            this.out("  *[" + abbr + "]: " + this.abbr_list[abbr] + "\n");
          }
        }
      }

      this.p_p = 0;
      this.out(data);
      this.outcount += 1;
    }
  }

  // -----------------------------------------------------
  // Actual text data
  // -----------------------------------------------------
  handleData(data: string, entity_char: boolean = false): void {
    if (!data) {
      return;
    }

    if (this.stressed) {
      data = data.trim();
      this.stressed = false;
      this.preceding_stressed = true;
    } else if (this.preceding_stressed) {
      if (
        data[0] &&
        data[0].match(/[^][(){}\s.!?]/) &&
        !hn(this.current_tag) &&
        !["a", "code", "pre"].includes(this.current_tag)
      ) {
        data = " " + data;
      }
      this.preceding_stressed = false;
    }

    if (this.style) {
      // Possibly capturing CSS, if this.google_doc
      this.style_def = Object.assign(this.style_def, dumbCssParser(data));
    }

    // Maybe automatic link
    if (this.maybe_automatic_link !== null) {
      const href = this.maybe_automatic_link;
      if (
        href === data &&
        this.absolute_url_matcher.test(href) &&
        this.use_automatic_links
      ) {
        this.o("<" + data + ">");
        this.empty_link = false;
        return;
      } else {
        this.o("[");
        this.maybe_automatic_link = null;
        this.empty_link = false;
      }
    }

    // If not in <code> or <pre>, do some escaping
    if (!this.code && !this.pre && !entity_char) {
      data = escapeMdSection(
        data,
        this.escape_snob,
        this.escape_backslash,
        this.escape_dot,
        this.escape_plus,
        this.escape_dash
      );
    }

    this.preceding_data = data;
    this.o(data, true);
  }

  // Convert char ref
  charref(name: string): string {
    let c: number;
    if (name[0] === "x" || name[0] === "X") {
      c = parseInt(name.slice(1), 16);
    } else {
      c = parseInt(name, 10);
    }
    if (!this.unicode_snob && c in unifiableN) {
      return unifiableN[c];
    } else {
      try {
        return String.fromCharCode(c);
      } catch (err) {
        return "";
      }
    }
  }

  // Convert entity ref
  entityref(c: string): string {
    if (!this.unicode_snob && c in config.UNIFIABLE) {
      return config.UNIFIABLE[c];
    }
    try {
      // fallback
      const ch = "";
      return c === "nbsp" ? config.UNIFIABLE[c] : ch;
    } catch (err) {
      return "&" + c + ";";
    }
  }

  // Google docs indentation for nested lists
  google_nest_count(style: { [key: string]: string }): number {
    let nest_count = 0;
    if ("margin-left" in style) {
      nest_count =
        parseInt(style["margin-left"].slice(0, -2), 10) /
        this.google_list_indent;
    }
    return nest_count;
  }

  // -----------------------------------------------------
  // Allow updating parameters after construction
  // -----------------------------------------------------
  update_params(params: { [key: string]: any }): void {
    Object.assign(this, params);
  }

  // -----------------------------------------------------
  // Word wrapping of final output
  // -----------------------------------------------------
  optwrap(text: string): string {
    if (!this.body_width) {
      return text;
    }
    let result = "";
    let newlines = 0;

    // If we want to preserve inline links => we skip wrapping them in place
    if (!this.wrap_links) {
      this.inline_links = false;
    }
    const paras = text.split("\n");

    for (const para of paras) {
      if (para.length > 0) {
        if (!skipwrap(para, this.wrap_links, this.wrap_list_items, this.wrap_tables)) {
          // Indent detection
          let indent = "";
          if (para.startsWith("  " + this.ul_item_mark)) {
            indent = "    ";
          } else if (para.startsWith("> ")) {
            indent = "> ";
          }
          // Do the actual wrapping
          const wrapped = wrap(para, {
            width: this.body_width,
            cut: false,
            indent: indent,
          });
          result += wrapped + "\n";

          // If line ended with two spaces, preserve them
          if (para.endsWith("  ")) {
            result += "  \n";
            newlines = 1;
          } else if (indent) {
            result += "\n";
            newlines = 1;
          } else {
            result += "\n";
            newlines = 2;
          }
        } else {
          // A line we skip wrapping on (like code or list lines)
          if (!config.RE_SPACE.test(para)) {
            result += para + "\n";
            newlines = 1;
          }
        }
      } else {
        // blank line
        if (newlines < 2) {
          result += "\n";
          newlines += 1;
        }
      }
    }

    return result;
  }

  // -----------------------------------------------------
  // Public convenience function for external usage
  // -----------------------------------------------------
  static html2text(
    html: string,
    baseurl: string = "",
    bodywidth?: number
  ): string {
    if (bodywidth === undefined) {
      bodywidth = config.BODY_WIDTH;
    }
    const converter = new HTML2Text({ baseurl, bodywidth });
    return converter.handle(html);
  }

  // -----------------------------------------------------
  // Logic for finding previous anchors
  // -----------------------------------------------------
  previousIndex(attrs: { [key: string]: string | null }): number | null {
    const href = attrs["href"];
    if (!href) {
      return null;
    }
    for (let i = 0; i < this.a.length; i++) {
      if (this.a[i].attrs["href"] === href) {
        return i;
      }
    }
    return null;
  }

  // -----------------------------------------------------
  // Handle emphasis for Google Docs style
  // -----------------------------------------------------
  handle_emphasis(
    start: boolean,
    tagStyle: { [key: string]: string },
    parentStyle: { [key: string]: string }
  ): void {
    const tagEmphasis = googleTextEmphasis(tagStyle);
    const parentEmphasis = googleTextEmphasis(parentStyle);
    const strikethrough = tagEmphasis.includes("line-through") && this.hide_strikethrough;
    let bold = false;
    for (const bold_marker of config.BOLD_TEXT_STYLE_VALUES) {
      if (tagEmphasis.includes(bold_marker) && !parentEmphasis.includes(bold_marker)) {
        bold = true;
        break;
      }
    }
    const italic = tagEmphasis.includes("italic") && !parentEmphasis.includes("italic");
    const fixed = googleFixedWidthFont(tagStyle) && !googleFixedWidthFont(parentStyle) && !this.pre;
    if (start) {
      if (bold || italic || fixed) {
        this.emphasis += 1;
      }
      if (strikethrough) {
        this.quiet += 1;
      }
      if (italic) {
        this.o(this.emphasis_mark);
        this.drop_white_space += 1;
      }
      if (bold) {
        this.o(this.strong_mark);
        this.drop_white_space += 1;
      }
      if (fixed) {
        this.o("`");
        this.drop_white_space += 1;
        this.code = true;
      }
    } else {
      if (bold || italic || fixed) {
        this.emphasis -= 1;
        this.space = false;
      }
      if (fixed) {
        if (this.drop_white_space) {
          this.drop_white_space -= 1;
        } else {
          this.o("`");
        }
        this.code = false;
      }
      if (bold) {
        if (this.drop_white_space) {
          this.drop_white_space -= 1;
        } else {
          this.o(this.strong_mark);
        }
      }
      if (italic) {
        if (this.drop_white_space) {
          this.drop_white_space -= 1;
        } else {
          this.o(this.emphasis_mark);
        }
      }
      if ((bold || italic) && this.emphasis === 0) {
        this.o(" ");
      }
      if (strikethrough) {
        this.quiet -= 1;
      }
    }
  }
}