export const TOKENS = {
  // ────────────────────────────────────────────────────────────
  //  Global design tokens – single source of truth
  //  Extend this object with additional categories (spacing, radii,
  //  typography, etc.) as your design system evolves.
  // ────────────────────────────────────────────────────────────

  /*
   * Colour palette – mirrors what was previously duplicated between
   * variables.css and colors.ts.  Keep keys stable; they are consumed
   * throughout the codebase via ThemeProvider / getThemeColor.
   */
  colors: {
    light: {
      // Core colours
      background: '#ffffff',
      text: '#202124',
      textRgb: '32, 33, 36',
      textSecondary: '#5f6368',
      textDisabled: '#9e9e9e',

      // Borders & shadows
      border: 'rgba(0, 0, 0, 0.1)',
      borderHover: 'rgba(0, 0, 0, 0.3)',
      borderFocus: 'rgba(0, 0, 0, 0.5)',
      shadow: 'rgba(0, 0, 0, 0.1)',
      shadowFocus: 'rgba(0, 0, 0, 0.15)',

      // UI colours
      accent: '#74c0fc',
      hover: 'rgba(0, 0, 0, 0.03)',
      active: 'rgba(0, 0, 0, 0.06)',
      itemHoverBg: 'rgba(0, 0, 0, 0.05)',

      // Component‑specific
      sidebarBg: '#f0f0f0',
      doryText: '#000000',

      // Secondary backgrounds
      bgSecondary: '#f5f7fa',

      // Primary colours
      primary: '#6366f1',
      primaryLight: '#e0e7ff',
    },

    dark: {
      // Core colours
      background: '#000000',
      text: '#e8eaed',
      textRgb: '232, 234, 237',
      textSecondary: '#9aa0a6',
      textDisabled: '#5f6368',

      // Borders & shadows
      border: 'rgba(255, 255, 255, 0.1)',
      borderHover: 'rgba(255, 255, 255, 0.3)',
      borderFocus: 'rgba(255, 255, 255, 0.5)',
      shadow: 'rgba(255, 255, 255, 0.1)',
      shadowFocus: 'rgba(255, 255, 255, 0.15)',

      // UI colours
      accent: '#74c0fc',
      hover: 'rgba(255, 255, 255, 0.05)',
      active: 'rgba(255, 255, 255, 0.08)',
      itemHoverBg: 'rgba(255, 255, 255, 0.05)',

      // Component‑specific
      sidebarBg: '#2d2d30',
      doryText: '#ffffff',

      // Secondary backgrounds
      bgSecondary: '#1e293b',

      // Primary colours
      primary: '#6366f1',
      primaryLight: '#e0e7ff',
    },
  },

  // Spacing scale (example – extend as needed)
  spacing: {
    xs: '4px',
    sm: '8px',
    md: '12px',
    lg: '24px',
    xl: '32px',
  },

  // Radius scale
  radii: {
    sm: '4px',
    md: '8px',
    lg: '12px',
  },

  // Z‑index hierarchy (mirrors :root in global.css)
  zIndex: {
    background: 1,
    content: 5,
    ball: 10,
    sidebar: 20,
    search: 30,
    controls: 40,
    modal: 100,
    toast: 999,
  },
} as const;

export type ThemeMode = 'light' | 'dark';
export type ColorKey = keyof typeof TOKENS.colors.light; 