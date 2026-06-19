# Röbel Circles Inviter (mini-app)

A tiny Circles **mini-app** that invites Röbel's verified citizens — their **existing**
thirdweb smart-account wallets — into Circles, using your **InvitationFarm quota**.

It exists because the official invitation-manager UI only exposes
`InviteFarm.generateReferrals()` (claimable magic links → brand-new accounts). Our
citizens already have wallets, so we use the SDK's **`generateInvites(inviter, invitees[])`**
instead (the existing-address path the Gnosis DevRel pointed to). Purely on-chain, funded
by quota — no 96-CRC out of your own balance, no private keys.

## Stack
Vite 6 · React 19 · TypeScript · Tailwind v4 · `@aboutcircles/sdk-invitations` ·
`@aboutcircles/miniapp-sdk` · viem. Isolated from the monorepo (not a pnpm-workspace member),
so it can't affect the web/Expo builds.

## Prerequisite — quota
You need **InvitationFarm quota** assigned to your Circles wallet
(`0x1F14C82926227d948b9a756Db9aEB77fe51273c3`). Ask the Gnosis Circles team to assign it
(they have your address). Until then the app shows **Quota: 0** and the invite button is disabled.

## Run
```bash
cd circles-inviter
pnpm install
pnpm dev            # http://localhost:5174
```
The app signs through `@aboutcircles/miniapp-sdk`, which only works **inside the Circles app's
miniapp iframe** — open it there (point the Circles miniapp to your dev/deployed URL). Outside
the iframe no wallet connects (it shows "In Circles-App öffnen"); that's expected.

## Flow
1. Open inside Circles → your wallet connects (the inviter) and quota loads.
2. The 15 citizens are listed; already-registered ones are auto-skipped (✓ verifiziert).
3. Pick who to invite (defaults to everyone not yet registered) → **Einladen**.
4. `generateInvites(inviter, [addresses])` builds the txs → your wallet signs via the host →
   the addresses are invited (trusted) from your quota.
5. Each citizen then finishes in the **Röbel app**: tap **"Bei Röbel-Taler mitmachen"**
   (`registerHuman`) — they become Circles humans and the admin
   `/admin/dashboard/circles` board turns green.

## Deploy to Vercel
Standalone static Vite app (output `dist/`), **not** a pnpm-workspace member — so Vercel must
install/build *inside* this folder. The included `vercel.json` handles it.

- **Dashboard:** New Project → import this repo → set **Root Directory = `circles-inviter`** →
  Framework **Vite**. `vercel.json` sets install `pnpm install --ignore-workspace`, build
  `pnpm build`, output `dist`, and an SPA rewrite.
- **CLI:** `cd circles-inviter && npx vercel --prod`.

The `--ignore-workspace` install is required — without it pnpm finds the monorepo root workspace
and errors. (Verified locally: `pnpm install --ignore-workspace` + `pnpm build` succeed.)

## Publish to the Circles mini-app launcher
The launcher reads a registry: **`static/miniapps.json`** in `aboutcircles/CirclesMiniapps`
(`master`). Open a PR adding your deployed app:
```json
{
  "slug": "roebel-inviter",
  "name": "Röbel Circles",
  "logo": "https://circles-inviter.vercel.app/logo.svg",
  "url": "https://circles-inviter.vercel.app/",
  "description": "Invite verified citizens into Circles and visualize a town's on-chain economy — trust graph, supply, transfers, and the network of towns.",
  "tags": ["town", "internal"],
  "category": "miniapp",
  "isHidden": true
}
```
- `isHidden: true` keeps it off the public list but still loadable by slug — good for the pilot.
  Remove it to list publicly.
- It then loads in the host (`app.aboutcircles.com` / `circles.gnosis.io`) at
  `/miniapps/roebel-inviter`, iframing your Vercel URL; the host injects your wallet via
  `miniapp-sdk` (that's where your passkey signs).
- Hackathon apps (e.g. VibeVote) are added exactly this way — ask Sandipan to merge the PR, or the
  Circles team can add it during the event.

## Notes / open checks
- `generateInvites` targets **deployed** addresses. thirdweb smart accounts deploy on their
  first userOp — if a citizen's account isn't deployed yet, invite after its first on-chain
  action (or it may need deployment first). Verify on the first real invite.
- Dep versions follow the official `aboutcircles/circles-invitation-links-manager`; bump if
  the SDK moves past `0.1.x`.
- This is the seed for the larger Röbel visualization mini-app (its own directory later).
