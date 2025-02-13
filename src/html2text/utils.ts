// utils.ts
import * as config from "./config";
import { decode } from "html-entities";

// Convert the unifiable dictionary: keys are entity names and values are strings.
// We want a mapping from code point (number) to the replacement string.
// Assumes config.UNIFIABLE is an object mapping entity names to strings.
export const unifiableN: { [code: number]: string } = Object.entries(config.UNIFIABLE)
  .filter(([key, _]) => key !== "nbsp")
  .reduce((acc, [key, value]) => {
    // Use decode to convert the entity name to its Unicode character
    const decodedChar = decode(`&${key};`);
    if (decodedChar) {
      const codePoint = decodedChar.codePointAt(0);
      if (codePoint !== undefined) {
        acc[codePoint] = value;
      }
    }
    return acc;
  }, {} as { [code: number]: string });

/**
 * Returns the heading level as a number if the tag is a valid heading (e.g. "h1"),
 * otherwise returns 0.
 */
export function hn(tag: string): number {
  if (tag[0] === "h" && tag.length === 2) {
    const n = tag[1];
    if (n > "0" && n <= "9") {
      return parseInt(n, 10);
    }
  }
  return 0;
}

/**
 * Parses a CSS style string into a dictionary of properties.
 */
export function dumbPropertyDict(style: string): { [key: string]: string } {
  return style
    .split(";")
    .filter((z) => z.includes(":"))
    .map((z) => z.split(":", 2))
    .reduce((acc, [x, y]) => {
      acc[x.trim().toLowerCase()] = y.trim().toLowerCase();
      return acc;
    }, {} as { [key: string]: string });
}

/**
 * Parses a block of CSS and returns an object mapping selectors to property dictionaries.
 */
export function dumbCssParser(data: string): { [selector: string]: { [prop: string]: string } } {
  // Append a semicolon to ensure proper splitting
  data += ";";
  let importIndex = data.indexOf("@import");
  while (importIndex !== -1) {
    const semicolonIndex = data.indexOf(";", importIndex);
    data = data.substring(0, importIndex) + data.substring(semicolonIndex + 1);
    importIndex = data.indexOf("@import");
  }

  // Split the data into pairs based on "}" and then split by "{".
  const pairs = data
    .split("}")
    .filter((x) => x.trim().includes("{"))
    .map((x) => x.split("{", 2));
  let elements: { [selector: string]: { [prop: string]: string } } = {};
  try {
    elements = pairs.reduce((acc, [selector, properties]) => {
      acc[selector.trim()] = dumbPropertyDict(properties);
      return acc;
    }, {} as { [selector: string]: { [prop: string]: string } });
  } catch (error) {
    elements = {};
  }
  return elements;
}

/**
 * Merges an element's inline style and class-based styles with its parent style.
 */
export function elementStyle(
  attrs: { [key: string]: string | null },
  styleDef: { [selector: string]: { [prop: string]: string } },
  parentStyle: { [key: string]: string }
): { [key: string]: string } {
  const style = { ...parentStyle };
  if (attrs["class"]) {
    const classes = attrs["class"]!.split(/\s+/);
    for (const cssClass of classes) {
      const cssStyle = styleDef["." + cssClass] || {};
      Object.assign(style, cssStyle);
    }
  }
  if (attrs["style"]) {
    const immediateStyle = dumbPropertyDict(attrs["style"]!);
    Object.assign(style, immediateStyle);
  }
  return style;
}

/**
 * Determines the list type ("ul" or "ol") based on the CSS "list-style-type".
 */
export function googleListStyle(style: { [key: string]: string }): string {
  if ("list-style-type" in style) {
    const listStyle = style["list-style-type"];
    if (["disc", "circle", "square", "none"].includes(listStyle)) {
      return "ul";
    }
  }
  return "ol";
}

/**
 * Checks if the style contains an explicitly defined height.
 */
export function googleHasHeight(style: { [key: string]: string }): boolean {
  return "height" in style;
}

/**
 * Returns a list of emphasis modifiers based on text-decoration, font-style, and font-weight.
 */
export function googleTextEmphasis(style: { [key: string]: string }): string[] {
  const emphasis: string[] = [];
  if (style["text-decoration"]) {
    emphasis.push(style["text-decoration"]);
  }
  if (style["font-style"]) {
    emphasis.push(style["font-style"]);
  }
  if (style["font-weight"]) {
    emphasis.push(style["font-weight"]);
  }
  return emphasis;
}

/**
 * Checks if the style indicates a fixed-width font.
 */
export function googleFixedWidthFont(style: { [key: string]: string }): boolean {
  let fontFamily = "";
  if (style["font-family"]) {
    fontFamily = style["font-family"].toLowerCase();
  }
  return fontFamily === "courier new" || fontFamily === "consolas";
}

/**
 * Extracts the starting number for a list from attributes.
 */
export function listNumberingStart(attrs: { [key: string]: string | null }): number {
  if (attrs["start"]) {
    try {
      return parseInt(attrs["start"]!, 10) - 1;
    } catch (error) {
      // fall through
    }
  }
  return 0;
}

/**
 * Determines whether a paragraph should not be wrapped based on its content.
 */
export function skipwrap(
  para: string,
  wrapLinks: boolean,
  wrapListItems: boolean,
  wrapTables: boolean
): boolean {
  // If it appears to contain a link, don't wrap.
  if (!wrapLinks && config.RE_LINK.test(para)) {
    return true;
  }
  // If the text begins with four spaces or a tab, it's a code block.
  if (para.slice(0, 4) === "    " || para[0] === "\t") {
    return true;
  }
  const stripped = para.trimStart();
  // If the text begins with two dashes (but not three), treat it as an emdash.
  if (stripped.slice(0, 2) === "--" && stripped.length > 2 && stripped[2] !== "-") {
    return false;
  }
  // Check for list markers.
  if (stripped.slice(0, 1) === "-" || stripped.slice(0, 1) === "*") {
    if (stripped.slice(0, 2) !== "**") {
      return !wrapListItems;
    }
  }
  // If text contains a pipe, it is likely a table.
  if (!wrapTables && config.RE_TABLE.test(para)) {
    return true;
  }
  // If text starts with list markers as defined by our regexes, don't wrap.
  return (
    config.RE_ORDERED_LIST_MATCHER.test(stripped) ||
    config.RE_UNORDERED_LIST_MATCHER.test(stripped)
  );
}

/**
 * Escapes markdown-sensitive characters within text.
 */
export function escapeMd(text: string): string {
  return text.replace(config.RE_MD_CHARS_MATCHER, "\\$1");
}

/**
 * Escapes markdown-sensitive characters across an entire document section.
 */
export function escapeMdSection(
  text: string,
  escapeBackslash: boolean = true,
  snob: boolean = false,
  escapeDot: boolean = true,
  escapePlus: boolean = true,
  escapeDash: boolean = true
): string {
  if (escapeBackslash) {
    text = text.replace(config.RE_MD_BACKSLASH_MATCHER, "\\$1");
  }
  if (snob) {
    text = text.replace(config.RE_MD_CHARS_MATCHER_ALL, "\\$1");
  }
  if (escapeDot) {
    text = text.replace(config.RE_MD_DOT_MATCHER, "$1\\$2");
  }
  if (escapePlus) {
    text = text.replace(config.RE_MD_PLUS_MATCHER, "$1\\$2");
  }
  if (escapeDash) {
    text = text.replace(config.RE_MD_DASH_MATCHER, "$1\\$2");
  }
  return text;
}

/**
 * Reformats table lines by padding cells to a uniform width.
 */
export function reformatTable(lines: string[], rightMargin: number): string[] {
  let maxWidth = lines[0]
    .split("|")
    .map((x) => x.trimEnd().length + rightMargin);
  let maxCols = maxWidth.length;
  for (const line of lines) {
    const cols = line.split("|").map((x) => x.trimEnd());
    const numCols = cols.length;
    if (numCols < maxCols) {
      cols.push(...Array(maxCols - numCols).fill(""));
    } else if (maxCols < numCols) {
      maxWidth = maxWidth.concat(
        cols.slice(- (numCols - maxCols)).map((x) => x.length + rightMargin)
      );
      maxCols = numCols;
    }
    maxWidth = cols.map((x, i) => Math.max(x.length + rightMargin, maxWidth[i] || 0));
  }

  const newLines: string[] = [];
  for (const line of lines) {
    const cols = line.split("|").map((x) => x.trim());
    if (new Set(line.trim()).size === 1 && /[-|]/.test(line.trim())) {
      // This is a separator row.
      const filler = "-";
      const newCols = cols.map((x, i) => x + filler.repeat(maxWidth[i] - x.length));
      newLines.push("|-" + newCols.join("|") + "|");
    } else {
      const filler = " ";
      const newCols = cols.map((x, i) => x + filler.repeat(maxWidth[i] - x.length));
      newLines.push("| " + newCols.join(" | ") + " |");
    }
  }
  return newLines;
}

/**
 * Pads tables found within a text block.
 */
export function padTablesInText(text: string, rightMargin: number = 1): string {
  const lines = text.split("\n");
  const newLines: string[] = [];
  let tableBuffer: string[] = [];
  let tableStarted = false;
  for (const line of lines) {
    if (line.indexOf(config.TABLE_MARKER_FOR_PAD) !== -1) {
      tableStarted = !tableStarted;
      if (!tableStarted) {
        const table = reformatTable(tableBuffer, rightMargin);
        newLines.push(...table);
        tableBuffer = [];
        newLines.push("");
      }
      continue;
    }
    if (tableStarted) {
      tableBuffer.push(line);
    } else {
      newLines.push(line);
    }
  }
  return newLines.join("\n");
}