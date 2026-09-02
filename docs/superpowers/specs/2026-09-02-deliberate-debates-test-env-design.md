# Deliberate-Debatten im Umfragen-Forum — Test-Environment Design

Date: 2026-09-02
Status: approved in chat (deploy target, content store, Supabase env confirmed by Max); on-chain layer already deployed.

## 1. Goal

Wire the [Deliberate protocol](https://github.com/deliberate-app) (argument trees rated by
constant-product markets, tallied on-chain) into the Umfragen-Forum as a **flag-gated test
environment** Max can exercise on his device against the real app stack, then promote to
production by flipping a remote flag + OTA. A forum thread can graduate into a structured
debate; citizens join, argue pro/con, stake Debatten-Punkte, and the tally produces an
on-chain Meinungsbild.

Decisions taken (Max, 2026-09-02):
- **Gnosis mainnet** deployment with the existing deployer — the only environment where the
  real app (thirdweb smart accounts, `sponsorGas: true`) works unchanged. Isolation is
  per-debate via the identity-registry parameter, not per-chain.
- **Content in Supabase, digest-keyed** — the chain stores `contentURI = bytes32 sha-256`
  of the UTF-8 text (IPFS raw-leaves digest); a `debate_contents` table stores the plaintext
  with a pgcrypto CHECK that content hashes to its key. IPFS pinning is a production step;
  digests are already IPFS-compatible.
- **Prod Supabase project**, additive-only changes, applied directly via the Supabase MCP.
- **Gate = Max's existing Circles group** (Röbeltaler `0xAc2C…470c`) via a group-anchored
  `CirclesIdentityRegistry` (`requireHuman = true`).

## 2. On-chain layer (DEPLOYED 2026-09-02, block 48043955)

Pinned upstream commit `0392bd43be3289f1e4ae1f0748ee6c005ead04e2` (deliberate-app/contracts
`develop`, 142/142 tests green locally, forge 1.5.1 / solc 0.8.35 / evm osaka).

| Contract | Address | Notes |
|---|---|---|
| `Deliberate` | `0xB208C359a206a0c35a7D4D99dEF63d9F6143DE9b` | unowned, non-upgradeable, permissionless `createDebate`; tx `0x77a77be9…` |
| `CirclesIdentityRegistry` (Röbel gate) | `0xD1d6d0c8fd4D232D810FF920c802d748537E14Fe` | hub `0xc12C…13e8`, anchor = Röbeltaler group `0xAc2C…470c`, requireHuman; tx `0x8b07a0c0…`. Verified: admits Max's citizen wallet `0xC49d…Fb28`, rejects non-members |
| `CirclesIdentityRegistry` (any human, spare) | `0x0959525FF2b7436441192f4d14CfA91e44c40697` | anchor = 0, requireHuman; for open-to-all-Circles debates later |

Protocol constants that shape the UI: initial grant 10_000 hundredths (display `/100` as
"Punkte"), min argument deposit 1_000 (= 10.00 Punkte), max 512 arguments, approval =
`con / (pro + con)`, phases derived client-side from `editingEndTime`/`ratingEndTime` +
`finished`. Only `tallyTree` needs a transaction after rating ends; anyone may call it.

## 3. Supabase (prod project `wwbeqhkslxdxhktqzqti`, via MCP + mirrored migration files)

- **`debate_contents`**: `digest text PK` (lowercase hex, 64 chars), `content text`
  (≤ 1024 bytes), `created_at`. CHECK `digest = encode(sha256(convert_to(content,'UTF8')),'hex')`
  — the table cannot store content that lies about its digest. RLS: select/insert for all
  (anon-key posture of the repo); no update/delete (append-only, content-addressed).
- **`forum_threads.debate_id bigint NULL`** + `debate_created_by text NULL` — set one-shot via
  SECURITY DEFINER RPC `attach_debate_to_thread(p_thread_id, p_wallet, p_debate_id)`:
  owner-only, published-only, fails if already attached.
- Both applied with `apply_migration` (files also committed under `supabase/migrations/`).

## 4. App integration (apps/expo)

**Gating**: `deliberateDebatesEnabled()` = `__DEV__ || app_settings.deliberate_debates_enabled === 'true'`
(pilot-gate semantics like `fetchBuzzWorkspaceEnabled`). All debate UI hides behind it;
production users see nothing until the flag flips.

**Constants** (`constants/deliberate.ts`): addresses (env-overridable), `getContract`
handles on `gnosis` (write) / `gnosisRead` (read), following `constants/thirdweb.ts` idiom.

**Data layer** (`lib/deliberate.ts`, no indexer in the test env — direct RPC reads):
- Reads via thirdweb `readContract` with inline method-signature strings: `debates`, `phases`,
  `outcome`, `users`, `getArgument` (tree assembled by walking ids `0..argumentsCount-1`),
  `getUserShares`, `quoteStake`.
- Pure helpers (unit-tested): `derivePhase(now, editingEnd, ratingEnd, finished)`,
  `approvalOf(pro, con)`, `formatPunkte(hundredths)`, `sha256DigestHex(text)` (expo-crypto),
  tree assembly, ≤1 KiB UTF-8 validation.
- Content: `putDebateContent(text)` (insert digest+text, tolerate duplicate), fetch/batch-fetch
  by digest with client-side re-hash verification.
- TanStack Query keys `['debate', id]`, `['debate', id, 'args']`, `['debate', id, 'me', wallet]`.

**Writes** (existing pattern `prepareContractCall` + `sendTransaction({ transaction, account })`
with `useGnosisWallet()`): `createDebate`, `join`, `addArgument`, `stakePro`/`stakeCon`,
`tallyTree`. Test-env debates created from the app use the Röbel gate registry.

**Screens** (forum idiom: StyleSheet + useTheme, BottomDrawer sheets, PostAuthorRow, no raw
addresses — resolve display names via `users`):
- `app/forum/debate/[id].tsx` — thesis header + phase clock ("Bearbeitung bis …", "Bewertung
  bis …", "Abgeschlossen: These angenommen/abgelehnt"), Punkte balance, join CTA
  ("Debatte beitreten"), pro/con children of the focused argument with drill-down +
  breadcrumb, per-argument approval bar, argument composer sheet (Pro/Contra toggle,
  Einschätzung slider, Einsatz stepper ≥ 10.00), stake sheet with `quoteStake` preview.
- Thread integration: "Debatte" strip on `ForumThreadCard` + thread screen when
  `debate_id` set (phase + approval + participants) → navigates to the debate; "Strukturierte
  Debatte starten" action on the thread screen (flag-gated, citizens) → creates a Röbel-gated
  debate with thesis = thread title (≤ 1 KiB), town-default durations, attaches via RPC,
  mirrors nothing to Nostr yet.

**Copy rules**: German UI; tokens are "Punkte" (never Münzen/CRC); outcome wording
"Meinungsbild", never "Abstimmung"; no wallet addresses shown.

## 5. Seed + device test script

Seeded from the deployer (open-gate debates so the EOA can act):
1. Debate with a compressed schedule (locking 5 min / editing 20 min / rating 15 min),
   2-3 arguments, then `tallyTree` — lands **Finished** so the app renders outcome + ratings
   on day one.
2. "Testdebatte" with a live schedule (locking 1 h / editing 3 d / rating 3 d) — **Editing**,
   for Max to join/argue/stake from the app. (Open gate; his citizen wallet passes any gate.)
3. Max exercises creation end-to-end from a thread ("Strukturierte Debatte starten") — that
   debate carries the Röbel group gate.

Verification before handoff: new jest units green, existing suite green, full-project tsc
vs. the 30-error baseline, screens smoke-run where possible. Device script for Max:
documented in the handoff message (dev server steps, what to tap, expected states).

## 6. Production move (after Max's device test passes)

1. Flip `app_settings.deliberate_debates_enabled = 'true'` + Max runs the EAS update
   (never run by Claude unasked).
2. Envio indexer fork for Gnosis (replaces RPC tree-walk at scale) — netizen manifest entry.
3. IPFS pinning proxy (Filebase) beside the Supabase content store; backfill by digest.
4. Tally cron on Fly (scan debates past `ratingEndTime`, call `tallyTree`) + notification
   ingest (new arguments / phase changes / outcome pushes).
5. Legal copy pass (Meinungsbild framing; bounties stay OFF — markets + money needs review).
6. thirdweb dashboard: confirm gas sponsorship covers the new contract (test will reveal).
7. NSP-12 seam: 32100 head cites thread kind-11 id + debateId; 32104 Meinungsbild references
   `outcome()`.

## 7. Out of scope (test env)

Envio indexer, IPFS, bounties, tally cron, Nostr mirroring of debates, moveArgument /
alterArgument / redemption UI (redeem/fees ship with production), realtime debate updates
(pull-to-refresh + refetch-on-focus only), web (apps/web) surface.
