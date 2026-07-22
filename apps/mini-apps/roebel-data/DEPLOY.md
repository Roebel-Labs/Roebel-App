# Deploying `roebel-data`

The live mini-app **does not build from this monorepo.** The `netizen-roebel-data` Vercel
project is git-connected to a **separate standalone repo — `MaxBrych/netizen-roebel-data`** —
and serves it at **`https://netizen-roebel-data.vercel.app/`**. The Röbel Expo host loads that
URL from Supabase (`mini_apps.home_url`, read by `apps/expo/lib/miniapps.ts`) — **not** the
`homeUrl` in `netizen.manifest.ts`.

So: editing `apps/mini-apps/roebel-data` here, or merging to *this* repo's `main`, changes
**nothing** in the app until the change reaches the **deploy repo** and Vercel rebuilds it.

```
apps/mini-apps/roebel-data  ──sync──▶  MaxBrych/netizen-roebel-data  ──Vercel──▶  netizen-roebel-data.vercel.app
        (source of truth)               (deploy repo, git-connected)              (mini_apps.home_url → Expo host)
```

## Automatic sync (set up once)

[`.github/workflows/sync-roebel-data-miniapp.yml`](../../../.github/workflows/sync-roebel-data-miniapp.yml)
mirrors `src/` + `public/` into the deploy repo on every push to this repo's `main` that
touches `apps/mini-apps/roebel-data/**`, then pushes → Vercel builds. To enable it:

1. **PAT:** create a fine-grained GitHub token with **Contents: read/write** on
   `MaxBrych/netizen-roebel-data`.
2. **Secret:** add it to *this* repo → Settings → Secrets → Actions as
   **`NETIZEN_ROEBEL_DATA_DEPLOY_TOKEN`**.
3. **Vercel production branch:** netizen-roebel-data → Settings → Git → **Production Branch =
   `main`**. Without this, pushes build as *previews* and never reach
   `netizen-roebel-data.vercel.app` (they land on the protected `…-git-main-…` alias).

After that: edit here → merge to `main` → auto-synced → auto-deployed to production.

> `package.json` / `next.config.ts` / `netizen.manifest.ts` are **not** synced — the deploy repo
> pins `@netizen-labs/miniapp-sdk` from npm, the monorepo uses the pnpm workspace. Change deps or
> config in **both** places by hand (rare).

## Manual sync / deploy (no secret needed)

```bash
git clone https://github.com/MaxBrych/netizen-roebel-data.git /tmp/deploy
rsync -a --delete apps/mini-apps/roebel-data/src/    /tmp/deploy/src/
rsync -a          apps/mini-apps/roebel-data/public/ /tmp/deploy/public/
cd /tmp/deploy && git add -A && git commit -m "sync roebel-data" && git push origin main
```

Then, if production doesn't update, **promote the new build**: Vercel → netizen-roebel-data →
Deployments → the new deployment → ⋯ → **Promote to Production** (only needed until the
Production-Branch setting above is in place).

## Cleaner alternative — one repo, no sync

Point the Vercel project at this monorepo instead of the standalone repo:
netizen-roebel-data → Settings → **Git → connect `Roebel-Labs/Roebel-App`**, **Root Directory =
`apps/mini-apps/roebel-data`**, **Production Branch = `main`**. Then this repo is the single
source of truth, the sync workflow + separate repo can be retired, and merges to `main` deploy
directly. (The trade-off: Vercel must install the pnpm workspace — set Install Command to run
from the repo root.)

## Verify

```bash
pnpm --filter @netizen/miniapp-roebel-data typecheck
pnpm --filter @netizen/miniapp-roebel-data build
# after deploy, production should show the German tabs:
curl -s https://netizen-roebel-data.vercel.app/ | grep -oE 'Gemeinde|>Town<'
```

Then force-close/reopen the mini-app in the Röbel app to clear the WebView cache.
