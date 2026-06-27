// Roebel Design Tokens — shared between web (Tailwind) and mobile (useTheme)
// Primary source of truth for brand colors, spacing, and typography

export const colors = {
  navy: {
    50: "#EBF0F7",
    100: "#D6E1EF",
    200: "#B0C5DF",
    300: "#8AA9CF",
    400: "#5483B5",
    500: "#00498B", // Primary brand color
    600: "#00498B",
    700: "#143670",
    800: "#0F295D",
    900: "#0A1A30",
  },
  amber: {
    300: "#FCD34D",
    400: "#FBBF24",
    500: "#F59E0B", // Accent color
    600: "#D97706",
  },
  gray: {
    50: "#F9FAFB",
    100: "#F3F4F6",
    200: "#E5E7EB",
    300: "#D1D5DB",
    400: "#9CA3AF",
    500: "#6B7280",
    600: "#4B5563",
    700: "#374151",
    800: "#1F2937",
    900: "#111827",
  },
  feedback: {
    success: "#10B981",
    warning: "#F59E0B",
    error: "#EF4444",
    info: "#3B82F6",
  },
} as const;

export const lightTheme = {
  background: "#FFFFFF",
  surface: colors.gray[50],
  surfaceElevated: "#FFFFFF",
  textPrimary: colors.gray[900],
  textSecondary: colors.gray[500],
  textInverted: "#FFFFFF",
  primary: colors.navy[500],
  primaryHover: colors.navy[600],
  accent: colors.amber[500],
  border: colors.gray[200],
  borderFocus: colors.navy[500],
} as const;

export const darkTheme = {
  background: "#202124",
  surface: "#3c4043",
  surfaceElevated: "#3c4043",
  textPrimary: "#e8eaed",
  textSecondary: "#9aa0a6",
  textInverted: "#202124",
  primary: "#7ABBF2",
  primaryHover: "#AECBFA",
  accent: colors.amber[400],
  border: "#5f6368",
  borderFocus: "#7ABBF2",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  "2xl": 32,
  "3xl": 40,
  "4xl": 48,
  "5xl": 64,
  page: 16,
  card: 16,
  section: 24,
} as const;

export const radius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
} as const;

export const fontFamily = {
  heading: "Mona Sans SemiCondensed",
  body: "Mona Sans",
  mono: "Mona Sans Mono",
} as const;

export const fontSize = {
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 20,
  "2xl": 24,
  "3xl": 30,
} as const;
