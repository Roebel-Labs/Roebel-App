# Nostr sovereignty — Stages 1 + 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every bound app account may write to `relay.roebel.app` (Stage 1), and people sign their own Vorhaben actions as Nostr events that double as the API request (Stage 2).

**Architecture:** relay-sync writes two allow-lists (all verified bindings → `members.txt`; verified + CitizenNFT → `citizens.txt`); the strfry write policy enforces membership, a kind allow-list, authority-only kinds, citizen-only kinds, size and a per-pubkey rate limit. The Expo app binds a Nostr key for every consenting account. For Vorhaben actions the app signs an NSP-13 2101 event (person key) carrying a per-object `seq` and a `payload_hash`; the web API verifies it, resolves the wallet from the binding, runs the existing rules, and attaches the person's event to the outbox row the DB trigger created — the node publisher then relays it verbatim.

**Tech Stack:** TypeScript packages (`@netizen-labs/protocol|nostr|publisher|record-client|indexer|relay-sync|cli`), awk (strfry plugin), Next.js route handlers, Expo/RN, Postgres triggers.

**Specs:** [`2026-10-02-nostr-sovereignty-roadmap-design.md`](../specs/2026-10-02-nostr-sovereignty-roadmap-design.md) (Stages 1–2), [`2026-10-02-nsp13-vorhaben-record-design.md`](../specs/2026-10-02-nsp13-vorhaben-record-design.md).

## Global Constraints

- pnpm (`/opt/homebrew/bin` on PATH); package tests `cd packages/<x> && pnpm test`; web `pnpm test:web`; Expo `cd apps/expo && npx jest --no-watchman <file>`. **Skip tsc** (Max).
- ESM `.js` import suffixes inside `packages/*`.
- Migrations: written by the implementer, **pasted by Max** (apply_migration is declined); controller verifies read-only.
- Node deploy (`netizen up`, relay-sync, policy, publisher) is **operator-run by Max**.
- Never names or wallet addresses in Nostr events (NSP-13 privacy); German UI copy; code English.
- Relay limits: event JSON ≤ **65536** bytes (the `event` object is measured, not strfry's plugin wrapper); rate **120 events/hour per pubkey, burst 20** (token bucket on strfry's `receivedAt`). Kinds **5** (deletion) and **62** (request to vanish) are exempt from the rate limit, so a user who spent their burst can still delete.
- Kind allow-list (members): `0, 1, 5, 6, 7, 11, 16, 62, 1111, 1059, 2101, 24133, 30078, 31922, 31923, 30023, 30402`.
  Note: `1059` gift wraps and `24133` remote-signer events are signed by **ephemeral keys**, so the member list cannot admit them; they are handled in Stages 3/5, not by the member list.
  Authority-only kinds (only pubkeys in `publisher-keys.txt` / `AGENT_PUBKEYS`): `2100, 32100, 32101, 32102, 32103, 32104, 32105, 32106, 32107, 32108, 32110, 32111`.
  Citizen-only kinds (pubkey also in `citizens.txt`): `11` (forum thread).
- Person-signable actions → allowed roles: `task_started|proof_added|task_submitted` ← assignee; `task_assigned|task_cancelled` ← proposer|attester; `task_approved|changes_requested` ← attester; `tally_confirmed` ← wahlhelfer; `task_created` ← proposer|attester. All other actions are town-only.
- Commits on `main`, by path, trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, push.

## Review Focus

1. **Seq race:** two people act on the same object at once → exactly one wins, the other gets 409 and re-signs; seq stays gap-free. (Task 4 trigger + Task 7 route tests.)
2. **Event/payload mismatch:** a valid person event whose payload_hash/action/object/seq doesn't match the request → rejected, nothing written. (Task 7.)
3. **Revoked or unbound key:** event signed by a revoked/unknown pubkey → 401, never resolved to a wallet. (Task 7.)
4. **Rate limit memory:** the awk bucket table must not grow unbounded (evict idle pubkeys). (Task 2.)
5. **Old app versions:** the legacy signed-request routes keep working unchanged. (Task 7/8.)

---

### Task 1: relay-sync — members vs citizens lists
**Files:** `packages/relay-sync/src/{verify.ts,sync.ts,cli.ts}`, tests in `packages/relay-sync/test/`.
- `verifyRow` returns `{ allowed, citizen, pubkey, wallet, reason }`: `allowed` = binding + wallet signature valid + not revoked (CitizenNFT no longer required); `citizen` = allowed && holds CitizenNFT (RPC error → `citizen=false` for that row, logged, does NOT abort the pass; binding/signature RPC errors still abort as today).
- `syncOnce` writes `ALLOWLIST_PATH` (members: all `allowed` + always-allow keys) and new `CITIZENS_PATH` (default `/etc/strfry/citizens.txt`: `citizen` rows only), both atomic, both via `writeAllowList`.
- Tests: non-citizen with valid binding → in members, not in citizens; revoked → in neither; NFT RPC failure → member yes, citizen no, pass continues.
- Commit `feat(relay-sync): members list for every bound account, separate citizens list`.

### Task 2: strfry write policy — kinds, authorities, citizens, size, rate
**Files:** `packages/cli/src/render.ts` (`renderNostrPolicyAwk`, `renderNostrMembers` + new citizens/authorities files, relay-sync env `CITIZENS_PATH`), `packages/cli/test/` (new `policy.test.ts`), `packages/cli/bundle/*` regenerated only if the repo keeps the bundle in sync (check `render.test.ts`).
- The plugin input line is strfry JSON `{"type":"new","event":{…},"receivedAt":<unix>,"sourceType":…,"sourceInfo":…}`. The awk (POSIX/busybox-compatible: no `systime`, no gawk extensions):
  1. parse `id`, `pubkey`, `kind` (`"kind":(\d+)`), `receivedAt`; reject lines > 65536 chars with msg `blocked: event too large`;
  2. load `members.txt`, `citizens.txt`, `publisher-keys.txt` into arrays once at BEGIN and **reload when `receivedAt` is ≥ 60 s past the last load** (so relay-sync updates apply without restart);
  3. authority kinds → accept only if pubkey in publisher keys; else reject `blocked: kind reserved for the community record`;
  4. pubkey must be member (or authority) else `blocked: only <name> members may publish`; kind must be in the member allow-list else `blocked: kind not accepted here`; citizen-only kinds need citizens list else `blocked: citizens only`;
  5. token bucket per pubkey: capacity 20, refill 120/3600 per second using `receivedAt`; authorities exempt; reject `rate-limited: slow down`; evict buckets idle > 3600 s every 1000 lines.
- Test by running the rendered awk with `/usr/bin/awk` (BWK on macOS; same POSIX subset as busybox) over fixture lines + temp list files (the awk reads list paths from `-v MEMBERS=… -v CITIZENS=… -v AUTHORITIES=…`; the wrapper script passes the `/etc/strfry/...` paths). Cases: member kind 1 accept; non-member reject; member kind 32108 reject; authority 32108 accept; kind 11 non-citizen reject / citizen accept; 21st event in burst rejected; oversize rejected.
- Commit `feat(cli): member write policy with kind rules, citizens-only kinds and rate limit`.

### Task 3: Expo — bind a Nostr key for every consenting account
**Files:** `apps/expo/app/consent.tsx`, `apps/expo/components/consent/ConsentReconsentSheet.tsx`, `apps/expo/components/consent/ConsentGate.tsx`, `apps/expo/lib/nostr/enroll.ts`.
- Remove the `is_verified_citizen` gates; keep the public-record consent gate. `selfHealEnrollment(account)` drops the citizenship argument (update callers).
- Passkey sessions keep their existing path (key from PRF restore).
- Jest: add `apps/expo/lib/__tests__/nostr-enroll.test.ts` mocking `./identity`/`./publish` — `selfHealEnrollment` enrolls without citizenship when consent exists, does nothing without consent.
- Commit `feat(expo): every consenting account gets a bound Nostr identity`.

### Task 4: DB — per-object `seq` and person-signed rows
**Files:** `supabase/migrations/20261003_nostr_outbox_seq.sql`.
- `ALTER TABLE nostr_outbox ADD COLUMN IF NOT EXISTS seq integer, ADD COLUMN IF NOT EXISTS person_signed boolean NOT NULL DEFAULT false;` unique index `(object_type, object_id, seq)`.
- `BEFORE INSERT` trigger `nostr_outbox_seq`: `PERFORM pg_advisory_xact_lock(hashtext(NEW.object_type || ':' || NEW.object_id))`; `NEW.seq := coalesce(max(seq),0)+1` for that object. Backfill existing rows' seq by id order per object.
- `public.next_outbox_seq(p_object_type text, p_object_id uuid) returns integer` (SECURITY DEFINER, service_role only) = max+1 (read-only helper for clients via the web API).
- Controller: hand to Max, verify read-only (`seq` set on the existing row = 1).
- Commit `feat(db): per-object seq and person-signed flag on the Nostr outbox`.

### Task 5: protocol — `seq`, payload hash, trust rules
**Files:** `packages/protocol/src/vorhaben.ts`, `src/index.ts`, tests.
- 2101 requires `["seq", "<positive int>"]`; `prior` becomes optional everywhere. `validateActionChain`: per object, seq values form 1..n without gaps/duplicates; where `prior` is present it must reference the event with seq−1.
- `PERSON_ACTION_ROLES` (per Global Constraints) and `isTrustedAction(ev, townPubkey): boolean` — town-signed → true; else the action must be person-signable, the `p` tag marked with the event's own pubkey must exist and its role must be allowed.
- `payloadHash(payload: Record<string, unknown>): string` — sha256 hex of JSON with sorted top-level keys (same canonicalisation as `apps/web/src/lib/org-membership/message.ts` `hashPayload`; add a parity test against a fixed vector).
- `replayVorhaben` orders by `seq` (fallback prior, then occurred_at, then id).
- Commit `feat(protocol): NSP-13 seq, payload hash and person-signed trust rules`.

### Task 6: publisher — seq on town actions, verbatim person events
**Files:** `packages/publisher/src/{vorhaben.ts,outbox.ts}`, tests.
- `actionToSpec` adds `["seq", String(row.seq)]`; `prior` stays when known.
- Drain: rows with `person_signed = true` are never signed by the town key; if `signed_event` is null they wait (`waiting++`, not an error) — the API attaches it; once present, publish verbatim like any stored event. Per-object blocking unchanged.
- Tests: person row waits until signed_event attached; then relayed with the person's id; town rows carry seq.
- Commit `feat(publisher): seq tags and verbatim relay of person-signed Vorhaben actions`.

### Task 7: web — `POST /api/vorhaben/events` (+ `GET …/seq`)
**Files:** `apps/web/package.json` (+ `"@netizen-labs/nostr": "workspace:*"`, `"@netizen-labs/protocol": "workspace:*"`), `apps/web/next.config.*` (`transpilePackages` += both), `apps/web/src/lib/vorhaben/person-events.ts` (new, pure + injected deps), `apps/web/src/app/api/vorhaben/events/route.ts`, `apps/web/src/app/api/vorhaben/seq/route.ts`, tests `apps/web/tests/vorhaben-person-events.test.ts`.
- Body `{ event: NostrEvent, action: VorhabenAction, payload }` (VorhabenAction = existing API action names) or `{ event, kind: "tally_confirm", proposalId, signature }` for the Wahlhelfer path.
- Checks, in order: `verifyEvent`; `safeParseAction`; resolve `event.pubkey` → wallet (`nostr_identities`, `revoked_at is null`) else 401; `payload_hash` tag == `payloadHash(payload)`; event `action` tag == the NSP-13 action the API action produces (map: task_apply → *(not person-signed: applications are private, Stage 3; keep on legacy route)*, task_start → task_started, task_proof → proof_added, task_submit → task_submitted, task_approve → task_approved, task_request_changes → changes_requested, task_cancel → task_cancelled, task_assign → task_assigned, task_create → task_created); object address == the task's address under the node's town pubkey (`VORHABEN_TOWN_PUBKEY` env = hex of the node's town key, must be set on Vercel); `seq` tag == `next_outbox_seq(object)`; `isTrustedAction` with the resolved role.
- Then run `handleVorhabenAction(deps, wallet, action, payload)` (unchanged rules). On success: find the outbox row for that object with that `seq` and `person_signed=false, signed_event is null`, update `{ signed_event: event, event_id: event.id, person_signed: true }` (conditional update; if no row → log ALARM, still return ok). On seq conflict (unique violation or seq mismatch) → 409 `SEQ_CONFLICT` with the current next seq.
- `GET /api/vorhaben/seq?object=<address>` → `{ next }` (public, read-only).
- `tally_confirm`: same flow with object = poll address; then `submitTallyConfirmation` (wallet signature still required inside the event's tags).
- Legacy routes untouched.
- Tests (injected deps): happy path attaches the event; wrong payload hash → 400; unbound pubkey → 401; revoked → 401; seq mismatch → 409; role not allowed (assignee approving) → 403; rules reject → no attach.
- Commit `feat(web): signed Nostr events as the Vorhaben API`.

### Task 8: Expo — sign Vorhaben actions as events
**Files:** `apps/expo/lib/vorhaben.ts`, `apps/expo/lib/nostr/vorhaben-events.ts` (new), `apps/expo/package.json` (+ `@netizen-labs/protocol` if missing; Metro workspace import, extensionless), tests.
- `vorhabenAction(account, action, payload)`: if the action is person-signable and `loadStoredIdentity()` returns a key and `getRegisteredAt()` is set → GET seq, build the 2101 (tags per NSP-13 + `seq` + `payload_hash` + `["p", ownPubkey, "", role]`, content = German default), sign with `buildEvent`, POST `/api/vorhaben/events` with a 25 s timeout; on `SEQ_CONFLICT` retry once with the returned seq. Otherwise fall back to the legacy `postSigned` path.
- Role the app claims: from the screen context (assignee/proposer/attester) — pass it in from `app/aufgabe/[id].tsx` where the role is already known.
- Tally confirm: event + wallet signature in one request.
- Jest: builder produces tags in the protocol's accepted shape (`safeParseAction` from `@netizen-labs/protocol` passes), fallback when no identity.
- Commit `feat(expo): Vorhaben actions signed with the person's Nostr key`.

### Task 9: readers trust person-signed actions
**Files:** `packages/record-client/src/vorhaben.ts`, `packages/indexer` (no change unless needed), tests.
- `getActions(client, objectAddress, townPubkey)` no longer filters `authors`; it keeps events where `isTrustedAction`-equivalent holds (record-client has no deps: implement the same table locally, with a parity test against protocol via devDependency).
- Commit `feat(record-client): accept person-signed Vorhaben actions by trust rule`.

### Task 10: rollout
- Controller: Android preview OTA after Tasks 3 + 8.
- Max: paste Task 4 migration; set `VORHABEN_TOWN_PUBKEY` on Vercel (`node -e` derivation from the node secret, or read the pubkey of existing proposal heads: `4ab27595540a…` — controller fetches the full hex from the index); redeploy the node (relay-sync, policy, publisher, indexer) with `netizen up`.
