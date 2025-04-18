/**
 * Theme Colors - TypeScript constants for theme colors
 * 
 * This file provides color constants for use in JavaScript/TypeScript components.
 * It mirrors the CSS variables defined in variables.css but allows type-safe access
 * in code.
 */

import { TOKENS, ThemeMode } from './tokens';

// Re‑export the colour maps under the legacy name to avoid broad refactors
export const COLORS = TOKENS.colors;

/**
 * Get color value based on current theme mode
 * @param isDarkMode - Whether dark mode is active
 * @param colorKey - Key of the colour in the palette
 * @returns The appropriate color for the current theme
 */
export function getThemeColor(
  isDarkMode: boolean,
  colorKey: keyof typeof COLORS.light,
): string {
  const mode: ThemeMode = isDarkMode ? 'dark' : 'light';
  return COLORS[mode][colorKey];
} 