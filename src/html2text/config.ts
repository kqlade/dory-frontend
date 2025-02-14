// config.ts

export const UNICODE_SNOB = false;

// Marker to use for marking tables for padding post processing.
export const TABLE_MARKER_FOR_PAD = "special_marker_for_table_padding";

// Escape options – if true, extra escaping is applied (output may be less readable).
export const ESCAPE_SNOB = false;
export const ESCAPE_BACKSLASH = false;
export const ESCAPE_DOT = false;
export const ESCAPE_PLUS = false;
export const ESCAPE_DASH = false;

// Link handling options.
export const LINKS_EACH_PARAGRAPH = false;

// Wrap long lines at a given position (0 means no wrapping).
export const BODY_WIDTH = 78;

// Internal link filtering.
export const SKIP_INTERNAL_LINKS = true;

// Use inline formatting for images and links.
export const INLINE_LINKS = true;

// Protect links by surrounding them with angle brackets.
export const PROTECT_LINKS = false;
export const WRAP_LINKS = true;

// Wrap list items.
export const WRAP_LIST_ITEMS = false;

// Wrap tables.
export const WRAP_TABLES = false;

// Google Docs list indent (in pixels).
export const GOOGLE_LIST_INDENT = 36;

// Values that may indicate bold text.
export const BOLD_TEXT_STYLE_VALUES: string[] = ["bold", "700", "800", "900"];

// Other ignore/formatting flags.
export const IGNORE_ANCHORS = false;
export const IGNORE_MAILTO_LINKS = false;
export const IGNORE_IMAGES = false;
export const IMAGES_AS_HTML = false;
export const IMAGES_TO_ALT = false;
export const IMAGES_WITH_SIZE = false;
export const IGNORE_EMPHASIS = false;
export const MARK_CODE = false;
export const DECODE_ERRORS = "strict";
export const DEFAULT_IMAGE_ALT = "";
export const PAD_TABLES = false;

// Automatic link conversion.
export const USE_AUTOMATIC_LINKS = true;

// Regular expression for checking space-only lines.
export const RE_SPACE = /\s\+/;

// Regular expressions for ordered and unordered lists.
export const RE_ORDERED_LIST_MATCHER = /\d+\.\s/;
export const RE_UNORDERED_LIST_MATCHER = /[-\*\+]\s/;

// Regex to escape markdown-special characters (basic and all).
export const RE_MD_CHARS_MATCHER = /([\\\[\]\(\)])/;
export const RE_MD_CHARS_MATCHER_ALL = /([`\*_{}\[\]()#+\-.!])/;

// Regex for finding links in text.
export const RE_LINK = /(\[.*?\] ?\(.*?\))|(\[.*?\]:.*?)/;

// Regex for finding table separators.
export const RE_TABLE = / \| /;

// For matching a dot after a number at the beginning of a line.
export const RE_MD_DOT_MATCHER = new RegExp(
  String.raw`^(\s*\d+)(\.)(?=\s)`,
  "m"
);

// For matching a plus sign after optional whitespace.
export const RE_MD_PLUS_MATCHER = new RegExp(
  String.raw`^(\s*)(\+)(?=\s)`,
  "m"
);

// For matching a dash with specific conditions.
export const RE_MD_DASH_MATCHER = new RegExp(
  String.raw`^(\s*)(-)(?=\s|\-)`,
  "m"
);

// Characters that require escaping for markdown.
export const RE_SLASH_CHARS = "\\`*_{}[]()#+-.!";

// Regex to escape those characters – note we need a helper to escape them properly in the regex.
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const RE_MD_BACKSLASH_MATCHER = new RegExp(
  String.raw`(\\)(?=[${escapeRegExp(RE_SLASH_CHARS)}])`,
  "g"
);

// Mapping of HTML entity names to replacement strings.
export const UNIFIABLE: { [key: string]: string } = {
  "rsquo": "'",
  "lsquo": "'",
  "rdquo": '"',
  "ldquo": '"',
  "copy": "(C)",
  "mdash": "--",
  "nbsp": " ",
  "rarr": "->",
  "larr": "<-",
  "middot": "*",
  "ndash": "-",
  "oelig": "oe",
  "aelig": "ae",
  "agrave": "a",
  "aacute": "a",
  "acirc": "a",
  "atilde": "a",
  "auml": "a",
  "aring": "a",
  "egrave": "e",
  "eacute": "e",
  "ecirc": "e",
  "euml": "e",
  "igrave": "i",
  "iacute": "i",
  "icirc": "i",
  "iuml": "i",
  "ograve": "o",
  "oacute": "o",
  "ocirc": "o",
  "otilde": "o",
  "ouml": "o",
  "ugrave": "u",
  "uacute": "u",
  "ucirc": "u",
  "uuml": "u",
  "lrm": "",
  "rlm": "",
};

// Table handling options.
export const BYPASS_TABLES = false;
export const IGNORE_TABLES = false;

// Use a single line break after a block element (requires BODY_WIDTH = 0).
export const SINGLE_LINE_BREAK = false;

// Use double quotation marks when converting <q> tags.
export const OPEN_QUOTE = '"';
export const CLOSE_QUOTE = '"';

// Include <sup> and <sub> tags.
export const INCLUDE_SUP_SUB = false;