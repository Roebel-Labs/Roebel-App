# Project Instructions

## Styling: NativeWind v5

- **All styling uses NativeWind v5 `className`** with Tailwind CSS v4
- **Single source of truth for design tokens:** `global.css` (`@theme` block)
- **Dark mode:** CSS variables auto-switch via `@variant dark` in `global.css`. ThemeContext calls `Appearance.setColorScheme()` to bridge. No `dark:` prefix needed for themed tokens.
- **`useTheme()` only for programmatic access:** SVG icon `color` props, Reanimated, `android_ripple`, `ActivityIndicator`, `TextInput.placeholderTextColor`, `Switch.trackColor`, Mapbox
- **No new `StyleSheet.create`** — use `className` for all new components
- **View does NOT cascade text color** — every `<Text>` must have its own `text-*` class

### Token Quick Reference
| CSS Variable | Tailwind Class | Use |
|---|---|---|
| `--color-background` | `bg-background` | Screen/card backgrounds |
| `--color-surface` | `bg-surface` | Elevated surfaces |
| `--color-text-primary` | `text-text-primary` | Primary text |
| `--color-text-secondary` | `text-text-secondary` | Secondary text |
| `--color-primary` | `bg-primary` / `text-primary` | Brand color |
| `--font-inter-medium` | `font-inter-medium` | Medium weight text |
| `--text-lg` (16px) | `text-lg` | Body text |

## Figma
- **fileKey:** gy9pkojEQ4pktQhubjI57e
- **fileUrl:** https://www.figma.com/design/gy9pkojEQ4pktQhubjI57e/r%C3%B6bel?node-id=915-2&p=f&t=DsMdqcymXBG2ieQS-0
