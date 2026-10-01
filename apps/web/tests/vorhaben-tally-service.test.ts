import assert from "node:assert/strict";
import { test } from "node:test";
import { submitTallyConfirmation, type TallyDeps } from "../src/lib/vorhaben/tally-service";
import type { ContractReader } from "../src/lib/vorhaben/chain";

const NOW = 2_000_000_000;
const proposalRow = { id: "p1", proposal_id: "0xkey", proposal_number: 3, title: "Spende", proposer_address: "0xprop",
  blockchain_proposal_id: "42", vorhaben_enabled: true, budget_amount: "150", budget_asset: "EURe", beneficiary_name: "S",
  lifecycle_stage: "angenommen", tally_confirm_opened_at: new Date(NOW - 1000).toISOString(),
  tally_confirm_until: new Date(NOW + 86400_000).toISOString(), tally_address: "0x00000000000000000000000000000000000000aa" };

function db(seed: Record<string, unknown[]>, updated = { rows: 1 }) {
  const ops: Array<{ table: string; op: string; payload?: unknown }> = [];
  const q = (table: string, op: string, payload?: unknown) => {
    ops.push({ table, op, payload });
    const res = { data: op === "update" ? (updated.rows ? [{ id: "w1" }] : []) : seed[table] ?? [], error: null };
    const self: Record<string, unknown> = {
      eq: () => self, is: () => self, in: () => self, select: () => self,
      single: async () => ({ data: (seed[table] ?? [])[0] ?? null, error: null }),
      maybeSingle: async () => ({ data: (seed[table] ?? [])[0] ?? null, error: null }),
      then: (r: (v: unknown) => unknown) => r(res),
    };
    return self;
  };
  return { ops, from: (t: string) => ({ select: () => q(t, "select"), update: (p: unknown) => q(t, "update", p), upsert: (p: unknown) => q(t, "upsert", p), insert: (p: unknown) => q(t, "insert", p) }) };
}

const reader = (forVotes: bigint): ContractReader => ({
  readContract: async ({ functionName, args }) => ({
    state: 4, proposalDeadline: 100n, proposalPolls: [1n, "0x1", "0x2", "0x00000000000000000000000000000000000000aa", 100n],
    totalTallyResults: 3n, tallyResults: [args?.[0] === 1n ? forVotes : 1n, true],
  } as Record<string, unknown>)[functionName],
});

const settings = { platformFeeBps: 500, platformSafe: "0xbcabbaa26420e0a4771808f9639d4176355e5d4b", wahlhelferAsset: "MUENZEN" as const,
  wahlhelferAmount: "10", budgetFeeRail: "funder_xdai" as const, windowDays: 7, dispatchEnabled: true };

const seed = () => ({ proposals: [proposalRow], proposal_wahlhelfer: [{ id: "w1", attester_wallet: "0xa", confirmed_at: null }],
  proposal_contracts: [{ id: "c1", platform_fee_bps: 500, platform_safe_address: settings.platformSafe }], users: [] });

function deps(d: ReturnType<typeof db>, over: Partial<TallyDeps> = {}): TallyDeps {
  return { db: d as never, reader: reader(5n), settings, nowMs: () => NOW, verify: async () => true, dispatch: async () => {}, ...over };
}

test("valid signature stores the confirmation and creates two lines", async () => {
  const d = db(seed());
  const r = await submitTallyConfirmation(deps(d), "p1", "0xA", "0xsig");
  assert.equal(r.ok, true);
  const lines = d.ops.find((o) => o.table === "proposal_payout_lines" && o.op === "upsert");
  assert.equal((lines!.payload as unknown[]).length, 2);
});

test("the server rebuilds the message from the chain: a mismatching signature is rejected", async () => {
  let signedFor = "";
  const d = db(seed());
  const r = await submitTallyConfirmation(deps(d, { verify: async (_w, m) => { signedFor = m; return false; } }), "p1", "0xa", "0xsig");
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.code, "BAD_SIGNATURE");
  assert.match(signedFor, /Ja 5,/);
  assert.equal(d.ops.some((o) => o.table === "proposal_payout_lines"), false);
});

test("not eligible, closed window and double confirm are refused", async () => {
  const notEligible = db({ ...seed(), proposal_wahlhelfer: [] });
  const r1 = await submitTallyConfirmation(deps(notEligible), "p1", "0xz", "0xsig");
  assert.equal(r1.ok, false); if (!r1.ok) assert.equal(r1.code, "NOT_ELIGIBLE");

  const closed = db({ ...seed(), proposals: [{ ...proposalRow, tally_confirm_until: new Date(NOW - 1).toISOString() }] });
  const r2 = await submitTallyConfirmation(deps(closed), "p1", "0xa", "0xsig");
  assert.equal(r2.ok, false); if (!r2.ok) assert.equal(r2.code, "WINDOW_CLOSED");

  const done = db({ ...seed(), proposal_wahlhelfer: [{ id: "w1", attester_wallet: "0xa", confirmed_at: "2026-10-05T00:00:00Z" }] });
  const r3 = await submitTallyConfirmation(deps(done), "p1", "0xa", "0xsig");
  assert.equal(r3.ok, false); if (!r3.ok) assert.equal(r3.code, "ALREADY_CONFIRMED");
});

test("lost race on the conditional update creates no lines", async () => {
  const d = db(seed(), { rows: 0 });
  const r = await submitTallyConfirmation(deps(d), "p1", "0xa", "0xsig");
  assert.equal(r.ok, false); if (!r.ok) assert.equal(r.code, "ALREADY_CONFIRMED");
  assert.equal(d.ops.some((o) => o.table === "proposal_payout_lines"), false);
});
