# Stablecoin Acceptance Rail — Design

**Spec 1 of 4** in the merchant-payments series. Decided 2026-09-03/04.
Later specs: (2) open acceptance registry + map publishing, (3) merchant
ledger dashboard incl. the web surface, (4) Ortis replication.

## 1. Goal

Let a business accept euro-stablecoin payments with the easiest possible
onboarding, and let the money be spendable in the real world immediately.
The merchant pitch, in the founder's words: *"just another way to accept
money that they can use later normally to pay for real-world stuff."*

The UX bar is Uber Eats: one primary action per screen, status always
visible, an unmistakable "Sie sind live" moment. All UI German.

## 2. Decisions

| # | Decision | Why |
|---|----------|-----|
| D1 | Built on **Gnosis Pay** end to end: the merchant account *is* a Gnosis Pay Safe. | Self-service partner platform with a Free tier; card, IBAN (via Monerium, brokered by Gnosis Pay) and PIX/USD corridors on the chain the app already runs on. No second chain, no Bridge, no direct Monerium relationship. |
| D2 | **Any wallet** can pay via a standard EIP-681 QR; our app is first-class through its own scanner. | A "stablecoin map" is only true if a Zeal/MetaMask/Rebind user can pay without installing us. |
| D3 | **Expo first**, phone is the Kasse. Web org-dashboard surface comes later (spec 3). | The counter experience needs a live device; the merchant's phone is already there. |
| D4 | **Approach A — Konto + Geldbörse.** Merchants receive into the Gnosis Pay Safe (Konto); citizens pay from their existing thirdweb smart account (Geldbörse). | The Gnosis Pay Safe enforces a 3-minute delay on all non-card outbound transfers, and the owner can cancel inside that window. Paying *from* a Safe is unusable at a counter and unsafe to treat as settled. |
| D5 | Asset is **EURe on Gnosis Chain** (V2 `0x420CA0f9B9b604cE0fd9C18EF134C705e5Fa3430`). | Euro EMT native to the card; redeemable 1:1 through the user's IBAN. Never USDC for German merchants: FX in the books, §23 EStG disposal on every purchase, MiCA Art. 23 caps. Gnosis Pay assigns the token by country (DE→EURe, BR→USDCe, UK→GBPe), which is Ortis replication for free. |
| D6 | **No fee on acceptance, ever.** | Revenue is the card program's interchange share. Matches the standing doctrine: fee on settlement, never on code. |
| D7 | **Never in the money flow.** Funds move wallet→Safe directly; we never hold, forward or settle. | Anything else is acquiring under the ZAG and needs a licence. |

## 3. Non-goals (v1)

- Publishing the registry to OSM/Nostr, public map for non-users → spec 2.
- Ledger, exports, refunds, web dashboard → spec 3.
- Ortis/Berlin deployment → spec 4.
- Bridge liquidation ("Auszahlung aufs Geschäftskonto"), USDC acceptance, Röbel-Münzen convertibility, Apple/Google Pay push-provisioning, native Sumsub SDK, PSE custom styling.
- KYB for companies. Sole traders verify as individuals; whether a GmbH can hold a Konto is an open question for Gnosis Pay (§12).

## 4. Architecture

```
┌────────────── Expo app ──────────────┐      ┌──── Gnosis Pay API ────┐
│ lib/gnosispay/  auth · kyc · safe ·  │ SIWE │ signup · terms · kyc · │
│                 cards · iban          │─────▶│ sof · phone · safe ·   │
│ lib/payments/   eip681 · amounts ·    │      │ cards · iban           │
│                 requests · scanner    │      └──────────┬─────────────┘
│ app/(payments)/ onboarding · kasse ·  │                 │ webhooks (Ed25519)
│                 empfangen · aufladen  │                 ▼
└───────┬───────────────────┬──────────┘      ┌──── Supabase ──────────┐
        │ sponsored userOps │ wss Transfer     │ fn gnosispay-webhook   │
        ▼                   ▼ (toast only)     │ fn eure-indexer (cron) │
┌────── Gnosis Chain ───────────────────┐      │ merchant_payment_      │
│ EURe V2 · Gnosis Pay Safe (+modules)  │◀─────│   accounts / requests /│
│ thirdweb smart account (Geldbörse)    │ logs │   payments             │
└───────────────────────────────────────┘      └────────────────────────┘
```

Truth for "was I paid" is the indexer in Supabase. The phone's websocket
subscription only makes the toast instant.

## 5. Account model

**One identity.** The user's thirdweb smart account signs Gnosis Pay's
Sign-In-with-Ethereum (their SIWE accepts "EOAs and Smart Accounts
(EIP-1271)"). The account already signs with chain id 100
(`apps/expo/constants/thirdweb.ts`), so the domain matches. Precondition:
the account must be **deployed** on Gnosis for EIP-1271 to verify. Step
zero of onboarding checks bytecode and, if counterfactual, sends one
sponsored no-op userOp — the same mechanism Circles registration relies on.

**Konto** — the Gnosis Pay Safe. One per *person*, EURe, Delay Module
(3 min, non-card) + Roles Module (card allowance, default 350 €/day,
raisable through their relay). A person owning two shops has one Konto;
both shops reference it.

**Geldbörse** — the existing thirdweb smart account. Instant, gasless via
the thirdweb paymaster on Gnosis. Holds a small EURe float for paying at
counters. No onboarding.

**Aufladen (Konto → Geldbörse)**: an ERC-20 transfer queued through the
Safe's Delay Module, executed after 3 minutes. Signed by the smart account
as a sponsored userOp. UI: "Ist in 3 Minuten da." *Verification item §12:
whether Gnosis Pay's delay relay accepts a contract signer; fallback is the
in-app wallet's admin EOA with a sponsored relay.*

## 6. Merchant onboarding flow (Expo)

Entry: the owner's business page → "Stablecoin-Zahlungen annehmen". Every
screen has one primary button and a persistent 7-step progress rail.

| Step | Screen (DE) | Gnosis Pay call | Advances when |
|------|-------------|-----------------|---------------|
| 0 | (silent) | — ensure smart account deployed on Gnosis | bytecode present |
| 1 | Pitch: "Geld, das sofort auf Ihrer Karte ist" | — | tap "Los geht's" |
| 2 | Konto anlegen | `POST /auth/nonce` → sign SIWE → `POST /auth/challenge` (ttl 24 h) → `POST /auth/signup {authEmail, partnerId}` | JWT has `userId` |
| 3 | Bedingungen | `GET /user/terms` → `POST /user/terms` for each of `general-tos`, `card-monavate-tos`, `privacy-policy` (cashback optional) | all accepted |
| 4 | Identität prüfen | `GET /kyc/integration` → open `url` in in-app browser (hosted Sumsub, OTA-safe) | webhook `kyc.status.changed` → `approved` (client also polls `GET /user.kycStatus` every 10 s while foregrounded) |
| 5 | Zwei Fragen | `GET/POST /source-of-funds`; then `POST /verification` + `/verification/check` (phone OTP) | `isSourceOfFundsAnswered && isPhoneValidated` |
| 6 | Konto wird eröffnet | `POST /safe/deploy` (idempotent) → poll `GET /safe/deploy` then `GET /safe-config` | `accountStatus == 0` (≈1 min) |
| 7 | **Sie sind live** | registry row → `live`; map badge appears | — |

After step 7, on the same screen: virtual card (immediate, details behind
PSE — slice 1c), physical card order (optional), IBAN activation (EU/CH
only; `check-iban-availability` → signed message → Monerium integration),
and **"QR-Aufkleber drucken"** — offered *only now*, never earlier, so no
sticker ever points at an address that later changes.

Target: ten minutes from step 1 to step 7 when Sumsub approves on first
pass. The number is a promise in the pitch; measure it.

KYC statuses and handling: `notStarted`/`documentsRequested` → open link;
`pending`/`processing` → wait screen; `resubmissionRequested` → reopen
link; `rejected`/`requiresAction` → "Bitte Support kontaktieren" with the
Gnosis Pay support address; never retry automatically.

## 7. Citizen flow

A citizen needs nothing to *receive* and only a float to *pay*:

1. Scan a merchant QR → app recognises the Safe as a registered merchant →
   shows business name and amount → "Bezahlen" → EURe transfer from the
   Geldbörse as a sponsored userOp → done, sub-5-second.
2. Insufficient float → inline "Aufladen": if the citizen has a Konto,
   queue a delay-module transfer (§5); if not, offer the same Konto
   onboarding as merchants (steps 2–6) with the IBAN as the top-up rail.

Citizens never see the raw Safe address.

## 8. Payment protocol

**One QR standard: EIP-681.**

```
ethereum:0x420CA0f9B9b604cE0fd9C18EF134C705e5Fa3430@100/transfer
        ?address=<merchantSafe>&uint256=<amountWei>
```

- Static sticker: no `uint256` (payer enters the amount in their wallet).
- Dynamic Kasse: merchant types the amount → `payment_requests` row
  (15-minute expiry) → QR with `uint256`.
- Chain id `@100` makes compliant wallets switch to Gnosis. Outside wallets
  need a dust of xDAI for gas; that is their wallet's concern, not ours.

**Our scanner** (`lib/payments/scanner.ts`) parses the same URI. If
`address` is a live merchant Safe it takes the in-app path (§7). Otherwise it
falls back to a plain "an diese Adresse senden?" confirmation.

EIP-681 carries no memo, so the request id is never in the QR. The in-app
path therefore attaches the payer like this: right after the userOp is
submitted, the app inserts a `merchant_payments` stub `{tx_hash, log_index
= -1 placeholder → replaced on index, payer_wallet}`; the indexer's upsert
merges the on-chain fields and applies the same matching rule as for
outside wallets. Payer identity is a decoration on a matched payment, never
an input to matching.

**Matching rule (v1): exact.** A `merchant_payments` row matches a request
when `to == safe`, `amount_wei == request.amount_wei`, and `block_ts` within
the request window. First match wins; anything else — wrong amount, wrong
token, expired request — is stored as `unmatched` and shown in the ledger as
"Unzugeordneter Eingang". Money is never lost, only unmatched. No fuzzy
matching, no partial payments in v1.

**Amounts.** Merchants think in euros with two decimals; EURe has 18. One
function pair, `eurToWei`/`weiToEur`, with tests, no floating point.

**Address display.** The raw Safe address appears only on the merchant's
own "Empfangen" screen with a copy button. Everywhere else: business name.

## 9. Detection and registry

### Tables (Supabase, RLS on)

`merchant_payment_accounts`
- `id uuid pk`, `owner_wallet text` (lower-cased smart-account address, unique)
- `gp_user_id text`, `gp_safe_address text` (unique, nullable until deployed)
- `chain_id int default 100`, `token text default 'EURe'`
- `status enum: pending_kyc | kyc_approved | deploying | live | suspended`
- `card_status text`, `iban_status text`, `daily_allowance_eur numeric`
- `created_at`, `updated_at`

`merchant_entities` (a Konto may back several places)
- `account_id fk`, `entity_type enum: business | restaurant | account`,
  `entity_id uuid`, unique on (`entity_type`, `entity_id`)

`payment_requests`
- `id uuid pk`, `account_id fk`, `amount_wei numeric`, `token text`,
  `note text`, `created_by text`, `created_at`, `expires_at`,
  `status enum: open | paid | expired`, `matched_payment_id fk nullable`

`merchant_payments` (indexed inbound EURe transfers)
- `tx_hash text`, `log_index int` — pk on both
- `safe_address text`, `from_address text`, `amount_wei numeric`,
  `block_number bigint`, `block_ts timestamptz`
- `request_id fk nullable`, `payer_wallet text nullable` (only when paid in-app)
- `state enum: matched | unmatched`

`indexer_cursor` — single row, `last_block bigint`.

Row-level security: an owner reads only their own account, entities,
requests and payments. Public read is a **view** `merchant_acceptance_public`
exposing `entity_type, entity_id, token, chain_id` for `live` rows — this is
the seam spec 2 publishes from. Everything else is service-role only.

### Indexer — `eure-indexer` edge function, cron every 30 s

1. Read cursor; scan `Transfer(from, to, value)` on EURe V2 from
   `cursor+1` to `latest - 2` (two-block lag; Gnosis reorgs are rare and
   shallow) with `to IN (live safes)`, batched 2 000 blocks.
2. Upsert `merchant_payments` (pk makes re-scans idempotent).
3. Match against open requests (§8 rule) in one transaction; mark request
   `paid`; expire requests past `expires_at`.
4. Advance cursor only after the transaction commits.
5. Fire a Supabase Realtime change the Kasse screen listens to.

### Webhook receiver — `gnosispay-webhook` edge function

- Verify Ed25519 over `${X-Webhook-Timestamp}.${body}` against the public
  key from `GET https://webhooks.gnosispay.com/api/v1/public-key`
  (cached 1 h). Reject timestamps older than 5 min. Return 2xx fast; work
  is enqueued, since Gnosis Pay retries on non-2xx with 1/5/15-minute
  backoff and times out at 30 s.
- `kyc.status.changed` → update `status` (`approved` → `kyc_approved`).
- `user.created` → set `gp_user_id`.
- `card.transaction.created` → stored raw for spec 3; no v1 behaviour.
- Duplicate events are idempotent by event id.

Note: the endpoint is already registered in the partner dashboard, so
Gnosis Pay will see 404s until this function deploys. Harmless; three
retries then drop.

### Live toast

The Kasse screen subscribes over websocket (thirdweb `watchContractEvents`
on EURe, filter `to = safe`) for the instant "Zahlung eingegangen" and to
Supabase Realtime on `payment_requests` for the authoritative state. If the
socket drops, poll the request row every 10 s. The toast never marks a
request paid by itself.

### Map

`businesses`, `restaurants` and org `accounts` gain nothing; a view joins
`merchant_entities` + `live` accounts. The Expo map adds `acceptsStablecoin`
to `MapFilterState`, a "Stablecoin" chip in the filter bar, and a small badge
on pins. Category row untouched.

## 10. Error handling

| Situation | Behaviour |
|-----------|-----------|
| SIWE 401 (undeployed account) | run step 0, retry once, then surface |
| KYC `rejected` / `requiresAction` | status screen + support contact; no auto-retry |
| Safe deploy `failed` | re-POST (idempotent); after 2 min show "Dauert etwas länger", keep polling in background, push when `ok` |
| Websocket drop | 10-second polling of the request row |
| Wrong token / wrong amount / expired request | `unmatched`, visible in ledger, never auto-matched |
| Indexer RPC error | cursor not advanced; next cron run resumes |
| Webhook bad signature | 401, logged, no state change |
| Kill switch `app_settings.stablecoin_payments_enabled = false` | onboarding entry hidden, Kasse shows "vorübergehend nicht verfügbar", existing QR still receives (on-chain), indexer keeps running |

## 11. Security and privacy

- No partner secret in the app. Per-user SIWE JWT (ttl ≤ 24 h) in
  `expo-secure-store`; refreshed by re-signing.
- KYC documents go Sumsub ↔ Gnosis Pay only. We store `gp_user_id`, Safe
  address and statuses — no PII beyond what the app already holds.
- PSE mTLS private key lives in Supabase secrets, never in the client, never
  in git. The PSE frame is hosted on `app.roebel.app` (registered domain).
- Webhook: signature + timestamp window + event-id idempotency.
- Sponsored userOps: the thirdweb Gnosis sponsorship policy must allow
  EURe V2 transfers and Gnosis Pay Safe module calls (§12).

## 12. Open items and verification list

1. Delay relay with a contract signer (§5) — test on Max's own Konto first.
2. GmbH eligibility — ask Gnosis Pay partner manager.
3. Staging/sandbox with Sumsub test documents — ask; if none, every test
   onboarding is a real KYC.
4. Startup tier price, minimums, interchange share — ask.
5. thirdweb sponsorship policy allowlist — Max checks the dashboard.
6. SIWE `domain` for a native app — use `app.roebel.app` (registered);
   confirm on first login.
7. Apple/Google Pay provisioning path for virtual cards — later.

## 13. Configuration

Expo (`.env`, inlined at bundle time, OTA-safe):
`EXPO_PUBLIC_GNOSISPAY_PARTNER_ID`, `EXPO_PUBLIC_GNOSISPAY_APP_ID`,
`EXPO_PUBLIC_GNOSISPAY_API_URL`, `EXPO_PUBLIC_GNOSIS_WSS_URL`.
Supabase secrets: `GNOSISPAY_PSE_KEY_PEM`, `GNOSISPAY_PSE_CERT_PEM`,
`GNOSIS_RPC_URL`. Flag: `app_settings.stablecoin_payments_enabled`.

## 14. Testing

- **Unit**: EIP-681 build/parse round-trip; `eurToWei`/`weiToEur` edge
  cases (0.01, 999 999.99, rounding); matcher (exact, window edges,
  duplicate logs, two open requests same amount); Ed25519 verify with a
  known-good vector; KYC status reducer.
- **Integration**: real Gnosis Pay API on the Free tier; Max's own KYC is
  the fixture user. Full onboarding through `accountStatus == 0`.
- **On-chain**: 1 EURe on Gnosis mainnet — one payment from MetaMask via
  the static QR, one from the app via a dynamic request; both indexed,
  the second matched with payer name.
- **Device**: Max's Android. Everything OTA-safe (hosted KYC; expo-camera
  and qrcode-svg already present). Repack-channel APK before any update.

## 15. Rollout slices

- **1a — Konto + map**: onboarding steps 0–7, registry tables, webhook
  receiver, map badge/chip. Deliverable: Max is live on the map.
- **1b — Kasse + pay**: EIP-681, dynamic requests, indexer, scanner,
  in-app pay, Aufladen. Deliverable: the two on-chain test payments.
- **1c — Card + IBAN**: PSE mTLS backend + frame, virtual card reveal,
  physical order, IBAN activation. Gated on Gnosis Pay signing the CSR.

## 16. Operational status (2026-09-04)

Done by Max: partner account "NetizenLabs" (Free tier), domains
`netizenlabs.xyz` + `app.roebel.app`, webhook endpoint registered and
enabled, PSE step 1 (key + CSR generated locally, outside the repo).
Pending: PSE steps 2–3 (upload CSR, receive cert), Supabase MCP auth,
thirdweb policy check, partner-manager questions (§12 items 2–4).
