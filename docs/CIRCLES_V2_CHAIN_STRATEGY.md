# Circles v2 — Base↔Gnosis Chain Strategy (build gate)

> The single decision that shapes any Circles integration. Röbel's identity/governance stack
> is on **Base**; Circles v2 lives on **Gnosis Chain (chain ID 100)**. This doc lays out the
> three options, the trade-offs, and a recommendation. Date: 2026-06-16.
>
> See also: [`CIRCLES_V2_INTEGRATION_RESEARCH.md`](CIRCLES_V2_INTEGRATION_RESEARCH.md).

---

## The constraint

| What | Chain |
|---|---|
| `CitizenNFT`, `AttesterNFT`, MACI, Governor, Timelock | **Base mainnet** (8453) |
| thirdweb smart wallet (current) | Base, gasless via ERC-4337 sponsorship |
| **Circles v2** (personal ERC-1155, group ERC-20, Hub v2, trust graph) | **Gnosis Chain** (100) |

Circles is **not** deployed on Base. You cannot avoid touching Gnosis if you want real Circles.

---

## Option A — second smart wallet on Gnosis (recommended)

Deploy a thirdweb `inAppWallet` + smart account for each user **on Gnosis Chain** (same seedless
login, same address-derivation), and register their Circles personal avatar there. CitizenNFT
stays the identity anchor on Base; the Gnosis-side registration is authorized by a **backend
attestation** of `is_verified_citizen` (Röbel already tracks this server-side).

- ✅ Keeps the invisible-Web3 UX you've already nailed (no seed phrase).
- ✅ Gnosis gas is near-free → you may not even need ERC-4337 sponsorship there.
- ✅ Full control over the Circles registration / group-membership flow.
- ⚠️ Two wallets per user (Base + Gnosis) — manage in `WalletBootContext`; keep addresses hidden as today.
- ⚠️ Need a trusted backend signer to attest citizenship cross-chain (or Option C's bridge).

## Option B — Circles as an external rail (lowest cost)

Users hold Circles in **Metri**; Röbel only *reads* balances/trust via the Circles SDK and
**deep-links into Metri** for payments.

- ✅ Minimal build; no second wallet, no bridge.
- ✅ Leverages Metri's Gnosis Pay + Visa + fiat ramp for free.
- ❌ No control over UX; users must install/learn Metri.
- ❌ Citizenship gating is advisory only (can't enforce on-chain).

## Option C — bridge CitizenNFT proof to Gnosis (most "pure")

Bridge a proof of CitizenNFT ownership to a Gnosis contract that gates Circles group membership
on Röbel citizenship (e.g., a periodic Merkle root of citizen wallets, or a message-bridge attestation).

- ✅ Trust-minimized: citizenship enforced on-chain on the Circles side.
- ✅ Cleanest "blueprint" story for other towns.
- ❌ Most engineering (bridge/oracle, root maintenance, re-org/rotation handling).
- ❌ CitizenNFT rotations (frequent in this repo) complicate root upkeep.

---

## Recommendation

**Start with Option A.** It preserves the seedless smart-wallet UX, exploits Gnosis's cheap gas,
and gives full control over the Röbeltaler flow — while deferring the heavier trust-minimized
bridge (Option C) until the pilot proves value. Use a **backend signer** to attest
`is_verified_citizen` for Gnosis-side registration in the interim.

### Open questions to resolve before building
1. Backend signer key management for the cross-chain citizenship attestation (reuse coordinator infra? new key?).
2. Do we sponsor Gnosis gas (consistency with Base UX) or let users pay micro-gas?
3. Address linkage in Supabase: extend `push_tokens.wallet_address` / `accounts` model to store a Gnosis address per user.
4. Rotation policy: how a CitizenNFT revocation propagates to Gnosis-side group membership.
5. Migration story from off-chain `roebel_points` → Röbeltaler (1:1? fresh start? bonus airdrop?).
