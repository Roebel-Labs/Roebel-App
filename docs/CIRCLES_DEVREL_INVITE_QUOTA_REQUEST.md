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

---

## Follow-up 2026-07-19 — quota IS fundable now, but `generateInvites` structurally cannot invite our wallets

Thanks for the pointer on the outdated funding gate — confirmed and fixed on our side: we replaced the `farmBal + approved-funder` capacity check with an `eth_call` simulation of `claimInvites(n)`. That simulation passes cleanly today (`inviterQuota = 30`, `claimInvites(30)` succeeds; bot `0x360345eEf7aF50F3F1CfA91190FBE36558B5bd9E` holds ~3,984 CRC).

**But the actual `generateInvites` send still reverts**, and we've root-caused it to the deployed `InvitationModule` (`0x00738aca013B7B2e6cfE1690F0021C3182Fa40B5`, verified source):

1. The SDK builds `[claimInvites(n), Hub.safeBatchTransferFrom(inviter → InvitationModule, ids = bot-token ×n, 96 CRC ×n, data = abi.encode(address[] invitees))]`.
2. Chain-simulating both txs via `eth_simulateV1` (as one state chain): the **claim leg succeeds** — and as a side effect correctly creates the bot→inviter trust — but the **module leg always reverts** with a bare revert that the Hub wraps as `ERC1155InvalidReceiver` (`0x57f447ce`), which surfaces to users as `UserOperation reverted during simulation with reason: 0x`.
3. The failing link is in the batch hook's per-invitee path: `proxyInvite → enforceHumanRegistered(invitee)` does `validateModuleEnabled(invitee)` and then `_callHubFromSafe(invitee, registerHuman(proxyInviter, 0))` — i.e. it **registers the invitee in-line by executing `registerHuman` from the invitee's own account via Safe-module exec**.
4. Our invitees are **thirdweb ERC-4337 smart accounts** (the Röbel app's embedded wallets; 24 deployed, 6 still counterfactual), not Safes — they have no `isModuleEnabled` and can never have this module enabled. We verified every other precondition individually (inviter human ✓, inviter Safe has module enabled ✓, bot human ✓, bot Safe has module enabled ✓, bot→inviter trust after claim ✓): the invitee-side module exec is the only impossible link, for single (`onERC1155Received`) and batch alike.

So for wallets that aren't Circles-native Safes, the farm quota is currently unusable regardless of funding — no readiness gate can fix that client-side.

**Ask:** what is (or could be) the supported path to spend farm quota on **existing non-Safe smart accounts**? Two shapes that would work for us:
- a **trust-only escrow variant**: the bot/proxy-inviter trusts the invitee with a durable expiry (not `uint96(block.timestamp)`), so the invitee later calls `registerHuman(proxyInviter)` **from their own wallet** — that call path works for any ERC-4337 account (our whole town onboarded that way via self-funding), and the 96-CRC burn still falls on the bot exactly as in the in-line flow; or
- the module skipping `enforceHumanRegistered` when the invitee is not a module-enabled Safe, leaving the durable proxy trust in place instead.

Happy to test any candidate on Gnosis within hours — we have 30 real invitees waiting and a reproducible `eth_simulateV1` harness for the full flow.
