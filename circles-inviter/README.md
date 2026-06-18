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

## Notes / open checks
- `generateInvites` targets **deployed** addresses. thirdweb smart accounts deploy on their
  first userOp — if a citizen's account isn't deployed yet, invite after its first on-chain
  action (or it may need deployment first). Verify on the first real invite.
- Dep versions follow the official `aboutcircles/circles-invitation-links-manager`; bump if
  the SDK moves past `0.1.x`.
- This is the seed for the larger Röbel visualization mini-app (its own directory later).
