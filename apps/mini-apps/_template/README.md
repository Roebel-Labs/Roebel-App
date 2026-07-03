# @netizen/miniapp-template

The **canonical Netizen Mini App scaffold**. This is the fresh, minimal Next.js 15
(App Router) app that:

- the **AI Mini App Builder clones** and mutates per user prompt, and
- **every hand-written mini app** copies as its starting point.

It renders inside the Röbel host — a native WebView (Expo) or a web iframe
(Playground / AI-builder preview) — and talks to the host over the
`@netizen/miniapp-sdk` `postMessage` bridge. Keep it clean and idiomatic; clarity
here is what keeps every generated app on-brand and correct.

> Contract: [`docs/superpowers/specs/2026-07-03-netizen-mini-apps-design.md`](../../../docs/superpowers/specs/2026-07-03-netizen-mini-apps-design.md)
> · Design system: [`packages/miniapp-sdk/DESIGN.md`](../../../packages/miniapp-sdk/DESIGN.md)
> · SDK types: [`packages/miniapp-sdk/src/types.ts`](../../../packages/miniapp-sdk/src/types.ts)

## Run

```bash
# from the monorepo root (installs the workspace-linked SDK)
pnpm install

# then, in this directory
pnpm --filter @netizen/miniapp-template dev     # http://localhost:3000
pnpm --filter @netizen/miniapp-template build
pnpm --filter @netizen/miniapp-template typecheck
```

Outside a host (plain browser), the bridge handshake silently no-ops — the SDK
calls reject/timeout and the UI falls back gracefully (e.g. name → "Jemand",
balance → "—"). Inside the Röbel Playground / Expo WebView, they round-trip.

## What this template demonstrates

`app/page.tsx` exercises the full client SDK a mini app needs:

| Step | Call | Notes |
|------|------|-------|
| 1 | `sdk.actions.ready()` | **MANDATORY** — dismisses the host splash once the first screen mounts. |
| 2 | `sdk.getContext()` | Greets the user by `displayName` (fallback `"Jemand"`). Untrusted, display-only. |
| 3 | `sdk.roebel.getMuenzenBalance()` | Shows the balance labelled **Röbel-Münzen (RÖ)**. |
| 4 | `sdk.roebel.grantReward(...)` | Server-authorized reward *request* with full loading / granted / rejected / budget / error handling. |
| 5 | `sdk.track('template_opened')` | Fire-and-forget analytics → `mini_app_events`. |

## The three hard rules (do not remove when mutating)

1. **Call `sdk.actions.ready()`** once the UI mounts. Without it the host shows an
   infinite splash — the single most common mistake.
2. **Ship `netizen.manifest.ts`** exporting a `MiniAppManifest` with an accurate
   `permissions[]`. The host refuses any bridge method whose permission wasn't
   declared and admin-approved. Request only what you use
   (`wallet` · `rewards` · `notifications` · `circles` · `share`).
3. **Copy rules** (see DESIGN.md §5):
   - German primary.
   - **Never render a raw wallet address** — resolve to a display name (fallback
     `"Jemand"`).
   - **Never say "CRC" / "Circles" / "personal token"** — the currency is
     **"Röbel-Münzen"** (symbol **RÖ**).

## Design system

- **Fonts**: Mona Sans (self-hosted in `public/fonts/`), loaded via
  `next/font/local` in `app/fonts.ts` → exposes `--font-sans` / `--font-heading`
  (SemiCondensed) / `--font-mono`. Never load Google Fonts / Inter.
- **Tokens**: Tailwind v4 `@theme` in `app/globals.css` — navy `#00498B` is the
  only accent, radius `10px`, shadcn-flavoured token utilities (`bg-card`,
  `text-muted-foreground`, `border-border`, …). Light + dark.
- **Component idioms**: card = `rounded-[10px] border border-border bg-card p-4`;
  KPI value = `text-2xl font-semibold tabular-nums`, label =
  `text-xs text-muted-foreground`. Mobile-first — must look right at ~360px.

## Files

```
_template/
├── app/
│   ├── fonts.ts          # Mona Sans via next/font/local (--font-sans/-heading/-mono)
│   ├── globals.css       # Tailwind v4 @theme tokens (navy, radius 10px, dark mode)
│   ├── layout.tsx        # loads fonts + globals; title/desc from the manifest
│   └── page.tsx          # the demo screen (the SDK walkthrough above)
├── public/fonts/mona-sans/   # self-hosted variable fonts (SIL OFL 1.1)
├── netizen.manifest.ts   # MiniAppManifest — slug/permissions/category/color
├── next.config.ts        # transpilePackages: ['@netizen/miniapp-sdk'] + standalone
├── postcss.config.mjs    # Tailwind v4 PostCSS plugin
├── tsconfig.json
├── vercel.json           # framework: nextjs (one-click standalone deploy)
└── README.md
```

## Deploy

Standalone-deployable (`output: 'standalone'`, `vercel.json` → `framework: nextjs`).
Deploy from the monorepo root so the `@netizen/miniapp-sdk` workspace link
resolves, then set the deployed URL as `homeUrl` in `netizen.manifest.ts` and
register the app (a `mini_apps` row) via the web dashboard.
