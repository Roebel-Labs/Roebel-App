import assert from "node:assert/strict";
import { test } from "node:test";
import { syncProposal, type SyncDeps } from "../src/lib/vorhaben/sync";
import type { ProposalRow } from "../src/lib/vorhaben/repo";
import type { ContractReader } from "../src/lib/vorhaben/chain";

type Op = { table: string; op: string; payload?: unknown };

function recordingDb(seed: Record<string, unknown[]>, errors: Record<string, string> = {}) {
  const ops: Op[] = [];
  const chain = (table: string, op: string, payload?: unknown) => {
    ops.push({ table, op, payload });
    const result = { data: seed[table] ?? [], error: errors[`${table}:${op}`] ? { message: errors[`${table}:${op}`] } : null };
    const self: Record<string, unknown> = {
      eq: () => self, neq: () => self, in: () => self, is: () => self, order: () => self, lt: () => self,
      select: () => self,
      single: async () => ({ data: (seed[table] ?? [])[0] ?? null, error: null }),
      maybeSingle: async () => ({ data: (seed[table] ?? [])[0] ?? null, error: null }),
      then: (res: (v: unknown) => unknown) => res(result),
    };
    return self;
  };
  return {
    ops,
    from: (table: string) => ({
      select: () => chain(table, "select"),
      update: (p: unknown) => chain(table, "update", p),
      insert: (p: unknown) => chain(table, "insert", p),
      upsert: (p: unknown) => chain(table, "upsert", p),
    }),
  };
}

const settings = { platformFeeBps: 500, platformSafe: "0xbcabbaa26420e0a4771808f9639d4176355e5d4b", wahlhelferAsset: "MUENZEN" as const,
  wahlhelferAmount: "10", budgetFeeRail: "funder_xdai" as const, windowDays: 7, dispatchEnabled: false };

const proposal: ProposalRow = { id: "p1", proposal_id: "0xkey", proposal_number: 3, title: "Spende", proposer_address: "0xprop",
  blockchain_proposal_id: "42", vorhaben_enabled: true, budget_amount: "150", budget_asset: "EURe", beneficiary_name: "Seglerverein",
  lifecycle_stage: "abstimmung", tally_confirm_opened_at: null, tally_confirm_until: null, tally_address: null };

const reader = (state: number, published: boolean): ContractReader => ({
  readContract: async ({ functionName }) => ({
    state, proposalDeadline: 100n, proposalPolls: [1n, "0x1", "0x2", "0x00000000000000000000000000000000000000aa", 100n],
    totalTallyResults: published ? 3n : 0n, tallyResults: [5n, true],
  } as Record<string, unknown>)[functionName],
});

test("a proposal without vorhaben_enabled is never touched", async () => {
  const db = recordingDb({});
  const r = await syncProposal({ db: db as never, reader: reader(4, true), settings, nowMs: () => 200_000, listAttesters: async () => ["0xa"] },
    { ...proposal, vorhaben_enabled: false });
  assert.equal(r, null);
  assert.equal(db.ops.length, 0);
});

test("published tally opens the window once and snapshots Attesters", async () => {
  const db = recordingDb({ proposal_contracts: [{ id: "c1", platform_fee_bps: 500, platform_safe_address: settings.platformSafe }] });
  const r = await syncProposal({ db: db as never, reader: reader(4, true), settings, nowMs: () => 200_000, listAttesters: async () => ["0xa", "0xb"] }, proposal);
  assert.ok(r);
  assert.equal(r!.openedWindow, true);
  const wahl = db.ops.find((o) => o.table === "proposal_wahlhelfer" && o.op === "upsert");
  assert.deepEqual((wahl!.payload as { attester_wallet: string }[]).map((x) => x.attester_wallet), ["0xa", "0xb"]);
  assert.equal(db.ops.filter((o) => o.table === "notifications" && o.op === "insert").length, 1);
  // accepted with budget → budget lines planned
  const lines = db.ops.find((o) => o.table === "proposal_payout_lines" && o.op === "upsert");
  assert.ok(lines, "budget lines inserted");
});

test("window already open → no second snapshot", async () => {
  const db = recordingDb({ proposal_contracts: [{ id: "c1", platform_fee_bps: 500, platform_safe_address: settings.platformSafe }] });
  await syncProposal({ db: db as never, reader: reader(4, true), settings, nowMs: () => 200_000, listAttesters: async () => ["0xa"] },
    { ...proposal, tally_confirm_opened_at: new Date(199_000).toISOString(), tally_confirm_until: new Date(199_000 + 7 * 86400_000).toISOString() });
  assert.equal(db.ops.filter((o) => o.table === "proposal_wahlhelfer" && o.op === "upsert").length, 0);
});

test("still voting → no window, no lines", async () => {
  const db = recordingDb({ proposal_contracts: [{ id: "c1", platform_fee_bps: 500, platform_safe_address: settings.platformSafe }] });
  const r = await syncProposal({ db: db as never, reader: reader(1, false), settings, nowMs: () => 50_000, listAttesters: async () => ["0xa"] }, proposal);
  assert.equal(r!.stage, "abstimmung");
  assert.equal(db.ops.filter((o) => o.table === "proposal_payout_lines" && o.op !== "select").length, 0);
});

test("listAttesters failure → window not opened, nothing snapshotted, error propagates", async () => {
  const db = recordingDb({ proposal_contracts: [{ id: "c1", platform_fee_bps: 500, platform_safe_address: settings.platformSafe }] });
  await assert.rejects(
    syncProposal({ db: db as never, reader: reader(4, true), settings, nowMs: () => 200_000,
      listAttesters: async () => { throw new Error("attester scan incomplete"); } }, proposal),
    /attester scan incomplete/,
  );
  const opened = db.ops.filter((o) => o.table === "proposals" && o.op === "update"
    && "tally_confirm_opened_at" in (o.payload as object));
  assert.equal(opened.length, 0);
  assert.equal(db.ops.filter((o) => o.table === "proposal_wahlhelfer").length, 0);
});

const contracts = { proposal_contracts: [{ id: "c1", platform_fee_bps: 500, platform_safe_address: settings.platformSafe }] };
const mk = (db: ReturnType<typeof recordingDb>, state = 4, published = true, nowMs = 200_000): SyncDeps =>
  ({ db: db as never, reader: reader(state, published), settings, nowMs: () => nowMs, listAttesters: async () => ["0xa"] });
const notified = (db: ReturnType<typeof recordingDb>) => db.ops.filter((o) => o.table === "notifications").length;

test("wahlhelfer upsert error → no window update, no notify", async () => {
  const db = recordingDb(contracts, { "proposal_wahlhelfer:upsert": "boom" });
  await assert.rejects(syncProposal(mk(db), proposal), /boom/);
  assert.equal(db.ops.filter((o) => o.table === "proposals" && JSON.stringify(o.payload).includes("tally_confirm_opened_at")).length, 0);
  assert.equal(notified(db), 0);
});

test("window update error → no notify", async () => {
  const db = recordingDb(contracts, { "proposals:update": "boom" });
  await assert.rejects(syncProposal(mk(db), proposal), /boom/);
  assert.equal(notified(db), 0);
});

test("stage update error → no stage event", async () => {
  const db = recordingDb(contracts);
  const orig = db.from;
  // fail only the lifecycle_stage update
  db.from = (table: string) => {
    const t = orig(table);
    return { ...t, update: (p: unknown) => (table === "proposals" && "lifecycle_stage" in (p as object)
      ? (() => { db.ops.push({ table, op: "update", payload: p }); return { eq: async () => ({ error: { message: "stagefail" } }) }; })()
      : t.update(p)) };
  };
  await assert.rejects(syncProposal(mk(db, 1, false, 50_000), { ...proposal, lifecycle_stage: "vorschlag" as never }), /stagefail/);
  assert.equal(db.ops.filter((o) => o.table === "proposal_stage_events").length, 0);
});

test("lines read error → no stage write", async () => {
  const db = recordingDb(contracts, { "proposal_payout_lines:select": "readfail" });
  await assert.rejects(syncProposal(mk(db, 1, false, 50_000), { ...proposal, lifecycle_stage: "vorschlag" as never }), /readfail/);
  assert.equal(db.ops.filter((o) => o.table === "proposal_stage_events" || (o.table === "proposals" && JSON.stringify(o.payload).includes("lifecycle_stage"))).length, 0);
});

test("reminder mark error → no notify", async () => {
  const db = recordingDb({ ...contracts, proposal_wahlhelfer: [{ id: "w1", attester_wallet: "0xa" }] }, { "proposal_wahlhelfer:update": "markfail" });
  const opened = 200_000 - 4 * 86400_000;
  await assert.rejects(syncProposal(mk(db), { ...proposal, tally_confirm_opened_at: new Date(opened).toISOString(),
    tally_confirm_until: new Date(opened + 7 * 86400_000).toISOString() }), /markfail/);
  assert.equal(notified(db), 0);
});

const upserted = (db: ReturnType<typeof recordingDb>) => db.ops
  .filter((o) => o.table === "proposal_payout_lines" && o.op === "upsert")
  .flatMap((o) => o.payload as { role: string; reference_type: string; amount: string; rail: string }[]);

test("accepted budget: sync plans only the empfaenger line, never the fee before the transfer is confirmed", async () => {
  const db = recordingDb(contracts);
  await syncProposal(mk(db), proposal);
  const lines = upserted(db);
  assert.deepEqual(lines.map((l) => l.role), ["empfaenger"]);
});

test("accepted budget already confirmed but fee line missing: sync backfills the fee (idempotent upsert)", async () => {
  const db = recordingDb({ ...contracts, proposal_payout_lines: [{ role: "empfaenger", status: "bestaetigt", reference_type: "proposal" }] });
  await syncProposal(mk(db), proposal);
  const fee = upserted(db).filter((l) => l.role === "plattform");
  assert.equal(fee.length, 1);
  assert.equal(fee[0].reference_type, "proposal");
  assert.equal(fee[0].amount, "7.5");
  assert.equal(fee[0].rail, "funder_xdai");
});

test("budget fee already planned: sync does not add another", async () => {
  const db = recordingDb({ ...contracts, proposal_payout_lines: [
    { role: "empfaenger", status: "bestaetigt", reference_type: "proposal" },
    { role: "plattform", status: "geplant", reference_type: "proposal" },
  ] });
  await syncProposal(mk(db), proposal);
  assert.equal(upserted(db).filter((l) => l.role === "plattform").length, 0);
});
