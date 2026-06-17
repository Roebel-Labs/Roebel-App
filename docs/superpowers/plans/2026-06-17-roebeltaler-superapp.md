# Röbel-Taler as the App Currency — Build Plan

> Turn the existing rewards "coins" + taler assets into the real **Röbel-Taler**, and
> give citizens a Metri-style experience *inside* the Röbel app: register from the
> profile, daily mint, a weekly-earned chart, connections, and a wallet to send/receive.
> Date: 2026-06-17. Companion: [onboarding runbook](../runbooks/2026-06-17-roebeltaler-onboarding.md).

## Bootstrap — SOLVED (Circles InviteFarm community quota)
Inviting normally costs the inviter ~96 CRC (invitee gets 48), so a fresh operator can't
cold-start. **Solution:** Circles' **InviteFarm** grants a community an invitation **quota**
(`@aboutcircles/sdk-invitations`, `generateInvites()` / `generateReferrals()`) that onboards
people **without** per-invite CRC. One-time ask to the Circles team for Röbel's quota; then the
operator/Edge Function mints invites from it. `generateReferrals()` can even pre-deploy accounts.
→ This is the only external dependency, and it's a quota request, not a code blocker.

## Currency model (one Röbel-Taler, two surfaces)
- **Röbel-Taler = the real on-chain group currency** (Circles group `0xAc2C…` on Gnosis), held by
  the citizen's thirdweb Gnosis smart account (same address as Base, holds the Gnosis CitizenNFT).
- **Daily mint** (`personalMint`) = "Heute abholen". **Hold/spend** = the group token.
- **Off-chain points stay** for gamification (lootboxes/tasks) — the points≠money firewall (ZAG).
- **taler assets** (`assets/illustration/taler/single.png`, `multiple.png`) are the coin visuals.

## Components & status
| Piece | What | Status |
|---|---|---|
| Gnosis wallet provider | same login on Gnosis, gasless (sponsorGas:true verified) | ✅ done |
| Hybrid rewards | real Röbel-Taler headline + daily-mint + onboarding CTA | ✅ done |
| Weekly earned chart | SVG card (Metri-style), `WeeklyEarnedChart` + `useRoebelTalerWeekly` | ✅ component done; ⏳ wire real data |
| Onboarding | `circles-invite` Edge Function + app `onboard()` | ✅ flow done; ⏳ switch to InviteFarm quota; deploy |
| Profile entry | "Röbel-Taler" link in profile → onboard/screen | ⏳ next |
| Wallet send/receive | repurpose `app/wallet.tsx` for Röbel-Taler (balance, send via transfer, receive via QR of address) | ⏳ next |
| Connections | `sdk.data.getAggregatedTrustRelations(addr)` → count + avatars (like Metri "2 connections") | ⏳ next |
| Real chart data | Circles `getTransactionHistory` (circlesRpcUrl) → bucket group-token transfers by week | ⏳ next |

## Build order (next)
1. **Profile entry point** — add a Röbel-Taler row in the profile; routes to `/roebel-taler` (onboard when not a member).
2. **Wallet → Röbel-Taler** — restore `app/wallet.tsx` as the Röbel-Taler wallet:
   - balance (group token), **send** (`Hub.transfer`/group ERC20 transfer to another citizen, resolve to display name — never show 0x),
   - **receive** (QR of the citizen's address + name), recent activity from `getTransactionHistory`.
3. **Connections** — a card using `getAggregatedTrustRelations`: count + member avatars; tapping opens the trust graph (ties into the existing `/graph`).
4. **Real chart data** — implement `getTransactionHistory` fetch against `circlesRpcUrl` (no heavy SDK in RN: plain JSON-RPC), bucket by ISO week, feed `WeeklyEarnedChart`.
5. **Onboarding → InviteFarm** — add `@aboutcircles/sdk-invitations`; the Edge Function generates an invite from the community quota instead of spending operator CRC. Deploy with `OPERATOR_PRIVKEY` + quota.
6. **Send/receive between citizens** uses the trust graph (group members all trust the group, so transitive transfers route) — confirm plain ERC20 vs pathfinder during build.

## Notes / guardrails
- All UI copy: **"Röbel-Taler"** only (never CRC/Circles). [[feedback_roebeltaler_copy]]
- Never show raw addresses — resolve to display name. [[feedback_never_show_wallets]]
- Gasless everywhere (sponsorGas:true on Gnosis is live).
- Keep the regulated currency separate from the gamification points.
