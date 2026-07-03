# Netizen Mini App — Design System (DESIGN.md)

This file is the **single source of truth** for how every Netizen mini app looks and reads. The AI
builder embeds it verbatim in its system prompt, and the `_template` scaffold implements it. A mini
app that ignores this will look off-brand inside the Röbel host. Follow it exactly.

## 1. Typography — Mona Sans

- Body/UI font: **Mona Sans** (variable, weights 200–900, widths 75–125%). Expose as `--font-sans`.
- Headings: **Mona Sans SemiCondensed** (≈87.5% width), SemiBold/Bold. Expose as `--font-heading`.
- Numbers/mono: **Mona Sans Mono**. Expose as `--font-mono`. Use `tabular-nums` for figures.
- Load self-hosted via `next/font/local` (fonts ship in the template's `public/fonts/`). Never load
  Google Fonts / Inter / system-ui as the primary face.

## 2. Color

| Token | Light | Dark |
|-------|-------|------|
| primary (navy) | `#00498B` | `#7ABBF2` |
| background | `#FFFFFF` | `#202124` |
| surface / card | `#F7F7F7` | `#3C4043` |
| text primary | `#000000` | `#E8EAED` |
| text secondary / muted | `#6B7280` | `#9AA0A6` |
| border | `#B4B8C1` | `#3C4043` |
| success | `#16A34A` | — |
| warning | `#F59E0B` | — |
| error | `#DC2626` | — |

- Navy `#00498B` is the ONLY brand accent. Do not introduce new accent hues.
- Corner radius: **10px** (`rounded-[10px]`); larger surfaces `rounded-[14px]`.

## 3. Charts

Use ONLY the Röbel chart ramp (from the roebel-data `chartTheme`): **ink, navy, sky, gold** grades.
Ordered multi-series palette: `[navy, sky, gold, navyMid, gray]`. Area fills fade top `0.28` →
bottom `0.02` opacity. Prefer `@visx/*` (matches roebel-data) or lightweight SVG; do not add
recharts/chart.js to a mini app unless asked.

## 4. Components & layout

- **Card**: `rounded-[10px] border border-border bg-card p-4`.
- **KPI**: value `text-2xl font-semibold tabular-nums`, label `text-xs text-muted-foreground`.
- **Buttons**: primary = navy fill, white text; secondary = bordered, `text-foreground`.
- **Mobile-first**: everything must look right at **~360px wide** (mini apps render in a phone-sized
  modal). Use a single column; avoid fixed widths; `max-width: 100%` on media.
- Match the shadcn-flavored token classes (`bg-background`, `bg-card`, `text-foreground`,
  `text-muted-foreground`, `border-border`). Do not invent a second design system.

## 5. Copy rules (STRICT)

- **German primary** (the Röbel host audience). English only if the app is explicitly English.
- **Never render a raw wallet address.** Resolve to a display name; fall back to "Jemand".
- **Never say "CRC", "Circles", or "personal token".** The in-app currency is **"Röbel-Münzen"**
  (symbol **RÖ**). Talk about earning/spending Röbel-Münzen, not tokens.
- Keep copy plain and civic; no crypto jargon, no hype.

## 6. SDK requirements (mandatory in every generated app)

1. Bundle `@netizen/miniapp-sdk` (add `transpilePackages: ['@netizen/miniapp-sdk']` in `next.config`).
2. Call **`sdk.actions.ready()`** once the first screen is mounted — otherwise the host shows an
   infinite splash. This is the #1 mistake; treat it as a hard requirement.
3. Ship a `netizen.manifest.ts` exporting a `MiniAppManifest` with a correct `permissions[]` array.
   Only request permissions the app actually uses (`wallet`, `rewards`, `notifications`, `circles`,
   `share`).
4. Treat `sdk.getContext().user` as **display-only / untrusted**. For any server call that must
   trust the user, send `sdk.auth.getToken()` and verify it server-side.
5. Analytics: call `sdk.track('<event>', props)` for meaningful actions (fire-and-forget).
