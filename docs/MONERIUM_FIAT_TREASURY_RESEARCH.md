# Monerium × Gemeinschaftskasse — Verified Research Report

**Date:** 2026-07-15
**Method:** 102-agent deep-research workflow (5 search angles → source fetch → 3-vote adversarial verification per claim → synthesis), plus two targeted follow-up sweeps (Stripe payout leg, German legal/revenue). Every finding below survived adversarial verification against primary sources unless marked otherwise.
**Purpose:** Foundation for the fiat-donation + community-financial-platform build (see `docs/superpowers/plans/2026-07-15-fiat-donations-financial-platform-design.md`). This fulfils the funding-rails gap specced in `SOVEREIGN_AI_COMMUNITY_WEALTH_STUDY.md` Phase 0.

---

## 1. Executive summary

Monerium is a directly viable — and remarkably cheap — path to giving the Gemeinschaftskasse Safe a real EUR IBAN:

- **Regulated:** Monerium hf. is an EEA-passported Electronic Money Institution (Central Bank of Iceland FSA, licensed June 2019 — the world's first EMI authorized to issue e-money on a public blockchain), MiCA-compliant with a published EURe whitepaper. EURe is redeemable at par by statutory obligation.
- **Native on Gnosis:** EURe is live on 9 networks including Gnosis mainnet + Chiado testnet. No chain change needed.
- **IBAN ↔ Safe bridge:** `POST /ibans` provisions a named EUR IBAN bound to a specific address+chain. **Every incoming SEPA transfer auto-mints EURe into the linked wallet** — no action by us per transfer. Outgoing = redeem orders that burn EURe and send SEPA. Safe multisig treasuries are an explicitly marketed pattern (Safe, Gnosis Pay, MetaMask, Aave are reference customers).
- **Safe is a first-class signer:** ERC-1271 signature verification, offchain and onchain (`isValidSignature` polled up to 5 days for onchain `signMessage`); dedicated `GET /signatures` endpoint for pending smart-contract-wallet signatures.
- **Zero Monerium fees today:** IBAN, SEPA in/out, mint/burn, API access — all free (fee schedule verbatim: "Currently, Monerium is not charging any fees"; they reserve the right to introduce fees with notice; business model = interest on safeguarded reserves).
- **Fast:** SEPA Instant (SCT Inst) settles in ~5 seconds including the on-chain mint, 24/7 — near-universal for German sender banks since the Oct 2025 Instant Payments Regulation. Fallback: standard SCT, 1–2 business days in practice. First-time/large transfers may be held for manual compliance review.
- **Attribution built-in:** webhooks (`order.created`, `order.updated`, `profile.updated`, `iban.updated`) signed with HMAC-SHA256 (`webhook-signature` header, per-subscription `whsec_` secret, 10 retries over 12h exponential backoff). SEPA payments carry a free-text `memo` (5–140 UTF-8 chars, GET /orders filter) and a structured `referenceNumber` (ISO 11649 RF Creditor Reference, ≤35 chars, takes precedence, designed for automated reconciliation). Orders ≥ €15,000 require an attached supporting document.
- **Per-user IBANs are a product, not a hack:** the Whitelabel partner plan lets a platform manage users' full lifecycle (KYC, dedicated named IBANs — never pooled, payments) under its own brand — the exact model Gnosis Pay runs as "a wrapper for Monerium IBAN integration". No own EMI license needed (EU e-money distributor model), but it requires a signed partner agreement and every end user passes Monerium's KYC/KYB and becomes a Monerium customer. Self-serve OAuth tier = shared IBANs only. 193 residencies eligible (verified live against `api.monerium.app/countries`); Germany fully supported.

**The end-to-end donation chain is fully verified:** KYB'd profile → Safe linked via ERC-1271 → named IBAN published → donor SEPA transfer with reference → EURe auto-mints into the Safe in seconds → webhook drives in-app attribution → disbursements are multisig-signed redeem orders back to SEPA. Zero Monerium fees on the whole loop.

## 2. Critical codebase finding — EURe V1 is deprecated

The address used **everywhere in this repo** (`0xcB444e90D8198415266c6a2724b7900fb12FC56E` — expo `lib/roebel-taler.ts`, web `lib/muenzen/constants.ts` `ADDR.eure`, mini-app `roebel-data/src/lib/treasury.ts`) is the **deprecated V1 contract**. The live token is **EURe V2: `0x420CA0f9B9b604cE0fd9C18EF134C705e5Fa3430`** (verified on-chain: name "Monerium EURE", 18 decimals, EIP-1967 proxy, GnosisScan label "Monerium: EURe Token V2").

Monerium's IBAN minting targets V2. Without migrating, **IBAN donations would be invisible to the treasury view and unpayable by the payout builder.**

On-chain check 2026-07-15: the Safe holds 0.0 on both V1 and V2 → the migration is a pure address swap, no funds to move.

## 3. Monerium integration reference (verified specifics)

| Topic | Verified detail |
|---|---|
| API base | `api.monerium.app` (production), `api.monerium.dev` (sandbox; can simulate incoming bank transfers that mint test EURe) |
| Docs | `docs.monerium.com` (`/api`, `/whitelabel`, `/tokens`, `/oauth`) — old monerium.dev deep links redirect |
| Auth | OAuth2 client-credentials for backend integrations |
| Link wallet | `POST /addresses` — signature typed "EOA address or Safe onchain or Safe offchain" (ERC-1271) |
| IBAN | `POST /ibans` (async, 202, "can take a few seconds"), rebindable via `PATCH /ibans/{iban}`; IBAN is in the account holder's own name, EE-prefix |
| Incoming | Auto-mint to linked address; surfaces as order webhooks |
| Outgoing | Redeem order burns EURe from the specified address → SEPA out; ≥€15k needs `supportingDocumentId` |
| Webhooks | `order.created`, `order.updated` (processed/rejected), `profile.updated`, `iban.updated` (+ `subscription.created` validation event); HMAC-SHA256 `webhook-signature`; 10 retries / 12 h |
| Attribution | `memo` 5–140 chars free text (bank-statement visible, orders filter); `referenceNumber` ISO 11649 RF ≤35 chars (strict RF refs ≤25 chars), precedence over memo; unattributed transfers still mint — manual reconciliation |
| SDK | `@monerium/sdk` (JS, chain enum includes `gnosis`); Safe docs have a Monerium onramp guide |
| KYC | Personal (KYC) vs corporate (KYB) profiles; the IBAN legally belongs to the KYC'd profile, routed to the Safe address |

## 4. Caveats (verified)

- Zero fees is "currently" — bespoke Whitelabel commercial terms are not public.
- 100% reserve backing is issuer-asserted; no monthly independent attestations published.
- 5-second settlement assumes donor's bank sends SCT Inst; Monerium's own KB says 1–2 business days for standard SEPA in practice; first-time/large transfers can be manually reviewed — relevant for a donation flow full of first-time senders.
- Donor attribution depends on donors actually typing the reference into their bank UI; design must tolerate unreferenced transfers.
- EURe↔Circles interplay = chain co-residence only; no tested bridge exists.

## 5. Stripe → Monerium leg (verified 2026-07-15)

- **Payout to the EE-prefix Monerium IBAN from a DE Stripe account: likely works, not promised.** Stripe's rule: bank accounts must be in a country whose official currency is the settlement currency (EUR ⇒ Estonia qualifies), and Stripe explicitly supports "virtual bank accounts (e.g. N26, Revolut and Wise)" while warning of "higher payout failures" for them ([docs.stripe.com/payouts](https://docs.stripe.com/payouts)). No documented Monerium-specific accept/reject case exists. **Decisive factor: account-holder-name match** — the Monerium profile must be a *business* profile in the exact legal-entity name of the Stripe account (Monerium IBANs are named, never pooled; rails by AS LHV Pank, Tallinn). Test by adding the IBAN in Dashboard → payout settings; validation is immediate.
- **Fallback A (always works):** Stripe payout → org's DE bank account → standing SEPA forward to the Monerium IBAN (+1 banking day, ~€0).
- **Timing/fees (DE):** standard payouts free, T+3 (first payout 7–14 days). Card fees: EEA standard 1.5% + €0.25, premium 1.9% + €0.25, international 3.25% + €0.25; Apple/Google Pay = card rate; **SEPA-Lastschrift €0.35 flat** (async; €3.50 fail / €15 dispute); Klarna from 2.99% + €0.35 — but Klarna lists *charities* as restricted (needs Klarna approval) → don't design around it. giropay is dead (June 2024).
- **⚠️ ToS/wording constraint:** Stripe restricts "fundraising conducted by non-profits/charities" (approval-required) and *prohibits* non-charities "fundraising for a charitable purpose" outside AU/CA/UK/US. Until a gemeinnützige entity owns the account, frame card payments as **"Unterstützungsbeitrag"** (voluntary support contribution), not "Spende", and never imply tax-deductibility. After Gemeinnützigkeit: apply for the **nonprofit program** (DE eligible; requires ≥80% of volume = tax-deductible donations; discounted rate ~1.2% + €0.25 per third-party sources, unpublished by Stripe).
- **Checkout mechanics:** `submit_type: 'donate'` exists; custom amounts via `custom_unit_amount` (no recurring with donor-chosen amounts) ⇒ recurring = subscription mode with fixed tiers. Payment Links support pay-what-you-want one-time.
- **Stripe crypto stack is irrelevant:** USDC-only, no Gnosis, no EURe (onramp, stablecoin payouts, "pay with crypto" all excluded). No card→EURe onramp exists anywhere (Mt Pelerin has Gnosis but no EURe; Monerium = SEPA only) — Stripe-fiat-payout is the only card path to EURe.
- **Reconciliation:** one automatic payout = one aggregated net SEPA credit (default descriptor "STRIPE" — set a custom payout descriptor e.g. "ROEBEL BEITRAG"). Map payout → charges via `GET /v1/balance_transactions?payout=po_…` + payout-reconciliation reports (`trace_id`, `payout_reference_token`). **Design consequence: the Monerium webhook must NOT record Stripe payout arrivals as new donations** (already ledgered per-charge by the Stripe webhook) — detect via memo/descriptor and skip.

## 6. German legal + revenue (verified 2026-07-15 — planning research, not legal advice)

- **Collecting is lawful today:** Mecklenburg-Vorpommern has no Sammlungsgesetz (only RLP/Saarland/Thüringen retain one) — no permit, no legal form required. As a private individual: donations = **Schenkungen** (§516 BGB; purpose-bound = §525 Auflagenschenkung), Schenkungsteuer class III with **€20,000 per donor per 10 years** free (§16 ErbStG), §30 ErbStG notification duty (3 months), funds sit in the individual's personal estate (insolvency/death risk), and **no donor tax deduction is possible**.
- **The structural fix is a gemeinnütziger e.V.:** ≥7 members (§56 BGB), ~€90–120, Mustersatzung (Anlage 1 zu §60 AO), §60a Feststellungsbescheid in ~4–8 weeks; ~2–4 months to Zuwendungsbestätigung capability. Crypto/stablecoin donations to a gemeinnützige org are permitted, treated as **Sachspende** (BMF 7.11.2013 template; market value at donation). Whether EURe counts as Geld- vs. Sachspende is unresolved — the clean path: the donor's SEPA leg is a euro Geldspende; the auto-mint is the org's own conversion. The **town itself (jPdöR) can also issue receipts**.
- **Mittelverwendung:** zeitnahe Verwendung by end of year+2; orgs with income ≤€45k are exempt. Rücklagen per §62 AO. Holding euro-pegged EURe as liquidity is defensible; **sDAI yield is the main open risk** (no authority has assessed stablecoin/DeFi holdings for gemeinnützige orgs; keep inside freie Rücklage with board-approved Anlagerichtlinie; Vermögensverwaltung yield is tax-free for gemeinnützige bodies). BMF-Schreiben 6.3.2025 replaces the 2022 crypto letter but doesn't address nonprofits or sDAI.
- **BaFin perimeter:** own-name donation receiving = no Einlagengeschäft (not repayable), no e-money issuance (Monerium is the issuer), no custody service (own Safe signed by own officers = self-custody). Danger zones: (a) **forwarding donor-directed funds for third parties = Finanztransfergeschäft** (§1 Abs. 2 Nr. 6 ZAG — BaFin has affirmed for donation portals); (b) **holding keys to citizens' wallets** → MiCA CASP custody (multisig minority-share treatment unresolved; EMT dual-regime open until ≥2026-03-02). The §2 Abs. 1 Nr. 9 ZAG technical-provider exemption covers a platform that **never possesses the funds**.
- **Platform-fee models that work in Germany:** (1) betterplace model — own-name receipt by one gemeinnützige entity, re-grant via §58 Nr. 1 AO, 2.8% retention (WirWunder/Sparkasse: 2.5%) — proven, no BaFin license; (2) **Monerium direct-to-recipient** — each org gets its own IBAN/wallet, platform never touches funds (ZAG-exempt), charge SaaS/success fees. Route (2) is the natural Phase-3 fit for this stack.
- **Municipality:** §44 Abs. 4 KV M-V — the Gemeinde may accept Spenden; only the Bürgermeister receives offers, the Gemeindevertretung approves above the Hauptsatzung threshold (≤€1,000), with an annual public donor report. No German municipal crypto-donation precedent found; EURe is the most defensible asset (no speculation), but zero precedent → keep the treasury non-municipal for now.

## 7. Open questions

1. Monerium Whitelabel commercial terms + whether a dozens-to-hundreds-of-users civic project gets accepted (OAuth shared-IBAN tier may be the practical ceiling short-term). Also: does Monerium classify whitelabel partners as EMD2 *distributors* (triggering passport notifications) or mere tech integrators?
2. Whether idle treasury EURe → sDAI yield is compatible with the eventual legal form's constraints (no official guidance exists).
3. Tested EURe↔Circles group-currency bridge (none exists today).
4. Multisig minority-key custody classification under MiCA (license-sensitive for per-citizen wallets — needs formal advice before Phase 3).
5. Stripe Dashboard acceptance of the concrete Monerium IBAN + name match (empirical test once KYC completes).
