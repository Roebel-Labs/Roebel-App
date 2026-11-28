# Deploying `roebel-data`

This is a **hand-coded Next.js app** (not an AI-builder HTML app), so it deploys as its
**own Vercel project** and only updates when *that project rebuilds*. The Expo host loads it
by URL — editing the source or merging to `main` does **nothing** on its own unless the
Vercel project is wired to rebuild.

## How the Röbel app finds it

The Expo `MiniAppHost` WebView loads `mini_apps.home_url` from Supabase (read by
`apps/expo/lib/miniapps.ts`), **not** the `homeUrl` in `netizen.manifest.ts`.

- Live `home_url` (source of truth): **`https://netizen-roebel-data.vercel.app/`**
  (`mini_apps` row, slug `roebel-data`).
- The manifest's `homeUrl` is currently a placeholder (`mini.roebel.app`, does not resolve) —
  keep it in sync with the real deployment origin.

If you ever change the deployment URL, update the `mini_apps.home_url` row (web admin →
`/admin/dashboard/mini-apps`, or SQL) or the app keeps loading the old origin.

## Recommended: auto-deploy from `main` (do this once)

Git-connect the **`netizen-roebel-data`** Vercel project to this repo:

- **Git → Production Branch:** `main`
- **Settings → General → Root Directory:** `apps/mini-apps/roebel-data`
- Framework: **Next.js** (the repo `vercel.json` sets `frame-ancestors *` so the host can embed it)

After that, every merge to `main` rebuilds and ships automatically — no manual step.

## Manual deploy (until auto-deploy is set up)

The pnpm **workspace** dep `@netizen-labs/miniapp-sdk` won't resolve if you deploy the
sub-folder alone, so deploy **from the repo root** with the project's Root Directory set to
this app:

```bash
git checkout main && git pull          # get the code you want live
npx vercel@latest --prod               # from the REPO ROOT; link to the "netizen-roebel-data" project
```

Do **not** paste inline `#` comments after the command — zsh passes them to `vercel` as extra
paths (`Error: Can't deploy more than one path`).

## Verify

```bash
pnpm --filter @netizen/miniapp-roebel-data typecheck
pnpm --filter @netizen/miniapp-roebel-data build
# after deploy — the served tabs should read Gemeinde / Wirtschaft / Mitbestimmung:
curl -s https://netizen-roebel-data.vercel.app/ | grep -oE 'Gemeinde|>Town<'
```

Then force-close/reopen the mini-app in the Röbel app to clear the WebView cache.
