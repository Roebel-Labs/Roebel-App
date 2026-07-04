# Röbel × Circles — Invitation-quota funding request

**To:** Circles / aboutcircles DevRel
**From:** Röbel App (civic-tech project, Röbel/Müritz, Germany — open-source blueprint for small towns)
**Chain:** Gnosis (chainId 100)
**Date:** 2026-07-01

---

## TL;DR

We run a town currency ("Röbel Münzen", a Circles v2 BaseGroup — symbol **RTLR**). We have **20 verified citizens** whose existing Safe wallets we want to onboard into Circles so they can mint the group token. The group already trusts all 20. The **only** thing left is registering each citizen as a Circles human, which costs **96 CRC per invite**.

Our inviter wallet shows **`inviterQuota = 29`** on the InvitationFarm, but the quota is **not fundable on-chain**: the round-robin funder our next `claimInvite()` would draw from holds CRC but has **not approved the farm**, and the farm holds **0** of that token — so a real quota invite reverts (`dispensable = 0`). We currently fall back to **self-funding invites from the inviter's own personal CRC (~250 CRC → only ~2 invites)**, which does not scale to the 16 remaining citizens (~1,536 CRC).

**Ask:** help us make our 29 farm quota usable (or grant/fund invite quota) so we can onboard the remaining citizens without draining one person's personal CRC.

---

## Who we are

The Röbel App is an open-source civic platform (mobile + web) for a ~5,000-person town. Identity is a soulbound `CitizenNFTv2` on Gnosis (20 holders, 5 of them "attesters"). We built a town group currency on **Circles v2** so residents earn/spend a local, collateral-backed coin. This is meant to be a **replicable blueprint** — if it works here, other small towns fork it. So the onboarding path we settle on with you is one others will copy.

## What's already live on-chain (Gnosis)

| Thing | Address |
|---|---|
| Circles v2 Hub | `0xc12C1E50ABB450d6205Ea2C3Fa861b3B834d13e8` |
| InvitationFarm | `0xd28b7C4f148B1F1E190840A1f7A796C5525D8902` |
| InvitationModule | `0x00738aca013B7B2e6cfE1690F0021C3182Fa40B5` |
| Our group "Roebeltaler" (RTLR, BaseGroup) | `0xAc2CeCdBead594F97358a0d3132454f24F3E470c` |
| Group owner (3-of-5 attester Safe) | `0x3A08c86Efc5ff38CC35d850F1D4d564e497bFDEa` |
| **Inviter wallet** (Safe 1.4.1, our Circles account) | `0x1F14C82926227d948b9a756Db9aEB77fe51273c3` |

Verified state:

- The group **already trusts all 20 citizens** — membership/minting is ready; the moment a citizen is a registered human they can `groupMint` RTLR. (One citizen, `0xC49d…Fb28`, already mints and holds RTLR — the end-to-end path works.)
- Of 20 citizens: **4 are registered Circles humans**, **2 are trusted-but-not-yet-registered** (they just need to finish their own `registerHuman`), **14 are not invited yet**.
- On our inviter Safe: the **InvitationModule is enabled** (`isModuleEnabled = true`) and the module **trusts us** (`Hub.isTrusted(module, inviter) = true`). So the module wiring looks correct.

## The blocker (precise, reproducible)

Reading the farm from our inviter:

```
InvitationFarm.inviterQuota(0x1F14…73c3)            = 29
InviteFarm.simulateClaim(inviter, 1) → bot token id = 1009920739325589840514882328889059088402777292101
  → funder (bot) address                            = 0xB0E66985A384EF92B20fbfA74B4b4E6eE326BD45
Hub.balanceOf(farm,   funderTokenId)                = 0.00 CRC   ← farm holds none of the funder token
Hub.balanceOf(funder, funderTokenId)                = 3544.28 CRC
Hub.isApprovedForAll(funder, farm)                  = false      ← farm cannot pull from the funder
⇒ dispensable = farmBal + (approved ? funderBal : 0) = 0.00 CRC
⇒ fundable quota invites                             = 0   (despite quota = 29)
```

So building a quota invite succeeds (`claimInvite()` + `safeTransferFrom(inviter → module, 96 CRC, invitee)`), but the batch **reverts on-chain** because the claim cannot source its 96 CRC. We confirmed the transfer leg reverts in simulation for exactly this reason.

We are **not** blocked on module setup, trust, or gas — only on the farm quota being **backed by claimable CRC**.

## What we've tried

1. **Quota path** (`InviteFarm.generateInvites`) — blocked as above (quota present but unfunded).
2. **Self-fund fallback** — inviter calls `Hub.trust(citizen)` from its own balance; the 96 CRC burns when the citizen later calls `registerHuman(inviter)`. This works (6 citizens trusted this way so far) but is capped by the inviter's personal CRC (~250 → ~2 more), so it can't cover 14–16 citizens.
3. We are **not** eligible for the Gnosis Pay free-invite grantee path (no grantee configured for us).

## What we're asking

1. **Why is our `inviterQuota = 29` unfundable, and how do we activate it?** Is the round-robin funder (`0xB0E6…BD45`) supposed to `setApprovalForAll(farm, true)` / be pre-funded, and is that something we do, or something on the farm side?
2. **Can Röbel be granted or fund a real invite quota** sufficient to onboard our remaining ~16 citizens (≈16 × 96 = ~1,536 CRC), analogous to the Gnosis Pay grantee model? If the intended mechanism is "prepay 96 CRC/invite into the farm," we're happy to fund it from our group treasury — we just need the correct destination + approval steps.
3. **Recommended batch-onboarding path for a town.** We have a known, fixed list of already-deployed Safe wallets (not new-account referrals). Is `generateInvites` the blessed path for that, or do you recommend proxy-inviters / a different flow for onboarding N existing wallets at once?
4. Any constraints we should know about (per-inviter caps, rate limits, expiry) when onboarding ~20 wallets in a short window.

## Appendix — reproduce

All reads are public `eth_call`s on Gnosis (`https://rpc.gnosischain.com`) plus the Circles RPC (`https://rpc.aboutcircles.com/`). Using `@aboutcircles/sdk-invitations`:

```js
import { InviteFarm } from "@aboutcircles/sdk-invitations";
const farm = new InviteFarm({ /* mainnet config, invitationFarmAddress + invitationModuleAddress as above */ });

await farm.getQuota("0x1F14C82926227d948b9a756Db9aEB77fe51273c3");      // 29n
await farm.simulateClaim("0x1f14…73c3", 1);                             // [ <bot token id> ]
const { transactions } = await farm.generateInvites(inviter, [invitee]); // 2 txs; 2nd reverts (unfunded)
```

Contacts and the mini-app we use to drive invites (runs inside the Circles/Metri miniapp iframe) can be shared on request. Thank you — happy to jump on a call.
