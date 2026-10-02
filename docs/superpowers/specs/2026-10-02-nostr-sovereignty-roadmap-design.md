# Nostr sovereignty + federation blueprint — roadmap design

Date: 2026-10-02 · Status: DRAFT, awaiting Max's review
Builds on: [NSP-13 Vorhaben record](2026-10-02-nsp13-vorhaben-record-design.md), [proposal tasks + payouts](2026-10-01-proposal-tasks-payouts-design.md),
[Nostr citizen identity bridge](2026-07-27-nostr-citizen-identity-bridge-design.md), [NSP-9 federation](2026-07-27-nsp9-federation-design.md),
[NSP-12 decision record](2026-07-31-nsp12-public-decision-record-design.md).

## 1. Goal

**Full sovereignty for users on Nostr:** every action a person takes is signed by *their own* key; the relay
is the source of truth; Supabase is only a fast index rebuilt from it; anyone can take their identity and
their data to any Nostr client; any developer can build a 1:1 client from `index.roebel.app`; and any town
can run the same system on its own node (**blueprint / federation**).

**What exists today (2026-10-02):**
- Citizens' Nostr keys are derived on-device from a wallet signature (`apps/expo/lib/nostr/identity.ts`), kept in
  SecureStore, bound via the `nostr-identity-register` edge fn (kind-30078 binding + ERC-1271; **not** citizen-gated).
- Posts, profile, forum, likes, reposts, deletions and vanish are already person-signed from the app
  (`apps/expo/lib/nostr/publish.ts`); the publisher's `backfeed` carries kinds 1/6/7 from any client back into
  the app tables.
- The relay write policy (`packages/cli/policies/nostr-citizen-write`, allow-list synced by `packages/relay-sync`)
  admits **CitizenNFT holders only**.
- The Vorhaben lifecycle is published by the node's **town key** (NSP-13): actions name the actor by npub only.

## 2. Decisions (brainstorming 2026-10-02)

| Topic | Decision |
|---|---|
| Who may write to `relay.roebel.app` | **Every bound app account** (not only citizens), rate-limited, kinds restricted to what the system uses. Citizen-only rights (votes, citizen forum rights) stay gated by CitizenNFT in the policy. |
| Write path for person actions | **The signed Nostr event IS the API request.** The app signs; the server verifies signature + binding + rules, writes Supabase synchronously (fast UI) and relays the identical event. Other clients may later post the same event straight to the relay; the ingester (Stage 4) handles it. |
| Exit / keys | **NIP-46 remote signer in the app** (key never leaves the phone) **plus nsec export** behind biometrics + warning. The key stays re-derivable from the wallet. |
| Open relay | **Later stage (7):** unknown keys may write with NIP-13 proof-of-work, rate limits and quarantine (not indexed until a trusted key interacts). |
| Federation | **Included (Stage 6):** NSP-13 as a published standard, manifest-declared trust rules, a Vorhaben preset for `netizen`, mirroring via NSP-9. |
| Data fetching | Apps keep reading from Supabase for speed; Supabase must always be rebuildable from the relay. |

## 3. Stages

Each stage gets its own spec section refinement → plan → implementation; each is useful on its own.
Order: 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 (5 may run in parallel with 3–4).

### Stage 0 — Node deploy (operator: Max)
Build `@netizen-labs/publisher` and `@netizen-labs/indexer`, `netizen doctor` + `netizen up` from DAO_test `main`
(runbook: `docs/RELAY_NODE_REBUILD.md`). Done when `index.roebel.app` serves the #3 task (32108) and its
`task_created` action (2101), and the head carries `stage`/`vorhaben`.

### Stage 1 — A bound Nostr identity for every account
- **App:** every signed-in account (citizen or not) derives and binds its key on first use (today's flow may only
  run for citizens — verify in the plan; the edge fn already accepts any wallet). Orgs: NSP-14 org keys (Safe-set)
  stay the path for organisation identities; personal accounts only here.
- **Relay policy:** new policy `nostr-member-write` replaces `nostr-citizen-write`: allow-list = all bound,
  non-revoked identities (from `nostr_identities`), synced by `relay-sync`; per-pubkey rate limit
  (e.g. 120 events/hour, burst 20) and size limit (64 KB); **kind allow-list** (0, 1, 5, 6, 7, 11, 1111, 16, 2101,
  30078, 31922/31923, the NSP-12/13 kinds, 1059 gift wraps, 24133 NIP-46). Citizen-gated kinds (forum votes,
  anything that counts as a civic vote) still require the pubkey to be on the citizen list.
- **Privacy:** binding stays private (`nostr_identities` not readable by anon); the npub is public by design.
- Done when a non-citizen test account can publish a kind-1 from the app and a kind-1 from a third-party client.

### Stage 2 — Signed events as the API (person-signed Vorhaben actions)
- **Event:** the NSP-13 2101 grammar, signed by the person. Required tags as today plus `["p", <own pubkey>, "", <role>]`
  (self-reference) — the signer IS the actor.
- **API:** `POST /api/vorhaben/events` takes one signed event. Server:
  1. `verifyEvent` (schnorr) and `safeParseAction`;
  2. resolve `event.pubkey` → wallet via `nostr_identities` (non-revoked) — this replaces the
     `roebel-vorhaben-v1` wallet signature (one signature instead of two);
  3. apply the existing rules (`decideTaskAction`, tally-service eligibility, …) — the action, `from`, `to`,
     object and proposal in the event must match what the rules compute, else 409;
  4. write Supabase (as today) and insert the outbox row with `signed_event` = the person's event,
     `event_id`, `person_signed = true`; the publisher only relays/marks it (never re-signs);
  5. relay the event; return `{ ok, eventId }`.
- **Wahlhelfer:** the co-sign carries BOTH the person's Nostr signature (event) and the wallet EIP-191/ERC-1271
  signature over the tally text (`signed_text`/`signature`/`signer_account` tags) — the wallet signature remains
  the on-chain-verifiable proof of eligibility.
- **Privacy rule unchanged:** the event `content` is the fixed German default (NSP-13 §free text), except the
  attester/proposer reason actions; free text the person writes for the team goes into Stage 3 conversation events.
- **Trust rule (manifest `record.vorhaben.signers`):** a 2101 counts if signed by the town key, OR by the `p` actor
  whose role is allowed for that action (e.g. `task_approved` ← attester; `proof_added` ← assignee). Indexer and
  record-client apply the same rule (`isTrustedAction(event, manifest, roles)` in `packages/protocol`).
- **Town key** keeps signing system events only: `stage_changed`, `payout_*`, `task_paid`, `meinungsbild_published`,
  32104, 32108/32110/32111 state events, 32102 notices.
- **Migration path:** old signed-request routes stay until the app version with Stage 2 is ≥ the fenced runtime;
  then they are removed.

### Stage 3 — Conversation on Nostr
- **Comments:** task and proposal comments become NIP-22 kind 1111 events on the 32108 / 32100 address, signed by
  the person, published from the app; the backfeed (extended) writes them into `task_activity` (`kind='comment'`)
  / `proposal_comments`. Editing = new event + NIP-09 deletion of the old one.
- **Applications:** NIP-17-style private message: a NIP-44-encrypted rumor (kind 2102 "application",
  tags `a` task, content = note) gift-wrapped (NIP-59, kind 1059) once per recipient — the proposer and each
  current Attester. The server stores a copy (as today) for the fast UI; the applicant owns the original.
  Withdrawal = a new wrapped rumor with `["status","zurueckgezogen"]`.
- **Assignment** stays a public action (the chosen npub), as in NSP-13.

### Stage 4 — Supabase as an index of the relay
- **Ingester** (extends `packages/publisher/backfeed.ts`): subscribes to the Vorhaben kinds (2101, 1111 on task/
  proposal addresses, 1059 addressed to the node's inbox key for applications) from ANY signer, applies
  `isTrustedAction` + the same rules as the API, and writes Supabase idempotently (event id as key).
  Events already applied via the API are recognised by id and skipped.
- **Rebuild proof:** `replayVorhaben` over the relay must equal Supabase; a nightly job (cron route) compares task
  status, line status and confirmations for every `vorhaben_enabled` proposal and alarms on any difference.
- **Conflict rule:** the relay order (prior chain) wins; an event that violates the rules is ignored (logged),
  never applied partially.

### Stage 5 — Exit and portability
- **NIP-46 signer in the app:** "Mit anderer Nostr-App verbinden" → shows/accepts a `nostrconnect://` URI; the app
  answers kind-24133 requests over `relay.roebel.app`; each `sign_event` request shows a sheet (kind, short
  preview, "Erlauben einmal / immer für diese App / Ablehnen"); permissions per client stored locally; works only
  while the app is open (foreground) in v1.
- **nsec export:** settings → "Nostr-Schlüssel exportieren" → biometric prompt → warning text (German) → reveal +
  copy. Note that the key is re-derivable from the wallet.
- **"Meine Daten auf Nostr":** list of the user's own events from the index (by author), with NIP-09 deletion
  request per event and the existing vanish request.

### Stage 6 — Federation and blueprint
- **Standard:** `docs/protocol/NSP-13.md` (grammar, trust rules, privacy rules, stage mapping) +
  `docs/protocol/CONSUMING_THE_RECORD.md` (how a third-party client reads and verifies).
- **Manifest:** `record.vorhaben` block: kinds, town signer scope, role→action trust table, decision bodies.
- **Preset:** a `vorhaben` preset for `netizen` (Supabase migrations for the 10-01 + 10-02 tables, publisher
  dataset, cron routes, app config keys) so a second town can deploy the whole flow with its own town key.
- **Mirroring:** peers mirror Vorhaben kinds via NSP-9 into their mirror relay; `index` attributes events by
  `node_id`; trust is always per origin node's manifest.

### Stage 7 — Open relay tier
- Unknown pubkeys may write the allowed kinds if the event carries NIP-13 PoW ≥ 20 bits, within strict rate limits
  (per pubkey and per IP), with NIP-42 AUTH.
- **Quarantine:** such events are stored but not indexed until a trusted key references them (reply, reaction,
  approval) — implemented in the indexer as a `quarantined` flag lifted by a trusted reference.
- Optional paid writes for heavy external writers (x402, reusing the metered-access work).

## 4. Cross-cutting rules
- Never put display names or wallet addresses into events (NSP-13 privacy rules); names come from the person's kind 0.
- German UI copy; legal framing as in NSP-13 (Bürgerabstimmung/Bürgervotum, Gemeinschaftskasse decides about its
  own funds).
- Every stage keeps Supabase in sync for the fast app UI.
- Keys: never leave the device except via the explicit nsec export.

## 5. Out of scope
Changing the on-chain governance (MACI) or the Circles/treasury rails; organisation keys (NSP-14 has its own path).
