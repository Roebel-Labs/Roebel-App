import assert from "node:assert/strict";
import { test } from "node:test";
import { syncProposal, type SyncDeps } from "../src/lib/vorhaben/sync";
import type { ProposalRow } from "../src/lib/vorhaben/repo";
import type { ContractReader } from "../src/lib/vorhaben/chain";

type Op = { table: string; op: string; payload?: unknown };

function recordingDb(seed: Record<string, unknown[]>) {
  const ops: Op[] = [];
  const chain = (table: string, op: string, payload?: unknown) => {
    ops.push({ table, op, payload });
    const result = { data: seed[table] ?? [], error: null };
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
