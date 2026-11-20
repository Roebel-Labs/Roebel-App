# Project Instructions

## Styling: StyleSheet + useTheme()

- **All styling uses `StyleSheet.create()` + `useTheme()` hook** — NO NativeWind
- **Token source of truth:** `constants/theme.ts` (lightColors / darkColors)
- **Theme context:** `context/ThemeContext.tsx`
- **Dark mode:** ThemeContext provides `colors` object that auto-switches between light/dark palettes
- **Font families:** Mona Sans (SIL OFL 1.1). Use the `fontFamily` tokens from `constants/theme.ts`:
  - Body/UI: `MonaSans-Regular` / `-Medium` / `-SemiBold` / `-Bold` (tokens `regular`/`medium`/`semiBold`/`bold`)
  - Headlines: `MonaSansSemiCondensed-Bold` (token `heading`)
  - Mono: `MonaSansMono-Regular` (token `mono`)
  - Fonts are embedded at build time (`expo-font` plugin in `app.config.ts`). The legacy `Inter-*` / `GeistMono-*` aliases are GONE (embedded fonts cannot be aliased) — always use the Mona Sans names or the theme tokens; an unknown family silently falls back to the system font.
- A previous NativeWind migration attempt broke the app and was reverted. Do NOT attempt NativeWind migration.

## Figma
- **fileKey:** gy9pkojEQ4pktQhubjI57e
- **fileUrl:** https://www.figma.com/design/gy9pkojEQ4pktQhubjI57e/r%C3%B6bel?node-id=915-2&p=f&t=DsMdqcymXBG2ieQS-0
