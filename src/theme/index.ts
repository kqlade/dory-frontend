/**
 * Theme index file
 * 
 * Exports all theme-related utilities, components, and constants.
 * This makes imports cleaner by allowing:
 * import { useTheme, COLORS } from '../theme';
 */

export { COLORS, getThemeColor } from './colors';
export { ThemeProvider, useTheme } from './ThemeProvider'; 