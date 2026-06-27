/**
 * Design Tokens - Central Style Guide for dao-app
 *
 * This file serves as the single source of truth for design values.
 * Use these tokens to ensure consistency across all components.
 *
 * DARK MODE SUPPORT (via next-themes + CSS variables):
 * All semantic tokens automatically adapt between light/dark mode.
 * Theme is controlled via `<ThemeProvider>` in layout.tsx.
 * Toggle in: /app/einstellungen (Erscheinungsbild section).
 *
 * Light mode palette:
 *   Background: #ffffff (white)
 *   Card:       #ffffff
 *   Primary:    #00498B (dark blue)
 *   Text:       #0a0a0a / #737373 (foreground / muted)
 *
 * Dark mode palette:
 *   Background: #202124 (near-black)
 *   Card:       #3c4043 (medium-dark gray)
 *   Primary:    #7ABBF2 (light blue)
 *   Text:       #e8eaed / #9aa0a6 (foreground / muted)
 *
 * NEVER use hardcoded colors (bg-card, text-foreground, border-border).
 * Always use semantic tokens (bg-card, text-foreground, border-border).
 * See colorMigration map below for the full mapping.
 */

// =============================================================================
// COLOR TOKENS
// =============================================================================

export const colors = {
  // Text colors - use these for all text styling
  text: {
    primary: "text-foreground", // Main text color
    secondary: "text-muted-foreground", // Subdued text (descriptions, captions)
    tertiary: "text-muted-foreground/70", // Even more subdued
    inverse: "text-primary-foreground", // Text on colored backgrounds
    success: "text-success", // Success states
    error: "text-destructive", // Error states
    warning: "text-warning", // Warning states
    info: "text-info", // Info states
    link: "text-primary hover:text-primary/80", // Link styling
  },

  // Background colors
  background: {
    primary: "bg-background", // Main page background
    secondary: "bg-muted", // Secondary/card backgrounds
    tertiary: "bg-muted/50", // Subtle backgrounds
    card: "bg-card", // Card backgrounds
    success: "bg-success/10", // Success state backgrounds
    error: "bg-destructive/10", // Error state backgrounds
    warning: "bg-warning/10", // Warning state backgrounds
    info: "bg-info/10", // Info state backgrounds
  },

  // Border colors
  border: {
    default: "border-border", // Default borders
    subtle: "border-border/50", // Subtle borders
    success: "border-success/30", // Success state borders
    error: "border-destructive/30", // Error state borders
    warning: "border-warning/30", // Warning state borders
    info: "border-info/30", // Info state borders
  },
} as const;

// =============================================================================
// TYPOGRAPHY TOKENS
// =============================================================================

export const typography = {
  // Headings - all levels use Mona Sans SemiCondensed (h1/h2 bold, h3/h4 semibold)
  h1: "text-3xl font-bold tracking-tight font-heading",
  h2: "text-2xl font-bold tracking-tight font-heading",
  h3: "text-xl font-semibold tracking-tight font-heading",
  h4: "text-lg font-semibold font-heading",

  // Body text
  bodyLarge: "text-base text-foreground leading-relaxed",
  body: "text-sm text-foreground",
  bodySmall: "text-xs text-foreground",

  // UI text
  label: "text-sm font-medium text-foreground",
  caption: "text-xs text-muted-foreground",
  helper: "text-xs text-muted-foreground",

  // Special
  mono: "font-mono text-sm",
  link: "text-primary underline hover:opacity-80 transition-opacity",
} as const;

// =============================================================================
// SPACING TOKENS
// =============================================================================

export const spacing = {
  // Page-level layout
  page: {
    padding: "px-4 sm:px-6 lg:px-8",
    maxWidth: "max-w-7xl mx-auto",
    gutter: "py-8 md:py-12",
  },

  // Section spacing (between major page sections)
  section: {
    gap: "space-y-8",
    padding: "py-8 md:py-12",
  },

  // Content spacing (within sections)
  content: {
    gap: "space-y-4",
    padding: "p-6",
  },

  // Item spacing (between list items, form fields)
  items: {
    gap: "space-y-3",
    tight: "space-y-2",
  },

  // Inline element spacing
  inline: {
    tight: "gap-2",
    normal: "gap-3",
    loose: "gap-4",
    wide: "gap-6",
  },

  // Card internal spacing
  card: {
    padding: "p-6",
    paddingSmall: "p-4",
    gap: "space-y-4",
  },

  // Form spacing
  form: {
    gap: "space-y-6",
    fieldGap: "space-y-2",
    labelGap: "mb-2",
  },
} as const;

// =============================================================================
// COMPONENT TOKENS
// =============================================================================

export const components = {
  // Card styling
  card: {
    base: "bg-card border border-border rounded-lg",
    interactive: "bg-card border border-border rounded-lg hover:border-border/80 hover:shadow-md transition-all",
    elevated: "bg-card border border-border rounded-lg shadow-sm",
  },

  // Button base (for custom buttons not using Button component)
  button: {
    base: "inline-flex items-center justify-center rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
  },

  // Input styling
  input: {
    base: "w-full bg-background border border-input rounded-lg px-4 py-3 text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors",
    error: "border-destructive focus:ring-destructive",
  },

  // Link styling
  link: {
    default: "text-muted-foreground hover:text-foreground transition-colors",
    primary: "text-primary hover:text-primary/80 transition-colors",
    nav: "text-foreground hover:text-primary transition-colors",
  },
} as const;

// =============================================================================
// STATUS COLORS (for badges, alerts, etc.)
// =============================================================================

export const status = {
  // Generic status states
  pending: {
    bg: "bg-muted",
    border: "border-muted",
    text: "text-muted-foreground",
  },
  success: {
    bg: "bg-success/10",
    border: "border-success/30",
    text: "text-success",
  },
  error: {
    bg: "bg-destructive/10",
    border: "border-destructive/30",
    text: "text-destructive",
  },
  warning: {
    bg: "bg-warning/10",
    border: "border-warning/30",
    text: "text-warning",
  },
  info: {
    bg: "bg-info/10",
    border: "border-info/30",
    text: "text-info",
  },

  // Proposal-specific states (with dark mode variants for saturated backgrounds)
  proposal: {
    active: {
      bg: "bg-green-50 dark:bg-green-950",
      border: "border-green-200 dark:border-green-800",
      text: "text-green-700 dark:text-green-400",
    },
    defeated: {
      bg: "bg-red-50 dark:bg-red-950",
      border: "border-red-200 dark:border-red-800",
      text: "text-red-700 dark:text-red-400",
    },
    succeeded: {
      bg: "bg-blue-50 dark:bg-blue-950",
      border: "border-blue-200 dark:border-blue-800",
      text: "text-blue-700 dark:text-blue-400",
    },
    executed: {
      bg: "bg-purple-50 dark:bg-purple-950",
      border: "border-purple-200 dark:border-purple-800",
      text: "text-purple-700 dark:text-purple-400",
    },
    canceled: {
      bg: "bg-muted",
      border: "border-border",
      text: "text-muted-foreground",
    },
    queued: {
      bg: "bg-yellow-50 dark:bg-yellow-950",
      border: "border-yellow-200 dark:border-yellow-800",
      text: "text-yellow-700 dark:text-yellow-400",
    },
  },
} as const;

// =============================================================================
// COLOR MIGRATION MAP
// =============================================================================

/**
 * Reference map for migrating hardcoded colors to semantic tokens.
 * Use this when refactoring existing components.
 */
export const colorMigration = {
  // Text colors
  "text-foreground": "text-foreground",
  "text-white": "text-primary-foreground",
  "text-muted-foreground": "text-muted-foreground",

  // Background colors
  "bg-card": "bg-card",
  "bg-muted": "bg-muted",
  "bg-foreground": "bg-foreground",

  // Hover backgrounds
  "hover:bg-accent": "hover:bg-accent",
  "hover:bg-foreground": "hover:bg-foreground/90",
  "hover:bg-foreground/90": "hover:bg-foreground/80",

  // Hover text
  "hover:text-foreground": "hover:text-foreground",

  // Border colors
  "border-border": "border-border",
  "border-white": "border-card",

  // Link colors
  "text-primary": "text-primary",
  "hover:text-primary/80": "hover:text-primary/80",

  // Status backgrounds (for dark mode, use dark: prefix for saturated bg)
  "bg-blue-50": "bg-blue-50 dark:bg-blue-950",
  "bg-green-50": "bg-green-50 dark:bg-green-950",
  "bg-red-50": "bg-red-50 dark:bg-red-950",
  "bg-yellow-50": "bg-yellow-50 dark:bg-yellow-950",
  "bg-purple-50": "bg-purple-50 dark:bg-purple-950",
} as const;

// =============================================================================
// EXPORTS
// =============================================================================

export const tokens = {
  colors,
  typography,
  spacing,
  components,
  status,
  colorMigration,
} as const;

export default tokens;
