# NSP-13 Vorhaben record on Nostr — design

Date: 2026-10-02 · Status: DRAFT, awaiting Max's review
Builds on: [2026-10-01 proposal tasks + payouts](2026-10-01-proposal-tasks-payouts-design.md) (the Supabase system this mirrors),
[2026-07-31 NSP-12 Public Decision Record](2026-07-31-nsp12-public-decision-record-design.md) (proposal heads, stages, Meinungsbild),
`docs/future-research/2026-09-09_PALANTIR_ONTOLOGY_LESSONS.md` §3 (the NSP-13 "Governed Actions" sketch this formalises).

## 1. Intent

**Now (this spec):** a public, verifiable audit trail on Nostr of everything that happens to a proposal after
the vote — the Meinungsbild result, the Wahlhelfer co-signatures, every task and every task step, the payout
contract and each payout. Anyone (citizens, press, Gemeindevertretung) can check outside the app what
happened, without trusting our server: signatures and on-chain tx hashes are embedded and verifiable.
Supabase stays the working system.

**Later (not this spec, but the grammar must already fit):**
1. *Federation / blueprint* — other towns' nodes mirror the record (NSP-9) and run the same flow; the
   grammar is a reusable standard.
2. *Nostr as source of truth* — people sign their own actions on their devices; Supabase becomes a fast
   read index rebuilt from the relay.

**Third-party clients:** a developer must be able to build a client that shows proposals, Vorhaben stages,
tasks, assignees, proofs and payouts 1:1 like the Röbel app, using only `relay.roebel.app` /
`index.roebel.app`. Names and avatars come from each person's own kind-0 profile (NIP-01), resolved by npub.

**Decisions taken in brainstorming**

| Topic | Decision |
|---|---|
| Purpose now | Public audit trail; Supabase stays the working system |
| Identities | Role + npub. No display names and no wallet addresses in events; names come from the person's kind 0. Non-citizens without an npub appear by role only. **Exception:** a Wahlhelfer confirmation carries the Attester's smart-account address — without it the signature cannot be verified; Attesters hold a public office and their NFT address is public on-chain anyway. |
| Applications | Not published (personal data before any decision). Only the assignment is public. |
| Task comments | Not published now; later as person-signed NIP-22 comments (kind 1111) on the task. |
| Architecture | Outbox written by Postgres triggers → existing publisher drains it → immutable action events + addressable state events. Signed by the node's `town` key now; the same kinds are signed by the acting person later. |
| NSP-12 mapping | The vote itself is a Meinungsbild (32104, advisory). The **Gemeinschaftskasse** is registered as its own NSP-12 decision body (`gemeinschaftskasse`, notices signed by the town key) — it decides about its *own* funds, clearly separate from the Stadtvertretung. Path (legal under NSP-12's topology): `meinungsbild → beschlussvorlage → beschlossen \| abgelehnt` (each gated by a Gemeinschaftskasse notice 32102) `→ umgesetzt` once all payouts are confirmed. The detailed lifecycle lives in a separate `vorhaben` tag. (Revised 2026-10-02 after checking `ALLOWED_TRANSITIONS`: the first draft's direct `meinungsbild → umgesetzt` was illegal.) |

## 2. Event grammar (NSP-13 v1)

Conventions inherited from NSP-12: cross-references are `a` tags (never event ids), except `prior` (§2.2) which
links immutable events by id. German human text in `content`; machine values in tags. All amounts are decimal
strings in the asset's display unit (`"5"`, `"0.25"`, `"10"`). Kind numbers checked free in the repo on
2026-10-02 (32107 is taken by the forum category, so the research sketch's numbers are not used).

| Kind | Name | Type | `d` tag |
|---|---|---|---|
| 32100 | Proposal head (NSP-12, exists) | addressable | `proposal:<proposal_id>` (unchanged) |
| 32104 | Meinungsbild result (NSP-12) | addressable | `poll:<proposal_id>` (NSP-12 requires `poll:<id>`) |
| 32102 | Civic notice (exists) | addressable | `gemeinschaftskasse:<proposal_id>:<beschluss\|ablehnung\|ausgefuehrt>` |
| **2101** | Action applied | regular (immutable) | — |
| **32108** | Task | addressable | `task:<task uuid>` |
| **32110** | Payout contract | addressable | `contract:<proposal uuid>` |
| **32111** | Payout line | addressable | `payout:<line uuid>` |

`<proposal_id>` is `proposals.proposal_id` (the hex key the publisher already uses for 32100). Internal UUIDs
appear only inside `d` tags of NSP-13 objects and in `["proposal_uuid", …]` on the head, so a client can join.

### 2.1 Proposal head 32100 — additions

```
["stage", "<NSP-12 stage>"]          // meinungsbild | beschlussvorlage | beschlossen | abgelehnt | umgesetzt
["vorhaben", "<lifecycle_stage>"]    // abstimmung | auszaehlung | angenommen | abgelehnt | in_umsetzung | umgesetzt
["proposal_uuid", "<uuid>"]
["budget", "<amount>", "<asset>"]    // only if set
["beneficiary", "<name>"]            // organisation/recipient name, only if set (not a person record)
["a", "32110:<town pk>:contract:<uuid>", "", "contract"]
["a", "32108:<town pk>:task:<uuid>", "", "task"]   // one per task
```
The existing `status` tag (governor state snapshot) is unchanged.

Stage mapping (`vorhaben` → `stage`) and the NSP-12 2100 transitions the publisher emits (signed by the town key):
- `abstimmung`, `auszaehlung` → `meinungsbild` (the head starts there; no transition emitted).
- `angenommen` / `in_umsetzung` → `beschlossen`: emit `meinungsbild → beschlussvorlage`, then
  `beschlussvorlage → beschlossen` citing `["a","32102:<town pk>:gemeinschaftskasse:<id>:beschluss","","notice"]`.
- `abgelehnt` → emit `meinungsbild → beschlussvorlage`, then `beschlussvorlage → abgelehnt` citing
  `…:gemeinschaftskasse:<id>:ablehnung`.
- `umgesetzt` → emit `beschlossen → umgesetzt` (content summarises the executed payouts; the
  `…:ausgefuehrt` notice is published alongside).
Each transition is emitted at most once per proposal (tracked in the outbox, §3), in this order, and every
transition is checked with `isLegalTransition` before signing.

### 2.2 Action 2101 (the log)

```
["a", "<address of the object acted on>", "", "object"]
["a", "32100:<town pk>:proposal:<proposal_id>", "", "proposal"]
["action", "<name>"]
["from", "<status before>"]          // omitted for creation
["to", "<status after>"]
["p", "<actor pubkey hex>", "", "<role>"]   // omitted when the actor has no npub
["role", "<role>"]                    // always present: proposer | applicant | assignee | attester | wahlhelfer | system
["prior", "<event id of the previous 2101 on the same object>"]   // omitted for the first
["occurred_at", "<unix seconds of the DB change>"]
content: fixed German line per action (free-text policy below)
```

Action names (object kind in brackets):
- `stage_changed` (32100)
- `task_created`, `task_assigned`, `task_started`, `proof_added`, `task_submitted`, `task_approved`,
  `changes_requested`, `task_cancelled`, `task_paid` (32108)
- `meinungsbild_published` (32104) — the tally landed on-chain and the confirmation window opened.
- `tally_confirmed` (32104) — extra tags:
  `["signed_text", "<exact message>"]`, `["signature", "<0x…>"]`, `["signer_account", "<0x… smart account>"]`,
  `["result_hash", "<0x…>"]`, `["chain", "100"]`. Verifiable with ERC-1271 (`isValidSignature`) / EIP-191.
- `payout_planned`, `payout_proposed`, `payout_confirmed`, `payout_failed`, `payout_unclear` (32111) — extra tags
  `["tx", "<hash>"]` / `["safe_tx", "<safeTxHash>"]` when known.
- `proof_added` extra tags: `["url", "<public storage url>", "image"|"pdf"]`, `["tx", "<hash>"]`.

`prior` gives each object a gap-free, ordered chain; a client detects a missing event by a broken chain.

**Free-text policy.** `content` is a fixed German default per action, never the actor's own text (proof notes and
remarks may name people, places or phone numbers): `task_created` "Aufgabe angelegt.", `task_assigned` "Aufgabe
vergeben.", `task_started` "Aufgabe gestartet.", `proof_added` "Nachweis hinzugefügt.", `task_submitted` "Zur
Abnahme eingereicht.", `task_approved` "Aufgabe abgenommen.", `task_paid` "Aufgabe ausgezahlt.", `stage_changed`
"Stand geändert.", `payout_planned|proposed|confirmed|failed|unclear` "Auszahlung geplant." / "Auszahlung zur
Freigabe vorgeschlagen." / "Auszahlung bestätigt." / "Auszahlung fehlgeschlagen." / "Auszahlung wird geprüft.",
`meinungsbild_published` "Das Bürgervotum ist ausgezählt und veröffentlicht.", `tally_confirmed` "Wahlhelfer:in
bestätigt das Bürgervotum.". Exception: `changes_requested` (attester) and `task_cancelled` (proposer) keep the
reason text, since it is given in a public role. Proof attachment URLs (`url`, `tx`) stay published; the app says
so in the proof drawer ("Nachweise (Fotos, Dateien, Transaktions-Hash) sind öffentlich einsehbar und werden im
öffentlichen Protokoll verlinkt. Dein Text bleibt in der App.").

**Ordering notes.**
- One stage change can expand into several NSP-12 hops (§2.1); those hops share one `created_at`. Order them by
  their `from`/`to` chain, never by `created_at` alone.
- Payout lines publish only the states in `PUBLISHED_LINE_STATUSES`; the intermediate `sendend`/`gesendet` are
  skipped, so a payout chain may jump (e.g. `from` = `vorgeschlagen`, `to` = `bestaetigt`, or a `from` naming an
  unpublished state). Clients must accept such jumps; `prior` still makes the chain gap-free.

### 2.3 Task 32108

```
["a", "32100:<town pk>:proposal:<proposal_id>", "", "proposal"]
["title", "<title>"]
["status", "<offen|vergeben|in_arbeit|eingereicht|abgenommen|ausgezahlt|abgebrochen>"]
["reward", "<amount>", "<EURe|EURC>"]
["deadline", "<unix seconds>"]                  // optional
["criterion", "<id>", "<text>"]                 // one per acceptance criterion, in order
["p", "<assignee pubkey hex>", "", "assignee"]  // optional (no npub → ["assignee_role","non_citizen"])
["p", "<creator pubkey hex>", "", "creator"]    // optional
["created_at_src", "<unix seconds>"]
content: description (German)
```

### 2.4 Payout contract 32110 and line 32111

32110:
```
["a", "32100:<town pk>:proposal:<proposal_id>", "", "proposal"]
["fee_bps", "500"]
["platform_safe", "<0x… platform Safe>"]       // an organisation account, not a person
["total", "<amount>", "<asset>"]                // one per asset
["a", "32111:<town pk>:payout:<line uuid>", "", "line"]   // one per line
```
32111:
```
["a", "32110:<town pk>:contract:<proposal uuid>", "", "contract"]
["a", "<32108 task address | 32104 meinungsbild address | 32100 head address>", "", "for"]
["role", "<empfaenger|aufgabe|wahlhelfer|plattform>"]
["amount", "<amount>", "<EURe|EURC|MUENZEN|XDAI>"]
["rail", "<funder_muenzen|funder_xdai|safe_eure|manual_safe|safe_eurc_base>"]
["status", "<geplant|vorgeschlagen|bestaetigt|fehlgeschlagen|unklar>"]   // published states only
["p", "<recipient pubkey hex>", "", "recipient"]   // when the recipient has an npub
["recipient_label", "<org/beneficiary name or 'Plattform'>"]   // ONLY for empfaenger and plattform roles
["tx", "<hash>"]                                    // when confirmed
content: ""
```
A person's payout line never carries a name or wallet address; the tx hash leads to the chain, where the
recipient address is public by nature of the transfer.

### 2.5 Meinungsbild 32104 (NSP-12)

Published once the tally is on-chain, `d` = `poll:<proposal_id>`: `["advisory","true"]` (pinned by NSP-12), `["a", head, "", "proposal"]`,
`["for", n]`, `["against", n]`, `["abstain", n]`, `["tally_contract", "<0x…>"]`, `["result_hash", "<0x…>"]`,
`["chain","100"]`. Each Wahlhelfer confirmation is a separate 2101 `tally_confirmed` pointing at it.
`created_at` = max(`tally_confirm_opened_at`, latest `proposal_wahlhelfer.confirmed_at`, `proposals.updated_at`)
+ `MAPPER_VERSION`, so a later version (final counts, `result_hash`) always supersedes the earlier one.

### 2.6 Gemeinschaftskasse notices 32102

The manifest registers `{ "id": "gemeinschaftskasse", "noticeScope": "town" }` under `record.decisions.bodies`.
Three notices per proposal at most, all town-signed, German content, legally framed as decisions of the
community treasury about its own funds — never as decisions of the municipality:
- `gemeinschaftskasse:<id>:beschluss` — when the Meinungsbild was positive ("Die Gemeinschaftskasse setzt
  Vorschlag #3 um: 150 € an …, Aufgaben …").
- `gemeinschaftskasse:<id>:ablehnung` — when it was negative.
- `gemeinschaftskasse:<id>:ausgefuehrt` — when the lifecycle reaches `umgesetzt`, with the `tx` hashes of all
  confirmed payout lines.

## 3. Data flow

### 3.1 Outbox (Postgres)

New table `public.nostr_outbox` (service role only, no client grants, RLS on, no policies):
`id bigserial`, `object_type` (`proposal|task|tally|payout`), `object_id uuid`, `proposal_id uuid`, `action`,
`from_status`, `to_status`, `actor_wallet` (nullable), `actor_role`, `body` (nullable text), `extra jsonb`,
`occurred_at`, `signed_event jsonb` (null until signed), `event_id text`, `published_at`, `attempts int`,
`last_error`.

AFTER triggers (SECURITY DEFINER, `REVOKE EXECUTE` from anon/authenticated) append one row per meaningful change:
- `task_activity` INSERT → task actions (`kind`/`from_status`/`to_status`/`actor_wallet`/`body`/`attachments`);
  `kind='comment'` rows are **skipped** (comments are out of scope).
- `proposal_tasks` INSERT → `task_created`; UPDATE of `status` to `ausgezahlt` → `task_paid` (set by the settle
  path, not via `task_activity`).
- `proposal_stage_events` INSERT → `stage_changed`.
- `proposal_wahlhelfer` UPDATE when `confirmed_at` goes from NULL to a value → `tally_confirmed` (extra = message,
  signature, result hash, attester wallet).
- `proposal_payout_lines` INSERT → `payout_planned`; UPDATE of `status` to `vorgeschlagen|bestaetigt|fehlgeschlagen|unklar`
  → `payout_proposed|payout_confirmed|payout_failed|payout_unclear` (intermediate `sendend`/`gesendet` skipped).
- `proposals` UPDATE when `tally_confirm_opened_at` goes from NULL to a value → `meinungsbild_published`
  (drives the 32104).

Triggers never fail the business transaction: the insert into the outbox is the only statement and has no
constraints that can reject.

### 3.2 Publisher drain (existing `packages/publisher` loop)

New dataset `vorhaben` in `PUBLISH_DATASETS`. Each pass:
1. Read up to 200 outbox rows with `published_at IS NULL` ordered by `id`.
2. For each row without `signed_event`: resolve `actor_wallet` → npub via `nostr_identities` (service role);
   find `prior` = `event_id` of the latest published row for the same `(object_type, object_id)`; build the
   2101; **sign and store `signed_event` + `event_id` first** (one UPDATE), then publish. A retry re-sends the
   stored event — same id, never a duplicate.
3. Mark `published_at` on relay OK; on failure `attempts += 1`, `last_error`. Rows with `attempts >= 10` are
   logged as an alarm every pass (never dropped). `prior` for later rows on the same object waits until the
   earlier row is published (strict per-object order).
4. Rebuild the addressable state events touched in this pass from the **current Supabase rows**: 32108 per
   task, 32110 + 32111 per contract, 32100 head additions, 32104 when the tally is published, 32102 when
   `umgesetzt` is reached. Addressable events replace themselves, so this is idempotent.

Signer: `deriveOrgIdentity(NODE_AGENT_SECRET, NODE_ID, "town")` — the same key that signs 32100 heads today.
The relay already allows it.

### 3.3 Discovery

- The new kinds are added to the indexer source kinds for the Röbel node (manifest / `packages/cli` render) and
  to the `record.decisions` block of the NSP-0 manifest (`packages/protocol/examples/roebel.netizen.json`), so a
  third-party client learns from the manifest which kinds and which signer to trust.
- `packages/record-client` gets typed readers: `listTasks(proposalAddress, townPubkey)`,
  `getContractLines(contractAddress, townPubkey)`, `getContract(contractAddress, townPubkey)`,
  `getActions(objectAddress, townPubkey)`, and `listProposals` exposes the head additions (stage, vorhaben,
  proposal_uuid, budget, beneficiary) — the same helpers our web app and any third-party client use.
- **Trusted signer = the town key.** Anyone can publish an event carrying the town's `a` tags, so every client
  MUST filter by `authors: [townPubkey]` (and re-check `pubkey`). `getActions` additionally keeps only events whose
  `object`-marked `a` equals the requested address (the `a` filter also matches actions that name it as their
  proposal head).
- **Indexer watermark.** The outbox-drained kinds 2100 and 2101 carry their signing time as `created_at` but can
  reach the relay much later (retries, drain outage). The indexer therefore re-reads a 7-day overlap for those
  kinds (5 minutes for other immutable kinds); inserts dedupe by id. One pass stays capped at `limit: 500` per
  kind, enough at town scale.

## 4. Protocol package (`packages/protocol`)

`src/vorhaben.ts`, exported from the index:
- `VORHABEN_KINDS = { action: 2101, task: 32108, contract: 32110, payoutLine: 32111 }`, action names, role names,
  `vorhabenToNsp12Stage()`.
- Validators (zod, same style as `decisions.ts`): `safeParseAction`, `safeParseTask`, `safeParseContract`,
  `safeParsePayoutLine`; `validateActionChain(events)` (checks `prior` links and order per object).
- `replayVorhaben(events) → { proposals, tasks, contracts, lines }` — pure; rebuilds state from actions + state
  events. This is the bridge to "Nostr as source of truth".
- `verifyTallyConfirmation(action, client)` — rebuilds `hashMessage(signed_text)` and calls ERC-1271 on
  `signer_account` (EOA fallback via `recoverMessageAddress`), plus the chainId-8453 thirdweb domain fallback
  from `verify-account-signature.ts`; `verifyPayoutLine(line, client)` — receipt success + token Transfer of the
  amount in the tx. Both take an injected viem-like client so clients and tests can use them.

## 5. Later phases (designed for, not built)

- **Person-signed actions:** an action 2101 signed by the actor's own npub carries the same tags; the node then
  stops publishing that action type and only re-publishes state events. A client trusts a 2101 if it is signed by
  the town key OR by the `p` actor whose role the manifest allows for that action.
- **Applications:** encrypted to the proposer (NIP-44) as a separate kind, defined then.
- **Comments:** NIP-22 kind 1111 on the 32108 address, person-signed.
- **Federation:** other nodes mirror via NSP-9; their own town key signs their records; the grammar is node-neutral.
- **Supabase as index:** a relay-to-Supabase ingester using `replayVorhaben`.

## 6. Error handling and privacy

- Outbox failures are retried forever and alarmed from 10 attempts; nothing is dropped.
- A payout line whose recipient later deletes their Nostr identity keeps the npub reference (the npub is not
  personal data by itself; the profile is theirs to delete). A person's request to remove the link is handled by
  re-publishing the affected addressable events without the `p` tag; immutable 2101s get a NIP-09 deletion
  request (best effort, documented as such in the privacy notice).
- No secrets in events; `signed_text`/`signature` of a Wahlhelfer confirmation are public by design (they are the
  proof).

## 7. Testing

- SQL: trigger tests via `execute_sql` in a rolled-back transaction (one outbox row per change; comments skipped;
  `sendend`/`gesendet` skipped).
- Protocol: validators, `validateActionChain`, `replayVorhaben` round-trip (fixture events → state equals the
  fixture DB rows), `verifyTallyConfirmation` with an injected client.
- Publisher: mapping tests per kind (like the existing `proposalToSpec` tests); drain test proving sign-once /
  re-send-same-id and per-object ordering.
- Live: one publisher dry run against `relay.roebel.app` for proposal #3, then read back with `record-client`
  and `replayVorhaben`, compare with Supabase.

## 8. Out of scope

Applications, task comments, person-signed events, Expo reading Nostr, federation wiring, a Supabase ingester.
