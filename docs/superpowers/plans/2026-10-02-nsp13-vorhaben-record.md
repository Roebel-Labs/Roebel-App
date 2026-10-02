# NSP-13 Vorhaben record on Nostr — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the full post-vote lifecycle of a proposal (Bürgervotum result, Wahlhelfer co-signatures, tasks and every task step, payout contract and payouts, NSP-12 stage moves) to `relay.roebel.app` → `index.roebel.app` as a verifiable, replayable event record.

**Architecture:** Postgres triggers append one row per meaningful change to `nostr_outbox`. The existing node publisher (`packages/publisher`, runs every 300 s on the Röbel node) drains the outbox in order — sign once, store, publish — as immutable kind-2101 actions, emits NSP-12 2100 transitions + Gemeinschaftskasse notices, and rebuilds addressable state events (32108 task, 32110 contract, 32111 payout line, 32104 Bürgervotum, 32100 head tags) from Supabase. `packages/protocol` defines the grammar, validators, `replayVorhaben` and verifiers; `packages/record-client` gets typed readers; the indexer gets an `a`-tag filter.

**Tech Stack:** TypeScript ESM packages (`@netizen-labs/protocol|nostr|publisher|record-client|indexer`), zod, `node:test` via `tsx --test`, Postgres (Supabase), viem (verifiers, injected client only).

**Spec:** [`docs/superpowers/specs/2026-10-02-nsp13-vorhaben-record-design.md`](../specs/2026-10-02-nsp13-vorhaben-record-design.md) — read it first (incl. the 2026-10-02 revision: Gemeinschaftskasse body, legal NSP-12 path, `poll:<id>`).

## Global Constraints

- Package manager **pnpm**; run package tests with `cd packages/<name> && pnpm test` (`tsx --test test/*.test.ts`).
- Package source uses ESM imports **with `.js` suffix** (e.g. `from "./decisions.js"`), like existing files.
- Kinds: action **2101**, task **32108**, contract **32110**, payout line **32111**; reuse NSP-12 head 32100, transition 2100, notice 32102, Bürgervotum 32104. Never 32107 (forum).
- Signing scope for everything in this plan: **`"town"`** (`TOWN_SCOPE`), via the existing `signSpec`.
- Addresses: head `32100:<pk>:proposal:<proposal_id>`; task `32108:<pk>:task:<task uuid>`; contract `32110:<pk>:contract:<proposal uuid>`; line `32111:<pk>:payout:<line uuid>`; Bürgervotum `32104:<pk>:poll:<proposal_id>`; notice `32102:<pk>:gemeinschaftskasse:<proposal_id>:<beschluss|ablehnung|ausgefuehrt>`. `<proposal_id>` = `proposals.proposal_id` (hex key).
- **2101 `created_at` = signing time** (not the DB time) so the indexer's `since` watermark never skips a late-published action; the DB time goes in `["occurred_at", "<unix>"]`.
- Identities: actors as `["p", <pubkey hex>, "", <role>]` resolved via `nostr_identities` (`wallet_address` → `pubkey_hex`, `revoked_at is null`); no display names, no wallet addresses — **only exception** `tally_confirmed` carries `signer_account`.
- Applications and task comments (`task_activity.kind='comment'`) are never published.
- NSP-12 transitions only via `isLegalTransition`; `beschlossen`/`abgelehnt` always cite a Gemeinschaftskasse notice address.
- User-facing German: the voting phase is **"Bürgerabstimmung"**, its result **"Bürgervotum"**; never "Bürgerentscheid", never "beschlossen von der Stadt". Notice texts speak of the Gemeinschaftskasse deciding about **its own funds**. Protocol identifiers stay `meinungsbild`.
- Commits: `feat(protocol|publisher|record-client|indexer|db): …`, stage by path, end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, push after each; check `git branch --show-current` = `main` before committing.
- Supabase: migrations go to `supabase/migrations/`; `apply_migration` over MCP is **declined by the permission layer** — the implementer writes the file, the controller asks Max to paste it in the SQL editor, then verifies read-only with `execute_sql`.
- Skip `tsc` runs (Max's standing instruction for this work); tests are the gate.
- Node deploy (`netizen up`) is operator-run by Max (Task 8 handover); never run it from a subagent.

## Review Focus

1. **Out-of-order publish** — two changes to the same task in one pass, or a relay failure on the first: the second must wait so `prior` chains stay gap-free. Pinned in Task 5 (drain ordering test).
2. **Re-publish after a crash between sign and mark** — must re-send the identical stored event (same id), never re-sign. Pinned in Task 5.
3. **Comment rows and intermediate payout states leak into the record** — must be skipped by the triggers. Pinned in Task 3 (SQL checks).
4. **A citizen without a Nostr identity (or revoked)** — action carries role only, no `p` tag, no wallet. Pinned in Task 4 + Task 5.
5. **Illegal NSP-12 hop or double transition** — e.g. a proposal going `angenommen → in_umsetzung → umgesetzt` must emit each NSP-12 transition exactly once in legal order. Pinned in Task 5 (transition-ledger test).

---

## File map

- `packages/protocol/src/vorhaben.ts` (new): kinds, enums, addresses, stage mapping, validators, `validateActionChain`, `replayVorhaben`, verifiers.
- `packages/protocol/src/manifest.ts`: publisher dataset `"vorhaben"`.
- `packages/protocol/src/index.ts`: exports.
- `packages/protocol/examples/roebel.netizen.json`: body `gemeinschaftskasse`, indexer kinds, publisher dataset.
- `packages/protocol/test/vorhaben.test.ts`, `test/vorhaben-replay.test.ts` (new).
- `supabase/migrations/20261002_nostr_outbox.sql` (new).
- `packages/publisher/src/vorhaben.ts` (new): mappers for 2101/32108/32110/32111/32104/32102/2100 + head tags.
- `packages/publisher/src/outbox.ts` (new): `drainOutbox`.
- `packages/publisher/src/sync.ts`, `src/mappers.ts` (`proposalToSpec` gains optional vorhaben tags), `src/cli.ts`, `src/index.ts`.
- `packages/publisher/test/vorhaben.test.ts`, `test/outbox.test.ts` (new).
- `packages/indexer/src/query.ts`, `src/api.ts` + test: `a` tag filter.
- `packages/record-client/src/client.ts` (`a` filter), `src/vorhaben.ts` (new readers), `src/index.ts`, `test/vorhaben.test.ts` (new).
- Copy: `apps/expo/lib/forum-stages.ts`, `apps/expo/lib/vorhaben-labels.ts`, `apps/web/src/lib/chat/harness/tenants.ts`, `apps/web/src/lib/chat/harness/packs/roebel-read.ts`, `apps/web/src/lib/chat/inspiration/catalog.ts`.

---

### Task 1: Protocol grammar — kinds, addresses, stage mapping, validators, manifest

**Files:**
- Create: `packages/protocol/src/vorhaben.ts`, `packages/protocol/test/vorhaben.test.ts`
- Modify: `packages/protocol/src/index.ts`, `packages/protocol/src/manifest.ts:202` (dataset enum), `packages/protocol/examples/roebel.netizen.json`

**Interfaces — Produces:**
```ts
export const VORHABEN_KINDS: { action: 2101; task: 32108; contract: 32110; payoutLine: 32111 };
export const LIFECYCLE_STAGES: readonly ["abstimmung","auszaehlung","angenommen","abgelehnt","in_umsetzung","umgesetzt"];
export type LifecycleStage;
export const TASK_STATUSES: readonly [...7]; export type TaskStatus;
export const PUBLISHED_LINE_STATUSES: readonly ["geplant","vorgeschlagen","bestaetigt","fehlgeschlagen","unklar"];
export const LINE_ROLES: readonly ["empfaenger","aufgabe","wahlhelfer","plattform"];
export const ACTOR_ROLES: readonly ["proposer","applicant","assignee","attester","wahlhelfer","system"];
export const ACTION_NAMES: readonly [17 names, see code];
export type ActionName; export type ActorRole;
export function taskAddress(pk: string, taskId: string): string;
export function contractAddress(pk: string, proposalUuid: string): string;
export function payoutLineAddress(pk: string, lineId: string): string;
export function pollAddress(pk: string, proposalId: string): string;          // 32104:<pk>:poll:<id>
export function kasseNoticeD(proposalId: string, kind: "beschluss"|"ablehnung"|"ausgefuehrt"): string;
export function kasseNoticeAddress(pk: string, proposalId: string, kind: "beschluss"|"ablehnung"|"ausgefuehrt"): string;
export function nsp12StageFor(stage: LifecycleStage): Stage;                  // see code
export function nsp12TransitionsBetween(from: Stage, to: Stage): Array<{ from: Stage; to: Stage; notice?: "beschluss"|"ablehnung" }>;
export interface ParsedAction { object: string; proposal: string; action: ActionName; from: string|null; to: string;
  role: ActorRole; actor: string|null; prior: string|null; occurredAt: number; content: string; tags: string[][]; }
export function safeParseAction(ev: DecisionEventLike): { ok: true; value: ParsedAction } | { ok: false; error: string };
export function safeParseTask(ev: DecisionEventLike): ShapeResult;
export function safeParseContract(ev: DecisionEventLike): ShapeResult;
export function safeParsePayoutLine(ev: DecisionEventLike): ShapeResult;
export function validateActionChain(events: Array<DecisionEventLike & { id: string }>):
  { ok: true } | { ok: false; object: string; error: string };
```

- [ ] **Step 1: Write the failing tests** — `packages/protocol/test/vorhaben.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ACTION_NAMES, VORHABEN_KINDS, contractAddress, kasseNoticeAddress, nsp12StageFor, nsp12TransitionsBetween,
  payoutLineAddress, pollAddress, safeParseAction, safeParseContract, safeParsePayoutLine, safeParseTask,
  taskAddress, validateActionChain,
} from "../src/vorhaben.js";
import { isLegalTransition, safeParseMeinungsbild } from "../src/decisions.js";
import { NetizenManifestSchema } from "../src/manifest.js";
import roebel from "../examples/roebel.netizen.json" with { type: "json" };

const PK = "a".repeat(64);
const HEAD = `32100:${PK}:proposal:0xabc`;

test("kinds and addresses", () => {
  assert.deepEqual(VORHABEN_KINDS, { action: 2101, task: 32108, contract: 32110, payoutLine: 32111 });
  assert.equal(taskAddress(PK, "t1"), `32108:${PK}:task:t1`);
  assert.equal(contractAddress(PK, "p1"), `32110:${PK}:contract:p1`);
  assert.equal(payoutLineAddress(PK, "l1"), `32111:${PK}:payout:l1`);
  assert.equal(pollAddress(PK, "0xabc"), `32104:${PK}:poll:0xabc`);
  assert.equal(kasseNoticeAddress(PK, "0xabc", "beschluss"), `32102:${PK}:gemeinschaftskasse:0xabc:beschluss`);
  assert.equal(ACTION_NAMES.length, 17);
});

test("lifecycle → NSP-12 stage", () => {
  assert.equal(nsp12StageFor("abstimmung"), "meinungsbild");
  assert.equal(nsp12StageFor("auszaehlung"), "meinungsbild");
  assert.equal(nsp12StageFor("angenommen"), "beschlossen");
  assert.equal(nsp12StageFor("in_umsetzung"), "beschlossen");
  assert.equal(nsp12StageFor("abgelehnt"), "abgelehnt");
  assert.equal(nsp12StageFor("umgesetzt"), "umgesetzt");
});

test("transition paths are legal NSP-12 hops with notices where required", () => {
  const won = nsp12TransitionsBetween("meinungsbild", "beschlossen");
  assert.deepEqual(won, [
    { from: "meinungsbild", to: "beschlussvorlage" },
    { from: "beschlussvorlage", to: "beschlossen", notice: "beschluss" },
  ]);
  assert.deepEqual(nsp12TransitionsBetween("meinungsbild", "abgelehnt").at(-1), { from: "beschlussvorlage", to: "abgelehnt", notice: "ablehnung" });
  assert.deepEqual(nsp12TransitionsBetween("meinungsbild", "umgesetzt").map((t) => t.to), ["beschlussvorlage", "beschlossen", "umgesetzt"]);
  assert.deepEqual(nsp12TransitionsBetween("beschlossen", "umgesetzt"), [{ from: "beschlossen", to: "umgesetzt" }]);
  assert.deepEqual(nsp12TransitionsBetween("beschlossen", "beschlossen"), []);
  for (const t of nsp12TransitionsBetween("meinungsbild", "umgesetzt")) assert.ok(isLegalTransition(t.from, t.to));
  assert.throws(() => nsp12TransitionsBetween("umgesetzt", "meinungsbild"));
});

const action = (over: Partial<{ tags: string[][]; content: string; kind: number }> = {}) => ({
  kind: over.kind ?? 2101, content: over.content ?? "", created_at: 1790000000,
  tags: over.tags ?? [
    ["a", taskAddress(PK, "t1"), "", "object"], ["a", HEAD, "", "proposal"],
    ["action", "task_assigned"], ["from", "offen"], ["to", "vergeben"],
    ["p", "b".repeat(64), "", "assignee"], ["role", "proposer"], ["occurred_at", "1789999990"],
  ],
});

test("safeParseAction accepts a well-formed action", () => {
  const r = safeParseAction(action());
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.value.action, "task_assigned");
    assert.equal(r.value.role, "proposer");
    assert.equal(r.value.actor, "b".repeat(64));
    assert.equal(r.value.prior, null);
    assert.equal(r.value.occurredAt, 1789999990);
  }
});

test("safeParseAction rejects wrong kind, unknown action, missing role, malformed object", () => {
  assert.equal(safeParseAction(action({ kind: 2100 })).ok, false);
  assert.equal(safeParseAction(action({ tags: action().tags.map((t) => (t[0] === "action" ? ["action", "nope"] : t)) })).ok, false);
  assert.equal(safeParseAction(action({ tags: action().tags.filter((t) => t[0] !== "role") })).ok, false);
  assert.equal(safeParseAction(action({ tags: action().tags.map((t) => (t[3] === "object" ? ["a", "garbage", "", "object"] : t)) })).ok, false);
});

test("tally_confirmed requires signature, signed_text and signer_account", () => {
  const base = [["a", pollAddress(PK, "0xabc"), "", "object"], ["a", HEAD, "", "proposal"], ["action", "tally_confirmed"],
    ["to", "bestaetigt"], ["role", "wahlhelfer"], ["occurred_at", "1"]];
  assert.equal(safeParseAction(action({ tags: base })).ok, false);
  const full = [...base, ["signed_text", "Ich bestätige …"], ["signature", "0x" + "1".repeat(130)],
    ["signer_account", "0x" + "2".repeat(40)], ["result_hash", "0x" + "3".repeat(64)], ["chain", "100"]];
  assert.equal(safeParseAction(action({ tags: full })).ok, true);
});

test("state event validators", () => {
  const task = { kind: 32108, content: "Beschreibung", created_at: 1, tags: [["d", "task:t1"], ["a", HEAD, "", "proposal"],
    ["title", "Spende überweisen"], ["status", "offen"], ["reward", "5", "EURe"], ["criterion", "c1", "Überweisung ausgelöst"]] };
  assert.equal(safeParseTask(task).ok, true);
  assert.equal(safeParseTask({ ...task, tags: task.tags.map((t) => (t[0] === "status" ? ["status", "fertig"] : t)) }).ok, false);
  const contract = { kind: 32110, content: "", created_at: 1, tags: [["d", "contract:p1"], ["a", HEAD, "", "proposal"],
    ["fee_bps", "500"], ["platform_safe", "0x" + "c".repeat(40)]] };
  assert.equal(safeParseContract(contract).ok, true);
  const line = { kind: 32111, content: "", created_at: 1, tags: [["d", "payout:l1"], ["a", contractAddress(PK, "p1"), "", "contract"],
    ["a", taskAddress(PK, "t1"), "", "for"], ["role", "aufgabe"], ["amount", "5", "EURe"], ["rail", "safe_eure"], ["status", "geplant"]] };
  assert.equal(safeParsePayoutLine(line).ok, true);
  assert.equal(safeParsePayoutLine({ ...line, tags: line.tags.map((t) => (t[0] === "status" ? ["status", "sendend"] : t)) }).ok, false);
});

test("validateActionChain detects a broken prior link", () => {
  const a1 = { ...action(), id: "1".repeat(64) };
  const a2 = { ...action({ tags: [...action().tags.filter((t) => t[0] !== "action" && t[0] !== "from" && t[0] !== "to"),
    ["action", "task_started"], ["from", "vergeben"], ["to", "in_arbeit"], ["prior", "1".repeat(64)]] }), id: "2".repeat(64) };
  assert.deepEqual(validateActionChain([a2, a1]), { ok: true });
  const orphan = { ...a2, tags: a2.tags.map((t) => (t[0] === "prior" ? ["prior", "9".repeat(64)] : t)) };
  assert.equal(validateActionChain([a1, orphan]).ok, false);
});

test("Bürgervotum d-tag is NSP-12 compliant", () => {
  assert.equal(safeParseMeinungsbild({ kind: 32104, content: "", created_at: 1, tags: [["d", "poll:0xabc"], ["advisory", "true"]] }).ok, true);
});

test("Röbel manifest: vorhaben dataset, kinds indexed, Gemeinschaftskasse body", () => {
  const m = NetizenManifestSchema.parse(roebel);
  assert.ok(m.services.publisher?.datasets.includes("vorhaben"));
  for (const k of [2101, 32108, 32110, 32111]) assert.ok(m.services.indexer?.kinds.includes(k), `kind ${k} indexed`);
  assert.ok(m.record?.decisions.bodies?.some((b) => b.id === "gemeinschaftskasse" && b.noticeScope === "town"));
});
```

If the JSON import attribute syntax is not supported by the repo's tsx version, read the file with `JSON.parse(readFileSync(new URL("../examples/roebel.netizen.json", import.meta.url), "utf8"))` instead (check how `test/manifest.test.ts` loads it and copy that).

- [ ] **Step 2: Run** `cd packages/protocol && pnpm test` → FAIL (module missing).

- [ ] **Step 3: Implement `packages/protocol/src/vorhaben.ts`:**

```ts
// NSP-13 "Vorhaben" record: the post-vote lifecycle of a proposal on Nostr.
// Spec: docs/superpowers/specs/2026-10-02-nsp13-vorhaben-record-design.md
import { DECISION_KINDS, isLegalTransition, type DecisionEventLike, type Stage } from "./decisions.js";

export const VORHABEN_KINDS = { action: 2101, task: 32108, contract: 32110, payoutLine: 32111 } as const;

export const LIFECYCLE_STAGES = ["abstimmung", "auszaehlung", "angenommen", "abgelehnt", "in_umsetzung", "umgesetzt"] as const;
export type LifecycleStage = (typeof LIFECYCLE_STAGES)[number];
export const TASK_STATUSES = ["offen", "vergeben", "in_arbeit", "eingereicht", "abgenommen", "ausgezahlt", "abgebrochen"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const PUBLISHED_LINE_STATUSES = ["geplant", "vorgeschlagen", "bestaetigt", "fehlgeschlagen", "unklar"] as const;
export const LINE_ROLES = ["empfaenger", "aufgabe", "wahlhelfer", "plattform"] as const;
export const ACTOR_ROLES = ["proposer", "applicant", "assignee", "attester", "wahlhelfer", "system"] as const;
export type ActorRole = (typeof ACTOR_ROLES)[number];
export const ACTION_NAMES = [
  "stage_changed",
  "task_created", "task_assigned", "task_started", "proof_added", "task_submitted", "task_approved",
  "changes_requested", "task_cancelled", "task_paid",
  "meinungsbild_published", "tally_confirmed",
  "payout_planned", "payout_proposed", "payout_confirmed", "payout_failed", "payout_unclear",
] as const;
export type ActionName = (typeof ACTION_NAMES)[number];

export type KasseNotice = "beschluss" | "ablehnung" | "ausgefuehrt";
export const taskAddress = (pk: string, taskId: string) => `${VORHABEN_KINDS.task}:${pk}:task:${taskId}`;
export const contractAddress = (pk: string, proposalUuid: string) => `${VORHABEN_KINDS.contract}:${pk}:contract:${proposalUuid}`;
export const payoutLineAddress = (pk: string, lineId: string) => `${VORHABEN_KINDS.payoutLine}:${pk}:payout:${lineId}`;
export const pollAddress = (pk: string, proposalId: string) => `${DECISION_KINDS.meinungsbild}:${pk}:poll:${proposalId}`;
export const kasseNoticeD = (proposalId: string, kind: KasseNotice) => `gemeinschaftskasse:${proposalId}:${kind}`;
export const kasseNoticeAddress = (pk: string, proposalId: string, kind: KasseNotice) => `32102:${pk}:${kasseNoticeD(proposalId, kind)}`;

/** The NSP-12 stage a Vorhaben lifecycle stage corresponds to (spec §2.1). */
export function nsp12StageFor(stage: LifecycleStage): Stage {
  switch (stage) {
    case "abstimmung": case "auszaehlung": return "meinungsbild";
    case "angenommen": case "in_umsetzung": return "beschlossen";
    case "abgelehnt": return "abgelehnt";
    case "umgesetzt": return "umgesetzt";
  }
}

const PATH: Stage[] = ["meinungsbild", "beschlussvorlage", "beschlossen", "umgesetzt"];
/** Legal NSP-12 hops from `from` to `to` along the Gemeinschaftskasse path; [] when equal; throws when backwards. */
export function nsp12TransitionsBetween(from: Stage, to: Stage): Array<{ from: Stage; to: Stage; notice?: "beschluss" | "ablehnung" }> {
  if (from === to) return [];
  if (to === "abgelehnt") {
    const hops: Array<{ from: Stage; to: Stage; notice?: "beschluss" | "ablehnung" }> = [];
    if (from === "meinungsbild") hops.push({ from: "meinungsbild", to: "beschlussvorlage" });
    else if (from !== "beschlussvorlage") throw new Error(`no NSP-12 path ${from} → abgelehnt`);
    hops.push({ from: "beschlussvorlage", to: "abgelehnt", notice: "ablehnung" });
    return hops;
  }
  const i = PATH.indexOf(from), j = PATH.indexOf(to);
  if (i < 0 || j < 0 || j < i) throw new Error(`no NSP-12 path ${from} → ${to}`);
  const hops = [];
  for (let k = i; k < j; k++) {
    const hop: { from: Stage; to: Stage; notice?: "beschluss" | "ablehnung" } = { from: PATH[k], to: PATH[k + 1] };
    if (hop.to === "beschlossen") hop.notice = "beschluss";
    if (!isLegalTransition(hop.from, hop.to)) throw new Error(`illegal hop ${hop.from} → ${hop.to}`);
    hops.push(hop);
  }
  return hops;
}

const tag = (ev: DecisionEventLike, name: string) => ev.tags.find((t) => t[0] === name)?.[1];
const dTag = (ev: DecisionEventLike) => tag(ev, "d") ?? "";
type ShapeResult = { ok: true } | { ok: false; error: string };
const fail = (error: string) => ({ ok: false as const, error });

const ADDRESS = /^\d+:[0-9a-f]{64}:.+$/;
const HEAD = new RegExp(`^${DECISION_KINDS.head}:[0-9a-f]{64}:proposal:.+$`);
const HEX64 = /^[0-9a-f]{64}$/;

export interface ParsedAction {
  object: string; proposal: string; action: ActionName; from: string | null; to: string;
  role: ActorRole; actor: string | null; prior: string | null; occurredAt: number; content: string; tags: string[][];
}

export function safeParseAction(ev: DecisionEventLike): { ok: true; value: ParsedAction } | { ok: false; error: string } {
  if (ev.kind !== VORHABEN_KINDS.action) return fail(`expected kind ${VORHABEN_KINDS.action}, got ${ev.kind}`);
  const objects = ev.tags.filter((t) => t[0] === "a" && t[3] === "object");
  if (objects.length !== 1 || !ADDRESS.test(objects[0][1] ?? "")) return fail("expected exactly one well-formed object a-tag");
  const heads = ev.tags.filter((t) => t[0] === "a" && t[3] === "proposal");
  if (heads.length !== 1 || !HEAD.test(heads[0][1] ?? "")) return fail("expected exactly one proposal head a-tag");
  const action = tag(ev, "action");
  if (!action || !(ACTION_NAMES as readonly string[]).includes(action)) return fail(`unknown action ${action}`);
  const role = tag(ev, "role");
  if (!role || !(ACTOR_ROLES as readonly string[]).includes(role)) return fail("role tag missing or unknown");
  const to = tag(ev, "to");
  if (!to) return fail("to tag missing");
  const occurred = Number(tag(ev, "occurred_at"));
  if (!Number.isInteger(occurred) || occurred < 0) return fail("occurred_at must be unix seconds");
  const prior = tag(ev, "prior") ?? null;
  if (prior !== null && !HEX64.test(prior)) return fail("prior must be a 64-hex event id");
  const pTag = ev.tags.find((t) => t[0] === "p");
  const actor = pTag?.[1] ?? null;
  if (actor !== null && !HEX64.test(actor)) return fail("p tag must be a 64-hex pubkey");
  if (action === "tally_confirmed") {
    for (const name of ["signed_text", "signature", "signer_account", "result_hash", "chain"]) {
      if (!tag(ev, name)) return fail(`tally_confirmed requires ${name}`);
    }
    if (!/^0x[0-9a-fA-F]{40}$/.test(tag(ev, "signer_account")!)) return fail("signer_account must be an address");
  }
  return { ok: true, value: {
    object: objects[0][1], proposal: heads[0][1], action: action as ActionName, from: tag(ev, "from") ?? null, to,
    role: role as ActorRole, actor, prior, occurredAt: occurred, content: ev.content, tags: ev.tags,
  } };
}

export function safeParseTask(ev: DecisionEventLike): ShapeResult {
  if (ev.kind !== VORHABEN_KINDS.task) return fail("wrong kind");
  if (!/^task:.+$/.test(dTag(ev))) return fail("d must be task:<id>");
  if (!ev.tags.some((t) => t[0] === "a" && t[3] === "proposal" && HEAD.test(t[1] ?? ""))) return fail("proposal a-tag missing");
  if (!tag(ev, "title")) return fail("title missing");
  if (!(TASK_STATUSES as readonly string[]).includes(tag(ev, "status") ?? "")) return fail("status invalid");
  const reward = ev.tags.find((t) => t[0] === "reward");
  if (!reward || !/^\d+(\.\d+)?$/.test(reward[1] ?? "") || !["EURe", "EURC"].includes(reward[2] ?? "")) return fail("reward invalid");
  return { ok: true };
}

export function safeParseContract(ev: DecisionEventLike): ShapeResult {
  if (ev.kind !== VORHABEN_KINDS.contract) return fail("wrong kind");
  if (!/^contract:.+$/.test(dTag(ev))) return fail("d must be contract:<proposal uuid>");
  if (!ev.tags.some((t) => t[0] === "a" && t[3] === "proposal" && HEAD.test(t[1] ?? ""))) return fail("proposal a-tag missing");
  const bps = Number(tag(ev, "fee_bps"));
  if (!Number.isInteger(bps) || bps < 0 || bps > 10000) return fail("fee_bps invalid");
  if (!/^0x[0-9a-fA-F]{40}$/.test(tag(ev, "platform_safe") ?? "")) return fail("platform_safe invalid");
  return { ok: true };
}

export function safeParsePayoutLine(ev: DecisionEventLike): ShapeResult {
  if (ev.kind !== VORHABEN_KINDS.payoutLine) return fail("wrong kind");
  if (!/^payout:.+$/.test(dTag(ev))) return fail("d must be payout:<line id>");
  if (!ev.tags.some((t) => t[0] === "a" && t[3] === "contract" && ADDRESS.test(t[1] ?? ""))) return fail("contract a-tag missing");
  if (!ev.tags.some((t) => t[0] === "a" && t[3] === "for" && ADDRESS.test(t[1] ?? ""))) return fail("for a-tag missing");
  if (!(LINE_ROLES as readonly string[]).includes(tag(ev, "role") ?? "")) return fail("role invalid");
  const amount = ev.tags.find((t) => t[0] === "amount");
  if (!amount || !/^\d+(\.\d+)?$/.test(amount[1] ?? "") || !["EURe", "EURC", "MUENZEN", "XDAI"].includes(amount[2] ?? "")) return fail("amount invalid");
  if (!(PUBLISHED_LINE_STATUSES as readonly string[]).includes(tag(ev, "status") ?? "")) return fail("status invalid");
  return { ok: true };
}

/** Every action's `prior` must name an earlier action on the same object; the first per object has none. */
export function validateActionChain(events: Array<DecisionEventLike & { id: string }>): { ok: true } | { ok: false; object: string; error: string } {
  const byObject = new Map<string, Array<{ id: string; prior: string | null }>>();
  for (const ev of events) {
    const parsed = safeParseAction(ev);
    if (!parsed.ok) return { ok: false, object: "?", error: parsed.error };
    const list = byObject.get(parsed.value.object) ?? [];
    list.push({ id: ev.id, prior: parsed.value.prior });
    byObject.set(parsed.value.object, list);
  }
  for (const [object, list] of byObject) {
    const ids = new Set(list.map((e) => e.id));
    const roots = list.filter((e) => e.prior === null);
    if (roots.length !== 1) return { ok: false, object, error: `expected one first action, found ${roots.length}` };
    for (const e of list) if (e.prior !== null && !ids.has(e.prior)) return { ok: false, object, error: `prior ${e.prior} missing` };
    const children = new Map<string, number>();
    for (const e of list) if (e.prior) children.set(e.prior, (children.get(e.prior) ?? 0) + 1);
    if ([...children.values()].some((n) => n > 1)) return { ok: false, object, error: "chain forks" };
  }
  return { ok: true };
}
```

Add to `src/index.ts`:

```ts
export {
  ACTION_NAMES, ACTOR_ROLES, LIFECYCLE_STAGES, LINE_ROLES, PUBLISHED_LINE_STATUSES, TASK_STATUSES, VORHABEN_KINDS,
  contractAddress, kasseNoticeAddress, kasseNoticeD, nsp12StageFor, nsp12TransitionsBetween, payoutLineAddress, pollAddress,
  safeParseAction, safeParseContract, safeParsePayoutLine, safeParseTask, taskAddress, validateActionChain,
  type ActionName, type ActorRole, type KasseNotice, type LifecycleStage, type ParsedAction, type TaskStatus,
} from "./vorhaben.js";
```

`src/manifest.ts:202`: add `"vorhaben"` to the publisher dataset enum.

`examples/roebel.netizen.json`:
- `services.publisher.datasets`: append `"vorhaben"`.
- `services.indexer.kinds`: append `2101, 32108, 32110, 32111` (keep one-per-line formatting).
- `record.decisions.bodies`: append `{ "id": "gemeinschaftskasse", "noticeScope": "town" }`.

- [ ] **Step 4: Run** `cd packages/protocol && pnpm test` → PASS (all existing tests too). Also `cd packages/cli && pnpm test` (render tests read the example manifest) → PASS; if a render snapshot lists the kinds/datasets, update the expectation to the new values.
- [ ] **Step 5: Commit** — `feat(protocol): NSP-13 Vorhaben grammar, validators and Gemeinschaftskasse body`.

---

### Task 2: Protocol — `replayVorhaben` and verifiers

**Files:** Modify `packages/protocol/src/vorhaben.ts`, `src/index.ts`; create `packages/protocol/test/vorhaben-replay.test.ts`.

**Interfaces — Produces:**
```ts
export interface ReplayState {
  tasks: Map<string, { status: string; assignee: string | null; history: ActionName[] }>;   // key = task address
  lines: Map<string, { status: string; tx: string | null }>;                                 // key = payout line address
  tallyConfirmations: Map<string, { signerAccount: string; signature: string }[]>;          // key = poll address
  stages: Map<string, string>;                                                               // key = head address → latest vorhaben stage
}
export function replayVorhaben(actions: Array<DecisionEventLike & { id: string }>): ReplayState;
export interface VerifyClient {
  readContract(args: { address: `0x${string}`; abi: readonly unknown[]; functionName: string; args?: readonly unknown[] }): Promise<unknown>;
  getTransactionReceipt(args: { hash: `0x${string}` }): Promise<{ status: "success" | "reverted"; logs: Array<{ address: string; topics: string[]; data: string }> } | null>;
}
export async function verifyTallyConfirmation(action: ParsedAction, client: VerifyClient): Promise<boolean>;
export async function verifyPayoutTx(txHash: string, token: string, amountAtto: bigint, client: VerifyClient): Promise<boolean>;
```
Rules: `replayVorhaben` validates each event (`safeParseAction`; invalid ones skipped), orders by `prior` chain per object (fall back to `occurred_at`), applies `to` as the new status; `stage_changed` sets `stages[proposal]`; `tally_confirmed` appends; payout actions set line status (`payout_confirmed` → `bestaetigt` + `tx`). `verifyTallyConfirmation`: `hashMessage(signed_text)` (implement EIP-191 hash with `@noble/hashes/sha3` keccak — `"\x19Ethereum Signed Message:\n" + byteLength + text`), call `isValidSignature(bytes32,bytes)` on `signer_account` and accept magic `0x1626ba7e`; ERC-6492-wrapped or EOA signatures may return false here — the function returns false in those cases (documented: a client may fall back to a full verifier). `verifyPayoutTx`: receipt `success` and a `Transfer(address,address,uint256)` log (topic0 `0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef`) from `token` whose `data` equals `amountAtto`, OR an ERC-1155 `TransferSingle` (topic0 `0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62`) whose value field matches (Münzen).

- [ ] **Step 1: Write failing tests** — `test/vorhaben-replay.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { replayVorhaben, taskAddress, verifyPayoutTx, verifyTallyConfirmation, safeParseAction, pollAddress } from "../src/vorhaben.js";

const PK = "a".repeat(64);
const HEAD = `32100:${PK}:proposal:0xabc`;
let n = 0;
function act(object: string, action: string, from: string | null, to: string, prior?: string, extra: string[][] = []) {
  const id = (++n).toString(16).padStart(64, "0");
  const tags = [["a", object, "", "object"], ["a", HEAD, "", "proposal"], ["action", action], ["to", to], ["role", "system"],
    ["occurred_at", String(1000 + n)], ...(from ? [["from", from]] : []), ...(prior ? [["prior", prior]] : []), ...extra];
  return { id, kind: 2101, content: "", created_at: 2000 + n, tags };
}

test("replay rebuilds task status in chain order even when events arrive shuffled", () => {
  const T = taskAddress(PK, "t1");
  const a = act(T, "task_created", null, "offen");
  const b = act(T, "task_assigned", "offen", "vergeben", a.id, [["p", "b".repeat(64), "", "assignee"]]);
  const c = act(T, "task_started", "vergeben", "in_arbeit", b.id);
  const state = replayVorhaben([c, a, b]);
  assert.equal(state.tasks.get(T)?.status, "in_arbeit");
  assert.equal(state.tasks.get(T)?.assignee, "b".repeat(64));
  assert.deepEqual(state.tasks.get(T)?.history, ["task_created", "task_assigned", "task_started"]);
});

test("replay records tally confirmations and payout confirmations", () => {
  const P = pollAddress(PK, "0xabc");
  const conf = act(P, "tally_confirmed", null, "bestaetigt", undefined, [["signed_text", "x"], ["signature", "0x" + "1".repeat(130)],
    ["signer_account", "0x" + "2".repeat(40)], ["result_hash", "0x" + "3".repeat(64)], ["chain", "100"]]);
  const L = `32111:${PK}:payout:l1`;
  const planned = act(L, "payout_planned", null, "geplant");
  const done = act(L, "payout_confirmed", "geplant", "bestaetigt", planned.id, [["tx", "0x" + "4".repeat(64)]]);
  const s = replayVorhaben([conf, done, planned]);
  assert.equal(s.tallyConfirmations.get(P)?.length, 1);
  assert.deepEqual(s.lines.get(L), { status: "bestaetigt", tx: "0x" + "4".repeat(64) });
});

test("invalid events are skipped, not thrown", () => {
  const s = replayVorhaben([{ id: "f".repeat(64), kind: 2101, content: "", created_at: 1, tags: [["action", "nope"]] }]);
  assert.equal(s.tasks.size, 0);
});

test("verifyTallyConfirmation accepts the ERC-1271 magic value and rejects anything else", async () => {
  const P = pollAddress(PK, "0xabc");
  const ev = act(P, "tally_confirmed", null, "bestaetigt", undefined, [["signed_text", "Ich bestätige"], ["signature", "0x" + "1".repeat(130)],
    ["signer_account", "0x" + "2".repeat(40)], ["result_hash", "0x" + "3".repeat(64)], ["chain", "100"]]);
  const parsed = safeParseAction(ev);
  assert.ok(parsed.ok);
  if (!parsed.ok) return;
  const good = { readContract: async () => "0x1626ba7e", getTransactionReceipt: async () => null };
  const bad = { readContract: async () => "0xffffffff", getTransactionReceipt: async () => null };
  assert.equal(await verifyTallyConfirmation(parsed.value, good), true);
  assert.equal(await verifyTallyConfirmation(parsed.value, bad), false);
});

test("verifyPayoutTx matches token + amount in a Transfer log", async () => {
  const token = "0x420CA0f9B9b604cE0fd9C18EF134C705e5Fa3430";
  const amount = 5n * 10n ** 18n;
  const log = { address: token, topics: ["0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef", "0x0", "0x0"],
    data: "0x" + amount.toString(16).padStart(64, "0") };
  const client = { readContract: async () => null, getTransactionReceipt: async () => ({ status: "success" as const, logs: [log] }) };
  assert.equal(await verifyPayoutTx("0x" + "5".repeat(64), token, amount, client), true);
  assert.equal(await verifyPayoutTx("0x" + "5".repeat(64), token, amount + 1n, client), false);
});
```

- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** the four functions per the rules above in `vorhaben.ts` (keccak from `@noble/hashes/sha3` — already a protocol dependency; ABI-encode `isValidSignature(bytes32 hash, bytes sig)` by passing `abi` `[{ type: "function", name: "isValidSignature", stateMutability: "view", inputs: [{ name: "hash", type: "bytes32" }, { name: "signature", type: "bytes" }], outputs: [{ type: "bytes4" }] }]` and `args: [hash, signature]` to the injected client — the client does the encoding). Compare log addresses case-insensitively. Export from `index.ts`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `feat(protocol): replayVorhaben and tally/payout verifiers`.

---

### Task 3: Database — `nostr_outbox` and triggers

**Files:** Create `supabase/migrations/20261002_nostr_outbox.sql`.

**Interfaces — Produces:** table `public.nostr_outbox` with columns exactly:
`id bigserial PK, object_type text CHECK in ('proposal','task','tally','payout'), object_id uuid NOT NULL, proposal_id uuid NOT NULL, action text NOT NULL, from_status text, to_status text NOT NULL, actor_wallet text, actor_role text NOT NULL, body text, extra jsonb NOT NULL DEFAULT '{}', occurred_at timestamptz NOT NULL DEFAULT now(), signed_event jsonb, event_id text, published_at timestamptz, attempts int NOT NULL DEFAULT 0, last_error text`; index on `(published_at) WHERE published_at IS NULL` and on `(object_type, object_id, id)`. Plus `public.nostr_stage_ledger(proposal_id uuid, nsp12_stage text, event_id text, published_at timestamptz, PRIMARY KEY (proposal_id, nsp12_stage))` — records which NSP-12 transitions/notices were emitted (Task 5 uses it).

- [ ] **Step 1: Write the migration.**

```sql
-- NSP-13 Vorhaben record: an outbox the node publisher drains to Nostr.
-- Spec: docs/superpowers/specs/2026-10-02-nsp13-vorhaben-record-design.md §3.1
CREATE TABLE IF NOT EXISTS public.nostr_outbox (
  id            bigserial PRIMARY KEY,
  object_type   text NOT NULL CHECK (object_type IN ('proposal','task','tally','payout')),
  object_id     uuid NOT NULL,
  proposal_id   uuid NOT NULL,
  action        text NOT NULL,
  from_status   text,
  to_status     text NOT NULL,
  actor_wallet  text,
  actor_role    text NOT NULL,
  body          text,
  extra         jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at   timestamptz NOT NULL DEFAULT now(),
  signed_event  jsonb,
  event_id      text,
  published_at  timestamptz,
  attempts      integer NOT NULL DEFAULT 0,
  last_error    text
);
CREATE INDEX IF NOT EXISTS nostr_outbox_unpublished_idx ON public.nostr_outbox (id) WHERE published_at IS NULL;
CREATE INDEX IF NOT EXISTS nostr_outbox_object_idx ON public.nostr_outbox (object_type, object_id, id);

CREATE TABLE IF NOT EXISTS public.nostr_stage_ledger (
  proposal_id  uuid NOT NULL,
  nsp12_stage  text NOT NULL,
  event_id     text NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (proposal_id, nsp12_stage)
);

ALTER TABLE public.nostr_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nostr_stage_ledger ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.nostr_outbox, public.nostr_stage_ledger FROM anon, authenticated;
GRANT ALL ON public.nostr_outbox, public.nostr_stage_ledger TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.nostr_outbox_id_seq TO service_role;

-- task_activity → task actions (comments are never published)
CREATE OR REPLACE FUNCTION public.nostr_outbox_task_activity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_proposal uuid; v_action text; v_role text;
BEGIN
  IF NEW.kind = 'comment' THEN RETURN NEW; END IF;
  SELECT proposal_id INTO v_proposal FROM proposal_tasks WHERE id = NEW.task_id;
  IF v_proposal IS NULL THEN RETURN NEW; END IF;
  v_action := CASE
    WHEN NEW.kind = 'proof' THEN 'proof_added'
    WHEN NEW.to_status = 'vergeben' THEN 'task_assigned'
    WHEN NEW.to_status = 'in_arbeit' AND NEW.from_status = 'vergeben' THEN 'task_started'
    WHEN NEW.to_status = 'in_arbeit' AND NEW.from_status = 'eingereicht' THEN 'changes_requested'
    WHEN NEW.to_status = 'eingereicht' THEN 'task_submitted'
    WHEN NEW.to_status = 'abgenommen' THEN 'task_approved'
    WHEN NEW.to_status = 'abgebrochen' THEN 'task_cancelled'
    ELSE NULL END;
  IF v_action IS NULL THEN RETURN NEW; END IF;
  v_role := CASE
    WHEN NEW.actor_wallet = 'system' THEN 'system'
    WHEN v_action IN ('task_assigned') THEN 'proposer'
    WHEN v_action IN ('task_approved','changes_requested') THEN 'attester'
    WHEN v_action IN ('task_cancelled') THEN 'proposer'
    ELSE 'assignee' END;
  INSERT INTO nostr_outbox (object_type, object_id, proposal_id, action, from_status, to_status, actor_wallet, actor_role, body, extra, occurred_at)
  VALUES ('task', NEW.task_id, v_proposal, v_action, NEW.from_status, COALESCE(NEW.to_status, (SELECT status FROM proposal_tasks WHERE id = NEW.task_id)),
          NULLIF(lower(NEW.actor_wallet), 'system'), v_role, NEW.body, jsonb_build_object('attachments', NEW.attachments), NEW.created_at);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS nostr_outbox_task_activity ON public.task_activity;
CREATE TRIGGER nostr_outbox_task_activity AFTER INSERT ON public.task_activity FOR EACH ROW EXECUTE FUNCTION public.nostr_outbox_task_activity();

-- proposal_tasks → task_created / task_paid
CREATE OR REPLACE FUNCTION public.nostr_outbox_task() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO nostr_outbox (object_type, object_id, proposal_id, action, to_status, actor_wallet, actor_role, occurred_at)
    VALUES ('task', NEW.id, NEW.proposal_id, 'task_created', NEW.status, lower(NEW.created_by_wallet), 'proposer', NEW.created_at);
  ELSIF NEW.status = 'ausgezahlt' AND OLD.status IS DISTINCT FROM 'ausgezahlt' THEN
    INSERT INTO nostr_outbox (object_type, object_id, proposal_id, action, from_status, to_status, actor_role)
    VALUES ('task', NEW.id, NEW.proposal_id, 'task_paid', OLD.status, 'ausgezahlt', 'system');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS nostr_outbox_task ON public.proposal_tasks;
CREATE TRIGGER nostr_outbox_task AFTER INSERT OR UPDATE OF status ON public.proposal_tasks FOR EACH ROW EXECUTE FUNCTION public.nostr_outbox_task();

-- proposal_stage_events → stage_changed
CREATE OR REPLACE FUNCTION public.nostr_outbox_stage() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO nostr_outbox (object_type, object_id, proposal_id, action, from_status, to_status, actor_role, occurred_at)
  VALUES ('proposal', NEW.proposal_id, NEW.proposal_id, 'stage_changed', NEW.from_stage, NEW.to_stage, 'system', NEW.created_at);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS nostr_outbox_stage ON public.proposal_stage_events;
CREATE TRIGGER nostr_outbox_stage AFTER INSERT ON public.proposal_stage_events FOR EACH ROW EXECUTE FUNCTION public.nostr_outbox_stage();

-- proposal_wahlhelfer → tally_confirmed
CREATE OR REPLACE FUNCTION public.nostr_outbox_wahlhelfer() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.confirmed_at IS NOT NULL AND OLD.confirmed_at IS NULL THEN
    INSERT INTO nostr_outbox (object_type, object_id, proposal_id, action, to_status, actor_wallet, actor_role, extra, occurred_at)
    VALUES ('tally', NEW.proposal_id, NEW.proposal_id, 'tally_confirmed', 'bestaetigt', NEW.attester_wallet, 'wahlhelfer',
            jsonb_build_object('message', NEW.message, 'signature', NEW.signature, 'result_hash', NEW.result_hash,
                               'attester_wallet', NEW.attester_wallet, 'wahlhelfer_id', NEW.id),
            NEW.confirmed_at);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS nostr_outbox_wahlhelfer ON public.proposal_wahlhelfer;
CREATE TRIGGER nostr_outbox_wahlhelfer AFTER UPDATE OF confirmed_at ON public.proposal_wahlhelfer FOR EACH ROW EXECUTE FUNCTION public.nostr_outbox_wahlhelfer();

-- proposals → meinungsbild_published (window opened = tally on-chain)
CREATE OR REPLACE FUNCTION public.nostr_outbox_meinungsbild() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.tally_confirm_opened_at IS NOT NULL AND OLD.tally_confirm_opened_at IS NULL AND NEW.vorhaben_enabled THEN
    INSERT INTO nostr_outbox (object_type, object_id, proposal_id, action, to_status, actor_role, occurred_at)
    VALUES ('tally', NEW.id, NEW.id, 'meinungsbild_published', 'veroeffentlicht', 'system', NEW.tally_confirm_opened_at);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS nostr_outbox_meinungsbild ON public.proposals;
CREATE TRIGGER nostr_outbox_meinungsbild AFTER UPDATE OF tally_confirm_opened_at ON public.proposals FOR EACH ROW EXECUTE FUNCTION public.nostr_outbox_meinungsbild();

-- proposal_payout_lines → payout_* (only published states; sendend/gesendet skipped)
CREATE OR REPLACE FUNCTION public.nostr_outbox_payout() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_action text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'payout_planned';
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    v_action := CASE NEW.status WHEN 'vorgeschlagen' THEN 'payout_proposed' WHEN 'bestaetigt' THEN 'payout_confirmed'
      WHEN 'fehlgeschlagen' THEN 'payout_failed' WHEN 'unklar' THEN 'payout_unclear' ELSE NULL END;
  END IF;
  IF v_action IS NULL THEN RETURN NEW; END IF;
  INSERT INTO nostr_outbox (object_type, object_id, proposal_id, action, from_status, to_status, actor_role, extra)
  VALUES ('payout', NEW.id, NEW.proposal_id, v_action, CASE WHEN TG_OP = 'UPDATE' THEN OLD.status END, NEW.status, 'system',
          jsonb_strip_nulls(jsonb_build_object('tx', NEW.tx_hash, 'safe_tx', NEW.safe_tx_hash)));
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS nostr_outbox_payout ON public.proposal_payout_lines;
CREATE TRIGGER nostr_outbox_payout AFTER INSERT OR UPDATE OF status ON public.proposal_payout_lines FOR EACH ROW EXECUTE FUNCTION public.nostr_outbox_payout();

REVOKE ALL ON FUNCTION public.nostr_outbox_task_activity(), public.nostr_outbox_task(), public.nostr_outbox_stage(),
  public.nostr_outbox_wahlhelfer(), public.nostr_outbox_meinungsbild(), public.nostr_outbox_payout() FROM PUBLIC, anon, authenticated;

-- Backfill: proposals already in the vorhaben system get their tasks/lines/confirmations as first actions.
INSERT INTO public.nostr_outbox (object_type, object_id, proposal_id, action, to_status, actor_wallet, actor_role, occurred_at)
SELECT 'task', t.id, t.proposal_id, 'task_created', t.status, lower(t.created_by_wallet), 'proposer', t.created_at
FROM public.proposal_tasks t
WHERE NOT EXISTS (SELECT 1 FROM public.nostr_outbox o WHERE o.object_type = 'task' AND o.object_id = t.id);

NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 2: Hand the file to Max** (controller): ask him to paste it into the Supabase SQL editor for project `wwbeqhkslxdxhktqzqti`.
- [ ] **Step 3: Verify read-only** with `execute_sql` after he confirms:

```sql
select count(*) filter (where action='task_created') as created, count(*) as total from nostr_outbox;
select tgname from pg_trigger where tgname like 'nostr_outbox_%' order by 1;
select has_table_privilege('anon','public.nostr_outbox','select') as anon_can_read;
```
Expected: `created` = number of existing tasks (1 today); 6 triggers; `anon_can_read = false`.

Then ask Max to run this check in the SQL editor (it writes in a rolled-back transaction):

```sql
begin;
insert into task_activity (task_id, actor_wallet, kind, body) select id, 'system', 'comment', 'x' from proposal_tasks limit 1;
update proposal_payout_lines set status = status where false;
select count(*) as comment_rows from nostr_outbox where body = 'x';   -- expect 0
rollback;
```
- [ ] **Step 4: Commit** the migration file — `feat(db): nostr_outbox and Vorhaben triggers for the public record`.

---

### Task 4: Publisher mappers (pure)

**Files:** Create `packages/publisher/src/vorhaben.ts`, `packages/publisher/test/vorhaben.test.ts`; modify `src/mappers.ts` (`proposalToSpec` optional vorhaben tags), `src/index.ts`.

**Interfaces — Consumes:** Task 1 exports from `@netizen-labs/protocol`. **Produces:**
```ts
export interface OutboxRow { id: number; object_type: "proposal"|"task"|"tally"|"payout"; object_id: string; proposal_id: string;
  action: string; from_status: string|null; to_status: string; actor_wallet: string|null; actor_role: string; body: string|null;
  extra: Record<string, unknown>; occurred_at: string; signed_event: unknown|null; event_id: string|null; published_at: string|null; attempts: number; }
export interface VorhabenContext { townPubkey: string; proposalKey: string /* proposals.proposal_id */; actorPubkey: string | null; prior: string | null; now: number; }
export function actionToSpec(row: OutboxRow, ctx: VorhabenContext): PublishSpec | null;
export function taskToSpec(task: Row, proposalKey: string, townPubkey: string, assigneePubkey: string|null, creatorPubkey: string|null): PublishSpec | null;
export function contractToSpec(contract: Row, proposalKey: string, townPubkey: string, lineIds: string[], totals: Array<[string, string]>): PublishSpec | null;
export function payoutLineToSpec(line: Row, proposalKey: string, townPubkey: string, recipientPubkey: string|null): PublishSpec | null;
export function buergervotumToSpec(proposal: Row, townPubkey: string): PublishSpec | null;   // 32104
export function kasseNoticeToSpec(proposal: Row, kind: KasseNotice, txs: string[], now: number): PublishSpec;  // 32102
export function proposalVorhabenTags(proposal: Row, townPubkey: string, taskIds: string[]): string[][];  // appended in proposalToSpec when present
```
`actionToSpec` rules: object address by type (`task` → `taskAddress(townPubkey, object_id)`, `payout` → `payoutLineAddress`, `tally` → `pollAddress(townPubkey, proposalKey)`, `proposal` → head). Tags exactly per spec §2.2 + Global Constraints; `p` only when `actorPubkey`; `prior` only when given; `proof_added` gets `["url", url, type]` for image/pdf attachments and `["tx", hash]` for tx attachments from `extra.attachments`; `tally_confirmed` gets `signed_text`(=extra.message), `signature`, `signer_account`(=extra.attester_wallet), `result_hash`, `["chain","100"]`; payout actions get `tx`/`safe_tx` from extra. `kind` 2101, `d` "", `createdAt` = `ctx.now`, `content` = `row.body ?? ""`, scope TOWN_SCOPE. Returns null (and the caller logs) when a required field is missing. For `stage_changed`, `to` is the lifecycle stage. German content defaults: `meinungsbild_published` → `"Das Bürgervotum ist ausgezählt und veröffentlicht."`; `tally_confirmed` → `"Wahlhelfer:in bestätigt das Bürgervotum."`.

`buergervotumToSpec`: kind 32104, d `poll:<proposal_id>`, tags `["advisory","true"]`, head `a` tag, `for`/`against`/`abstain` from `for_votes`/`against_votes`/`abstain_votes`, `tally_contract` = `tally_address`, `["chain","100"]`; content `"Bürgervotum zu Vorschlag #N: X Ja, Y Nein, Z Enthaltung. Das Bürgervotum ist eine Abstimmung der Bürger:innen in der Röbel-App."`; createdAt = `unixFromUpdatedAt`-style from `tally_confirm_opened_at`. Returns null without `tally_confirm_opened_at`.

`kasseNoticeToSpec`: kind 32102, d `kasseNoticeD(proposal_id, kind)`, scope town, tags `["d",…]`, `["t","gemeinschaftskasse"]`, head a-tag, `["tx",h]` per tx; content by kind:
- beschluss: `"Bürgervotum positiv: Die Gemeinschaftskasse setzt Vorschlag #N „Titel“ aus ihren eigenen Mitteln um. Dies ist keine Entscheidung der Stadt Röbel/Müritz."`
- ablehnung: `"Bürgervotum negativ: Die Gemeinschaftskasse setzt Vorschlag #N „Titel“ nicht um. Dies ist keine Entscheidung der Stadt Röbel/Müritz."`
- ausgefuehrt: `"Die Gemeinschaftskasse hat Vorschlag #N „Titel“ umgesetzt. Alle Auszahlungen sind auf der Blockchain belegt."`

- [ ] **Step 1: Write failing tests** `packages/publisher/test/vorhaben.test.ts` covering, with concrete fixtures (copy the style of `test/mappers.test.ts`):
  1. `actionToSpec` for `task_assigned` with an actor pubkey → exact tag list `[["a",taskAddress(PK,"t1"),"","object"],["a",`32100:${PK}:proposal:0xabc`,"","proposal"],["action","task_assigned"],["from","offen"],["to","vergeben"],["p",ACTOR,"","proposer"],["role","proposer"],["occurred_at","<unix of occurred_at>"]]`, `kind` 2101, `createdAt` = ctx.now, and the spec passes `safeParseAction` after signing-shape conversion (build `{kind,tags,content,created_at:createdAt}`).
  2. Same row with `actorPubkey: null` → no `p` tag, role still present, and no tag value anywhere matches `/^0x[0-9a-fA-F]{40}$/`.
  3. `proof_added` with `extra.attachments = [{type:"image",url:"https://…/a.jpg"},{type:"tx",hash:"0x…"}]` → `["url","https://…/a.jpg","image"]` and `["tx","0x…"]`.
  4. `tally_confirmed` → carries `signed_text`, `signature`, `signer_account`, `result_hash`, `["chain","100"]`; content `"Wahlhelfer:in bestätigt das Bürgervotum."`.
  5. `taskToSpec` → d `task:t1`, criteria in order, reward, status, assignee `p` with role `assignee`; passes `safeParseTask`.
  6. `payoutLineToSpec` for a `wahlhelfer` line with recipient pubkey → `p` recipient, NO `recipient_label`; for `empfaenger` → `recipient_label` = beneficiary name, no `p`; for a line in status `sendend` → returns null (unpublished state); passes `safeParsePayoutLine`.
  7. `contractToSpec` → passes `safeParseContract`, one `line` a-tag per line id, `total` tags.
  8. `buergervotumToSpec` → d `poll:0xabc`, advisory true, passes `safeParseMeinungsbild`; content contains "Bürgervotum" and never "Meinungsbild" or "Bürgerentscheid".
  9. `kasseNoticeToSpec` beschluss → content contains "Gemeinschaftskasse" and "keine Entscheidung der Stadt"; d `gemeinschaftskasse:0xabc:beschluss`.
  10. `proposalToSpec` with vorhaben fields → contains `["stage","beschlossen"]` for `lifecycle_stage='in_umsetzung'`, `["vorhaben","in_umsetzung"]`, `["proposal_uuid",…]`, `["budget","150","EURe"]`, contract + task `a` tags; without `vorhaben_enabled` → identical to today's output (regression).
- [ ] **Step 2: Run** `cd packages/publisher && pnpm test` → FAIL.
- [ ] **Step 3: Implement** `src/vorhaben.ts` per the interfaces/rules above, reusing `str()`/`unixFromUpdatedAt` from `mappers.ts` (export them from mappers if needed) and `TOWN_SCOPE`. In `proposalToSpec`, when `row.vorhaben_enabled === true`, append `proposalVorhabenTags(row, townPubkey, taskIds)` — `proposalToSpec` gains an optional third parameter `vorhaben?: { townPubkey: string; taskIds: string[] }`. Export the new mappers from `src/index.ts`.
- [ ] **Step 4: Run** → PASS (incl. all old mapper tests).
- [ ] **Step 5: Commit** — `feat(publisher): NSP-13 Vorhaben mappers`.

---

### Task 5: Publisher — outbox drain, NSP-12 transitions, state rebuild, CLI wiring

**Files:** Create `packages/publisher/src/outbox.ts`, `packages/publisher/test/outbox.test.ts`; modify `src/sync.ts` (dataset `vorhaben`, `PublisherDeps.updateRow`, state rebuild in `buildSpecs`), `src/cli.ts` (`VALID_DATASETS`, error message, pass `updateRow`), `src/index.ts`.

**Interfaces — Consumes:** Task 4 mappers; `signSpec`, `deriveOrgIdentity`, `RelayClient`. **Produces:**
```ts
export interface OutboxDeps {
  fetchRows: (table: string, query: string) => Promise<Record<string, unknown>[]>;
  updateRow: (table: string, query: string, body: Record<string, unknown>) => Promise<void>;
  insertRow: (table: string, body: Record<string, unknown>) => Promise<Record<string, unknown>>;
  publish: (event: NostrEvent) => Promise<{ ok: boolean; message: string }>;
  sign: (spec: PublishSpec) => NostrEvent;      // signSpec bound to node secret/id
  townPubkey: string;
  now: () => number;                             // unix seconds
  log: (m: string) => void;
}
export interface DrainSummary { published: number; failed: number; waiting: number; transitions: number }
export async function drainOutbox(deps: OutboxDeps, batch?: number): Promise<DrainSummary>;
```
`drainOutbox` algorithm:
1. `fetchRows("nostr_outbox", "select=*&published_at=is.null&order=id.asc&limit=" + (batch ?? 200))`.
2. Load `proposals` (`select=id,proposal_id,proposal_number,title,lifecycle_stage,tally_confirm_opened_at&id=in.(…)`) for the batch's proposal ids; and `nostr_identities` (`select=wallet_address,pubkey_hex&revoked_at=is.null&wallet_address=in.(…)` — lowercase the wallets; also try the checksum form is unnecessary because the table stores what the app wrote — compare case-insensitively by lowercasing both sides after fetching with `wallet_address=ilike.<w>` per wallet if `in.` misses; keep it simple: fetch all identities for the batch's wallets with `or=(wallet_address.ilike.<w1>,…)` chunked at 50).
3. Process rows in id order. Keep `blocked = Set<"type:id">`: if a row's object is blocked (an earlier row on it failed or is unpublished in this batch), increment `waiting` and skip.
4. For a row without `signed_event`: `prior` = `event_id` of the latest **published** row for the same object (`fetchRows("nostr_outbox", "select=event_id&object_type=eq.X&object_id=eq.Y&published_at=not.is.null&order=id.desc&limit=1")`); build spec with `actionToSpec`; if null → `updateRow` `last_error='unmappable'`, `attempts+1`, block object, continue. Sign with `deps.sign(spec)`, then **`updateRow("nostr_outbox","id=eq.N",{ signed_event: ev, event_id: ev.id })` before publishing**.
5. Publish `signed_event` (stored or fresh). OK (incl. duplicate) → `updateRow published_at=now`; not OK → `attempts+1`, `last_error=message`, block object, `failed++`; from `attempts >= 10` log `ALARM nostr_outbox <id> …`.
6. For `stage_changed` rows that published OK: compute `target = nsp12StageFor(to_status)`; read `nostr_stage_ledger` for the proposal; the current NSP-12 stage = highest of `meinungsbild` + ledger stages along the path; for each hop in `nsp12TransitionsBetween(current, target)` not yet in the ledger: if the hop has a `notice`, publish `kasseNoticeToSpec(...)` first, then the 2100 via `transitionToSpec({ scope: TOWN_SCOPE, proposalId: proposal_id, headPubkey: townPubkey, from, to, reason, noticeAddress, at: now })`; on OK insert ledger row `{proposal_id, nsp12_stage: hop.to, event_id}`; on failure stop (next pass retries — the ledger makes it exactly-once). When target is `umgesetzt`, also publish `kasseNoticeToSpec(..., "ausgefuehrt", txs)` with the tx hashes of all `bestaetigt` lines of the proposal (`fetchRows("proposal_payout_lines","select=tx_hash&proposal_id=eq.X&status=eq.bestaetigt")`).

State rebuild (in `buildSpecs`, dataset `vorhaben`, stateless like the others): for proposals with `vorhaben_enabled=is.true` → `buergervotumToSpec` (when published), tasks (`proposal_tasks`) → `taskToSpec`, contracts + lines (`proposal_contracts`, `proposal_payout_lines` with `status=in.(geplant,vorgeschlagen,bestaetigt,fehlgeschlagen,unklar)`) → `contractToSpec`/`payoutLineToSpec`, and the `proposals` dataset passes `vorhaben` context so heads get the extra tags. Pubkeys for assignees/recipients via the same identity lookup (a helper `resolvePubkeys(fetchRows, wallets) → Map<lowercase wallet, pubkey_hex>` in `outbox.ts`, exported and reused).

`publishOnce`: when `datasets.includes("vorhaben")` and `deps.updateRow` + `deps.insertRow` exist, run `drainOutbox` **after** publishing the state specs, reusing the same relay client (`publish: (e) => client.publish(e)`), `sign: (s) => signSpec(s, identities, nodeSecret, nodeId)`, `townPubkey = deriveOrgIdentity(nodeSecret, nodeId, TOWN_SCOPE).publicKey`. Drain failures are logged; they never fail the pass.

`cli.ts`: add `"vorhaben"` to `VALID_DATASETS` + the line-43 message; pass the existing `updateRow` and `insertRow` closures into `publishOnce` deps (add both as optional fields on `PublisherDeps`).

- [ ] **Step 1: Write failing tests** `test/outbox.test.ts` with an in-memory fake for `fetchRows`/`updateRow`/`insertRow` (tables as arrays; implement the handful of PostgREST filters the drain uses: `eq.`, `is.null`, `not.is.null`, `in.(…)`, `order=id.asc|desc`, `limit`) and a fake `publish` that can be told to fail for specific event ids. Tests:
  1. **Sign once, store first:** first pass with `publish` failing → row has `signed_event` + `event_id`, `published_at` null, `attempts` 1; second pass with `publish` OK → the published event id equals the stored `event_id` (no re-sign; `sign` called exactly once across both passes).
  2. **Per-object order:** two rows on task t1 (ids 1, 2); `publish` fails for row 1 → row 2 is not signed (`waiting` = 1); next pass both publish and row 2's `prior` = row 1's `event_id`.
  3. **Other objects not blocked:** a failing row on t1 does not stop a row on t2.
  4. **Actor without identity:** row with `actor_wallet` not in `nostr_identities` → published event has no `p` tag.
  5. **Revoked identity ignored:** identity with `revoked_at` set → no `p` tag (the fake honours `revoked_at=is.null`).
  6. **Transition ledger, exactly once and legal:** a `stage_changed` row `to_status='in_umsetzung'` → publishes notice `beschluss`, then 2100 `meinungsbild→beschlussvorlage`, then `beschlussvorlage→beschlossen` (with notice a-tag); ledger gets 2 rows. A second `stage_changed` `to='umgesetzt'` → only `beschlossen→umgesetzt` + `ausgefuehrt` notice. Re-running the drain publishes no further transitions.
  7. **Alarm:** a row at `attempts = 9` that fails again → log line contains `ALARM`.
- [ ] **Step 2: Run** `cd packages/publisher && pnpm test` → FAIL.
- [ ] **Step 3: Implement** `outbox.ts`, the `sync.ts` changes and the CLI wiring as specified.
- [ ] **Step 4: Run** → PASS (all publisher tests). Also `cd packages/record-client && pnpm test` (it imports publisher mappers for parity) → PASS.
- [ ] **Step 5: Commit** — `feat(publisher): drain the Vorhaben outbox to Nostr with NSP-12 transitions`.

---

### Task 6: Index `a`-tag filter + record-client readers

**Files:** Modify `packages/indexer/src/query.ts` (EventQuery `aTags` + `tagContain("a", …)`), `packages/indexer/src/api.ts` (`aTags: strings(p.get("a"))`), indexer test for the query builder; `packages/record-client/src/client.ts` (`EventFilters.a` → `list("a", filters.a)`), create `packages/record-client/src/vorhaben.ts`, modify `src/index.ts`, create `test/vorhaben.test.ts`.

**Interfaces — Produces (record-client):**
```ts
export interface VorhabenTaskRow { id: string; proposal_address: string; title: string; description: string; status: string;
  reward_amount: string; reward_asset: string; deadline: string | null; criteria: { id: string; text: string }[];
  assignee_pubkey: string | null; }
export interface VorhabenLineRow { id: string; role: string; amount: string; asset: string; rail: string; status: string;
  recipient_pubkey: string | null; recipient_label: string | null; tx: string | null; for_address: string; }
export interface VorhabenActionRow { id: string; action: string; from: string | null; to: string; role: string;
  actor_pubkey: string | null; prior: string | null; occurred_at: string; content: string; tags: string[][]; }
export async function listTasks(client: RecordClient, proposalAddress: string): Promise<VorhabenTaskRow[]>;   // kinds [32108], a=[proposalAddress]
export async function getContractLines(client: RecordClient, contractAddress: string): Promise<VorhabenLineRow[]>; // kinds [32111], a=[contractAddress]
export async function getActions(client: RecordClient, objectAddress: string): Promise<VorhabenActionRow[]>;   // kinds [2101], a=[objectAddress], sorted by prior chain
```
Indexer: the stored `tags` JSONB containment `[["a", addr]]` matches 4-element `["a", addr, "", role]` tags (jsonb array containment is subset-based) — add a test asserting the built SQL contains the `a` containment clause and binds `[["a","<addr>"]]`.

- [ ] **Step 1: Failing tests:**
  - indexer: `buildEventsQuery({ aTags: ["32108:…:task:t1"] })` (use the actual builder function name from `query.ts`) → `text` includes `tags @> ANY(` and `values` includes `[["a","32108:…:task:t1"]]`; `queryFromUrl(new URL("http://x/events?a=32108:abc:task:t1"))` → `aTags: ["32108:abc:task:t1"]`.
  - record-client: parity round-trip like `test/civic.test.ts` — build specs with the Task 4 mappers, convert with `asRecordEvent`, feed `clientFor([...])`; assert `listTasks` returns criteria in order and the assignee pubkey; `getContractLines` returns the `wahlhelfer` line without a label and the `empfaenger` line with its label; `getActions` returns actions in `prior` order for a shuffled input. Extend the fake client in `test/helpers.ts` to honour the `a` filter (match any tag `t[0]==="a" && t[1]===value`).
- [ ] **Step 2: Run** `cd packages/indexer && pnpm test` and `cd packages/record-client && pnpm test` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `feat(indexer,record-client): a-tag filter and Vorhaben readers`.

---

### Task 7: Copy — "Bürgerabstimmung" / "Bürgervotum"

**Files:** `apps/expo/lib/forum-stages.ts:8`, `apps/expo/lib/vorhaben-labels.ts:9`, `apps/web/src/lib/chat/harness/tenants.ts:21`, `apps/web/src/lib/chat/harness/packs/roebel-read.ts:339`, `apps/web/src/lib/chat/inspiration/catalog.ts:210-215,803-808`, plus any test asserting the old strings (`grep -rn "Meinungsbild" apps/expo/lib/__tests__ apps/web/tests`).

Changes (user-facing text only; identifiers like `meinungsbild` stay):
- `forum-stages.ts`: `meinungsbild: 'Bürgervotum'`.
- `vorhaben-labels.ts`: `abstimmung: 'Bürgerabstimmung'`.
- `tenants.ts` / `roebel-read.ts`: "Abstimmungen in der App sind ein Bürgervotum der Bürgerschaft, keine rechtsverbindlichen Beschlüsse der Stadt." (keep the non-binding clause verbatim otherwise).
- `catalog.ts`: "Offenes Bürgervotum neutral erklären", pitch "Fasst eine laufende Bürgerabstimmung mit Pro und Contra zusammen …", prompt "Erklär mir die aktuell offene Bürgerabstimmung in Röbel neutral: …"; "Bürgerabstimmung zu einem Ortsthema aufsetzen" and in its pitch/prompt replace "Meinungsbild" with "Bürgerabstimmung".

- [ ] **Step 1:** Update any test expectations first, run `cd apps/expo && npx jest --no-watchman lib/__tests__/forum-stages.test.ts lib/__tests__/vorhaben-labels.test.ts` and `pnpm test:web` → FAIL where expectations changed.
- [ ] **Step 2:** Edit the strings.
- [ ] **Step 3:** Re-run → PASS; `grep -rn "Meinungsbild" apps/expo/app apps/expo/components apps/expo/lib apps/web/src | grep -v __tests__` → only code identifiers/comments remain (no user-facing strings); `grep -rn "Bürgerentscheid" apps packages` → nothing.
- [ ] **Step 4: Commit** — `fix(expo,web): Bürgerabstimmung / Bürgervotum instead of Meinungsbild in user copy`.

---

### Task 8: Rollout (controller + Max)

- [ ] **Step 1:** Build the artifacts: `pnpm --filter @netizen-labs/publisher build` and `pnpm --filter @netizen-labs/indexer build` (check the indexer's build script name in its package.json). Confirm `packages/publisher/dist/publisher.cjs` exists and `grep -c "nostr_outbox" packages/publisher/dist/publisher.cjs` ≥ 1.
- [ ] **Step 2: Handover to Max** (operator-run; never from a subagent). Exact commands from `docs/RELAY_NODE_REBUILD.md`, run from **this repo (DAO_test) on main**:
```bash
cd packages/cli
node_modules/.bin/tsx src/cli.ts doctor /Users/maxbrych/Documents/privat/side_projects/DAO_test/packages/protocol/examples/roebel.netizen.json
node_modules/.bin/tsx src/cli.ts up /Users/maxbrych/Documents/privat/side_projects/DAO_test/packages/protocol/examples/roebel.netizen.json --host root@<node-ip> --identity ~/.ssh/id_ed25519
```
Before running: `doctor` must be green, and Max confirms the node IP (CX23 `roebel-relay`, see memory) — `up` rsyncs with `--delete`.
- [ ] **Step 3: Live verification (controller, read-only):**
  - Wait one publisher pass (≤ 5 min), then `select count(*) filter (where published_at is not null), count(*) from nostr_outbox;` → all published, `max(attempts)` < 10.
  - `curl -s "https://index.roebel.app/events?kinds=32108&limit=5"` → the #3 task; `curl -s "https://index.roebel.app/events?kinds=2101&limit=20"` → the `task_created` action; `curl -s "https://index.roebel.app/events?kinds=32100&d=proposal:0x8be2…6fe7"` → head with `stage`/`vorhaben` tags.
  - Run `replayVorhaben` over the fetched 2101s (tiny `npx tsx -e` script in the scratchpad) and compare the task status with Supabase `proposal_tasks.status`.
- [ ] **Step 4:** Update memory (`project_proposal_tasks_payouts.md` → NSP-13 live) and report to Max.
