import assert from "node:assert/strict";
import { test } from "node:test";
import { handleVorhabenAction, type TaskDeps } from "../src/lib/vorhaben/task-service";
import type { LineRow } from "../src/lib/vorhaben/repo";

type Row = Record<string, any>;
type Op = { table: string; op: string; payload?: unknown };

const NOW = 2_000_000_000_000;
const PROPOSER = "0x" + "1".repeat(40);
const APPLICANT = "0x" + "2".repeat(40);
const ATTESTER = "0x" + "3".repeat(40);
const OTHER = "0x" + "4".repeat(40);
const P_ID = "11111111-1111-4111-8111-111111111111";
const T_ID = "22222222-2222-4222-8222-222222222222";
const L_ID = "33333333-3333-4333-8333-333333333333";
const TX = "0x" + "ab".repeat(32);
const PREFIX = "https://proj.supabase.co/storage/v1/object/public/";
const PLATFORM = "0xbcabbaa26420e0a4771808f9639d4176355e5d4b";

/** In-memory Supabase fake that honours eq/neq/in/is/limit filters and records every op. */
type DbError = { message: string; code?: string };
function fakeDb(seed: Record<string, Row[]>, opts: {
  casMiss?: string[]; updateError?: Record<string, DbError>;
  /** Per-update error, decided from the table and the eq() filters of that update. */
  updateErrorWhen?: (table: string, eqs: Row) => DbError | null;
} = {}) {
  const tables: Record<string, Row[]> = Object.fromEntries(Object.entries(seed).map(([k, v]) => [k, v.map((r) => ({ ...r }))]));
  const ops: Op[] = [];
  let n = 0;
  const from = (table: string) => {
    const builder = (op: string, payload?: unknown, upsertOpts?: { onConflict?: string }) => {
      ops.push({ table, op, payload });
      const filters: Array<(r: Row) => boolean> = [];
      const eqs: Row = {};
      let limit = Infinity;
      let selected = false;
      const run = (): { data: unknown; error: { message: string; code?: string } | null } => {
        const list = (tables[table] ??= []);
        const match = (r: Row) => filters.every((f) => f(r));
        if (op === "select") return { data: list.filter(match).slice(0, limit).map((r) => ({ ...r })), error: null };
        if (op === "insert") {
          const arr = (Array.isArray(payload) ? payload : [payload]) as Row[];
          if (table === "task_applications" && arr.some((r) => list.some((x) => x.task_id === r.task_id && x.applicant_wallet === r.applicant_wallet))) {
            return { data: null, error: { message: "duplicate key", code: "23505" } };
          }
          const added = arr.map((r) => ({ id: `${table}-${++n}`, created_at: new Date(NOW).toISOString(), status: "offen", ...r }));
          list.push(...added);
          return { data: added, error: null };
        }
        if (op === "upsert") {
          const keys = (upsertOpts?.onConflict ?? "id").split(",");
          for (const r of (Array.isArray(payload) ? payload : [payload]) as Row[]) {
            if (!list.some((x) => keys.every((k) => x[k] === r[k]))) list.push({ id: `${table}-${++n}`, status: "geplant", ...r });
          }
          return { data: null, error: null };
        }
        // update
        if (opts.updateError?.[table]) return { data: null, error: opts.updateError[table] };
        const when = opts.updateErrorWhen?.(table, eqs);
        if (when) return { data: null, error: when };
        if (selected && opts.casMiss?.includes(table)) return { data: [], error: null };
        const hit = list.filter(match);
        for (const r of hit) Object.assign(r, payload as Row);
        return { data: hit.map((r) => ({ id: r.id })), error: null };
      };
      const b: any = {
        eq: (c: string, v: unknown) => { eqs[c] = v; filters.push((r) => r[c] === v); return b; },
        neq: (c: string, v: unknown) => { filters.push((r) => r[c] !== v); return b; },
        ilike: (c: string, v: string) => { filters.push((r) => typeof r[c] === "string" && r[c].toLowerCase() === v.toLowerCase()); return b; },
        in: (c: string, v: unknown[]) => { filters.push((r) => v.includes(r[c])); return b; },
        is: (c: string, v: unknown) => { filters.push((r) => (r[c] ?? null) === v); return b; },
        or: () => b, order: () => b,
        limit: (k: number) => { limit = k; return b; },
        select: () => { selected = true; return b; },
        single: async () => { const r = run(); return { data: Array.isArray(r.data) ? r.data[0] ?? null : r.data, error: r.error }; },
        maybeSingle: async () => { const r = run(); return { data: Array.isArray(r.data) ? r.data[0] ?? null : r.data, error: r.error }; },
        then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(run()).then(res, rej),
      };
      return b;
    };
    return {
      select: () => builder("select"),
      insert: (p: unknown) => builder("insert", p),
      update: (p: unknown) => builder("update", p),
      upsert: (p: unknown, o?: { onConflict?: string }) => builder("upsert", p, o),
    };
  };
  return { tables, ops, from };
}

const proposal = (over: Row = {}): Row => ({
  id: P_ID, proposal_id: "0xkey", proposal_number: 3, title: "Spende", proposer_address: PROPOSER, blockchain_proposal_id: "42",
  vorhaben_enabled: true, budget_amount: null, budget_asset: null, beneficiary_name: null, lifecycle_stage: "abstimmung",
  tally_confirm_opened_at: null, tally_confirm_until: null, tally_address: null, ...over,
});
const task = (over: Row = {}): Row => ({
  id: T_ID, proposal_id: P_ID, title: "Überweisung ausführen", status: "offen", assignee_wallet: null,
  created_by_wallet: PROPOSER, reward_amount: "5", reward_asset: "EURe", ...over,
});
const application = (wallet: string, at = NOW - 1000): Row => ({
  id: `app-${wallet.slice(2, 4)}`, task_id: T_ID, applicant_wallet: wallet, note: "", status: "offen", created_at: new Date(at).toISOString(),
});
const seed = (over: Record<string, Row[]> = {}): Record<string, Row[]> => ({
  proposals: [proposal()], proposal_tasks: [task()], task_applications: [], task_activity: [], notifications: [],
  proposal_contracts: [{ id: "c1", proposal_id: P_ID, platform_fee_bps: 500, platform_safe_address: PLATFORM }],
  proposal_payout_lines: [], users: [], ...over,
});

const settings = { platformFeeBps: 500, platformSafe: PLATFORM, wahlhelferAsset: "MUENZEN" as const, wahlhelferAmount: "10",
  budgetFeeRail: "funder_xdai" as const, taskPayoutRail: "manual_safe" as const, windowDays: 7, dispatchEnabled: true };

function deps(db: ReturnType<typeof fakeDb>, over: Partial<TaskDeps> = {}): TaskDeps & { dispatched: string[][]; settled: LineRow[] } {
  const dispatched: string[][] = [];
  const settled: LineRow[] = [];
  return {
    db: db as never, settings, nowMs: () => NOW,
    isAttester: async (w) => w === ATTESTER,
    listAttesters: async () => [ATTESTER, APPLICANT],
    verifyManualTx: async () => true,
    dispatch: async (ids) => { dispatched.push(ids); },
    settle: async (l) => { settled.push(l); return "settled"; },
    storagePublicPrefix: PREFIX,
    dispatched, settled,
    ...over,
  };
}
const updatesOf = (db: ReturnType<typeof fakeDb>, table: string) => db.ops.filter((o) => o.table === table && o.op === "update");

test("task_apply by a fresh wallet inserts one application and notifies the proposer", async () => {
  const db = fakeDb(seed());
  const r = await handleVorhabenAction(deps(db), APPLICANT, "task_apply", { taskId: T_ID, note: "  Mach ich gern  " });
  assert.equal(r.ok, true);
  const ins = db.ops.filter((o) => o.table === "task_applications" && o.op === "insert");
  assert.equal(ins.length, 1);
  assert.deepEqual(ins[0].payload, { task_id: T_ID, applicant_wallet: APPLICANT, note: "Mach ich gern" });
  assert.equal(db.tables.notifications.length, 1);
  assert.equal(db.tables.notifications[0].recipient_wallet, PROPOSER);
  assert.equal(db.tables.notifications[0].type, "vorhaben_task");
  assert.equal(db.tables.notifications[0].title, "Neue Bewerbung");
});

test("task_apply twice is ALREADY_APPLIED", async () => {
  const db = fakeDb(seed({ task_applications: [application(APPLICANT)] }));
  const r = await handleVorhabenAction(deps(db), APPLICANT, "task_apply", { taskId: T_ID });
  assert.equal(r.ok, false);
  if (!r.ok) { assert.equal(r.code, "ALREADY_APPLIED"); assert.equal(r.status, 409); }
});

test("task_assign by the proposer for a wallet that did not apply is NOT_AN_APPLICANT, no update", async () => {
  const db = fakeDb(seed({ task_applications: [application(APPLICANT)] }));
  const r = await handleVorhabenAction(deps(db), PROPOSER, "task_assign", { taskId: T_ID, applicant: OTHER });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.code, "NOT_AN_APPLICANT");
  assert.equal(db.ops.some((o) => o.op === "update"), false);
});

test("task_assign when the proposer applied: proposer is FORBIDDEN, an Attester may assign", async () => {
  const apps = () => [application(PROPOSER), application(APPLICANT)];
  const db1 = fakeDb(seed({ task_applications: apps() }));
  const r1 = await handleVorhabenAction(deps(db1), PROPOSER, "task_assign", { taskId: T_ID, applicant: APPLICANT });
  assert.equal(r1.ok, false);
  if (!r1.ok) { assert.equal(r1.code, "FORBIDDEN"); assert.equal(r1.status, 403); }
  assert.equal(db1.ops.some((o) => o.op === "update"), false);

  const db2 = fakeDb(seed({ task_applications: apps() }));
  const r2 = await handleVorhabenAction(deps(db2), ATTESTER, "task_assign", { taskId: T_ID, applicant: APPLICANT.toUpperCase().replace("0X", "0x") });
  assert.equal(r2.ok, true);
  const up = updatesOf(db2, "proposal_tasks")[0].payload as Row;
  assert.equal(up.status, "vergeben");
  assert.equal(up.assignee_wallet, APPLICANT);
  assert.equal(up.assigned_by_wallet, ATTESTER);
  const byWallet = Object.fromEntries(db2.tables.task_applications.map((a) => [a.applicant_wallet, a.status]));
  assert.deepEqual(byWallet, { [PROPOSER]: "abgelehnt", [APPLICANT]: "angenommen" });
  const act = db2.tables.task_activity[0];
  assert.deepEqual([act.kind, act.from_status, act.to_status], ["status_change", "offen", "vergeben"]);
  assert.equal(db2.tables.notifications[0].recipient_wallet, APPLICANT);
  assert.equal(db2.tables.notifications[0].title, "Aufgabe an dich vergeben");
});

test("task_approve by the assignee who is also an Attester is SELF_APPROVE", async () => {
  const db = fakeDb(seed({ proposal_tasks: [task({ status: "eingereicht", assignee_wallet: ATTESTER })] }));
  const r = await handleVorhabenAction(deps(db), ATTESTER, "task_approve", { taskId: T_ID });
  assert.equal(r.ok, false);
  if (!r.ok) { assert.equal(r.code, "SELF_APPROVE"); assert.equal(r.status, 403); }
  assert.equal(db.ops.some((o) => o.op === "update"), false);
});

test("task_approve on an accepted proposal inserts the task + platform lines and dispatches them", async () => {
  const db = fakeDb(seed({
    proposals: [proposal({ lifecycle_stage: "angenommen" })],
    proposal_tasks: [task({ status: "eingereicht", assignee_wallet: APPLICANT })],
  }));
  const d = deps(db);
  const r = await handleVorhabenAction(d, ATTESTER, "task_approve", { taskId: T_ID });
  assert.equal(r.ok, true);
  const up = updatesOf(db, "proposal_tasks")[0].payload as Row;
  assert.equal(up.status, "abgenommen");
  assert.equal(up.approved_by_wallet, ATTESTER);
  const lines = db.ops.find((o) => o.table === "proposal_payout_lines" && o.op === "upsert")!.payload as Row[];
  assert.equal(lines.length, 2);
  assert.deepEqual(lines.map((l) => [l.role, l.amount, l.asset, l.rail]),
    [["aufgabe", "5", "EURe", "manual_safe"], ["plattform", "0.25", "EURe", "manual_safe"]]);
  assert.equal(lines[0].recipient_wallet, APPLICANT);
  assert.equal(d.dispatched.length, 1);
  assert.equal(d.dispatched[0].length, 2);
  assert.equal(db.tables.notifications[0].recipient_wallet, APPLICANT);
  assert.equal(db.tables.notifications[0].title, "Aufgabe abgenommen");
  // Payouts may be paused: never promise "unterwegs".
  assert.equal(db.tables.notifications[0].body, "Deine Aufgabe wurde abgenommen. Die Auszahlung wird vorbereitet.");
});

test("task_approve before acceptance creates no lines (the cron creates them later)", async () => {
  const db = fakeDb(seed({ proposal_tasks: [task({ status: "eingereicht", assignee_wallet: APPLICANT })] }));
  const d = deps(db);
  const r = await handleVorhabenAction(d, ATTESTER, "task_approve", { taskId: T_ID });
  assert.equal(r.ok, true);
  assert.equal(db.ops.some((o) => o.table === "proposal_payout_lines"), false);
  assert.equal(d.dispatched.length, 0);
});

test("task_create rejects more than 2 decimals; a valid create returns id + status", async () => {
  const base = { proposalId: P_ID, title: "Überweisung", description: "", criteria: ["Beleg hochgeladen"], rewardAsset: "EURe" };
  const db1 = fakeDb(seed());
  const r1 = await handleVorhabenAction(deps(db1), PROPOSER, "task_create", { ...base, rewardAmount: "5.123" });
  assert.equal(r1.ok, false);
  if (!r1.ok) { assert.equal(r1.code, "BAD_REQUEST"); assert.equal(r1.status, 400); }
  assert.equal(db1.ops.length, 0);

  const db2 = fakeDb(seed({ proposal_tasks: [] }));
  const r2 = await handleVorhabenAction(deps(db2), PROPOSER, "task_create", { ...base, rewardAmount: "5" });
  assert.equal(r2.ok, true);
  if (r2.ok) {
    const data = r2.data as { id: string; status: string };
    assert.equal(data.status, "offen");
    assert.equal(data.id, db2.tables.proposal_tasks[0].id);
  }
  assert.deepEqual(db2.tables.proposal_tasks[0].acceptance_criteria, [{ id: "k1", text: "Beleg hochgeladen", done: false }]);

  const db3 = fakeDb(seed());
  const r3 = await handleVorhabenAction(deps(db3), OTHER, "task_create", { ...base, rewardAmount: "5" });
  assert.equal(r3.ok, false);
  if (!r3.ok) assert.equal(r3.code, "FORBIDDEN");
});

test("task_create accepts a client-chosen task id (person-signed create) and rejects a malformed one", async () => {
  const base = { proposalId: P_ID, title: "Überweisung", criteria: ["Beleg hochgeladen"], rewardAmount: "5", rewardAsset: "EURe" };
  const NEW_ID = "55555555-5555-4555-8555-555555555555";
  const db = fakeDb(seed({ proposal_tasks: [] }));
  const r = await handleVorhabenAction(deps(db), PROPOSER, "task_create", { ...base, taskId: NEW_ID });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal((r.data as { id: string }).id, NEW_ID);
  assert.equal(db.tables.proposal_tasks[0].id, NEW_ID);

  const db2 = fakeDb(seed({ proposal_tasks: [] }));
  const r2 = await handleVorhabenAction(deps(db2), PROPOSER, "task_create", { ...base, taskId: "nope" });
  assert.equal(r2.ok, false);
  if (!r2.ok) assert.equal(r2.status, 400);
  assert.equal(db2.ops.length, 0);
});

test("a lost conditional status update returns CONFLICT and writes no activity", async () => {
  const db = fakeDb(seed({ proposal_tasks: [task({ status: "vergeben", assignee_wallet: APPLICANT })] }), { casMiss: ["proposal_tasks"] });
  const r = await handleVorhabenAction(deps(db), APPLICANT, "task_start", { taskId: T_ID });
  assert.equal(r.ok, false);
  if (!r.ok) { assert.equal(r.code, "CONFLICT"); assert.equal(r.status, 409); }
  assert.equal(db.tables.task_activity.length, 0);
});

test("task_proof rejects attachment URLs outside the project's storage", async () => {
  const seeded = () => seed({ proposal_tasks: [task({ status: "vergeben", assignee_wallet: APPLICANT })] });
  const db1 = fakeDb(seeded());
  const r1 = await handleVorhabenAction(deps(db1), APPLICANT, "task_proof",
    { taskId: T_ID, attachments: [{ type: "image", url: "https://evil.example/storage/v1/object/public/x.png" }] });
  assert.equal(r1.ok, false);
  if (!r1.ok) assert.equal(r1.code, "BAD_REQUEST");
  assert.equal(db1.ops.length, 0);

  const db2 = fakeDb(seeded());
  const r2 = await handleVorhabenAction(deps(db2), APPLICANT, "task_proof",
    { taskId: T_ID, body: "Erledigt", attachments: [{ type: "image", url: `${PREFIX}images/beleg.png` }, { type: "tx", hash: TX.toUpperCase().replace("0X", "0x") }] });
  assert.equal(r2.ok, true);
  const act = db2.tables.task_activity[0];
  assert.equal(act.kind, "proof");
  assert.deepEqual(act.attachments, [{ type: "image", url: `${PREFIX}images/beleg.png` }, { type: "tx", hash: TX }]);
  assert.equal(db2.tables.proposal_tasks[0].status, "in_arbeit");
});

test("task_submit still succeeds when the Attester list cannot be read", async () => {
  const db = fakeDb(seed({
    proposal_tasks: [task({ status: "in_arbeit", assignee_wallet: APPLICANT })],
    task_activity: [{ id: "a1", task_id: T_ID, kind: "proof" }],
  }));
  const r = await handleVorhabenAction(deps(db, { listAttesters: async () => { throw new Error("rpc down"); } }), APPLICANT, "task_submit", { taskId: T_ID });
  assert.equal(r.ok, true);
  assert.equal(db.tables.proposal_tasks[0].status, "eingereicht");
  assert.equal(db.tables.notifications.length, 0);

  const db2 = fakeDb(seed({
    proposal_tasks: [task({ status: "in_arbeit", assignee_wallet: APPLICANT })],
    task_activity: [{ id: "a1", task_id: T_ID, kind: "proof" }],
  }));
  await handleVorhabenAction(deps(db2), APPLICANT, "task_submit", { taskId: T_ID });
  assert.deepEqual(db2.tables.notifications.map((x) => x.recipient_wallet), [ATTESTER]); // assignee excluded
});

const manualLine = (over: Row = {}): Row => ({
  id: L_ID, contract_id: "c1", proposal_id: P_ID, role: "empfaenger", recipient_wallet: null, recipient_label: "Verein",
  amount: "150", asset: "EURe", rail: "manual_safe", reference_type: "proposal", reference_id: P_ID, status: "geplant",
  error: null, attempt_started_at: null, safe_tx_hash: null, safe_nonce: null, tx_hash: null,
  created_at: new Date(NOW - 3600_000).toISOString(), ...over,
});

test("payout_record_manual with an unverified tx is BAD_TX and leaves the line unchanged", async () => {
  const db = fakeDb(seed({ proposal_payout_lines: [manualLine()] }));
  const d = deps(db, { verifyManualTx: async () => false });
  const r = await handleVorhabenAction(d, ATTESTER, "payout_record_manual", { lineId: L_ID, txHash: TX });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.code, "BAD_TX");
  assert.equal(updatesOf(db, "proposal_payout_lines").length, 0);
  assert.deepEqual(db.tables.proposal_payout_lines[0], manualLine());
  assert.equal(d.settled.length, 0);
});

test("payout_record_manual moves the line to gesendet with the hash and settles once", async () => {
  const db = fakeDb(seed({ proposal_payout_lines: [manualLine()] }));
  let checked: [string, string, number, string | null | undefined] | null = null;
  const d = deps(db, { verifyManualTx: async (h, a, nb, to) => { checked = [h, a, nb, to]; return true; } });
  const r = await handleVorhabenAction(d, ATTESTER, "payout_record_manual", { lineId: L_ID, txHash: TX.toUpperCase().replace("0X", "0x") });
  assert.equal(r.ok, true);
  // The tx must be mined at or after the line was created.
  // A budget line has no recipient wallet: no recipient check.
  assert.deepEqual(checked, [TX, "150", Math.floor((NOW - 3600_000) / 1000), null]);
  const line = db.tables.proposal_payout_lines[0];
  assert.equal(line.status, "gesendet");
  assert.equal(line.tx_hash, TX);
  assert.equal(d.settled.length, 1);
  assert.equal(d.settled[0].status, "gesendet");
  assert.equal(d.settled[0].tx_hash, TX);
});

test("payout_record_manual: non-Attester, wrong rail and malformed hash are refused", async () => {
  const db = fakeDb(seed({ proposal_payout_lines: [manualLine()] }));
  const r1 = await handleVorhabenAction(deps(db), OTHER, "payout_record_manual", { lineId: L_ID, txHash: TX });
  assert.equal(r1.ok, false); if (!r1.ok) assert.equal(r1.code, "FORBIDDEN");
  const r2 = await handleVorhabenAction(deps(db), ATTESTER, "payout_record_manual", { lineId: L_ID, txHash: "0x1234" });
  assert.equal(r2.ok, false); if (!r2.ok) assert.equal(r2.code, "BAD_REQUEST");
  const db3 = fakeDb(seed({ proposal_payout_lines: [manualLine({ rail: "safe_eure", role: "aufgabe" })] }));
  const r3 = await handleVorhabenAction(deps(db3), ATTESTER, "payout_record_manual", { lineId: L_ID, txHash: TX });
  assert.equal(r3.ok, false); if (!r3.ok) assert.equal(r3.code, "BAD_LINE");
  assert.equal(updatesOf(db, "proposal_payout_lines").length + updatesOf(db3, "proposal_payout_lines").length, 0);
});

test("payout_record_manual: a tx already linked to another proposal is TX_USED; same proposal is fine", async () => {
  const OTHER_P = "44444444-4444-4444-8444-444444444444";
  const db = fakeDb(seed({ proposal_payout_lines: [manualLine()], treasury_tx_links: [{ tx_hash: TX, proposal_id: OTHER_P }] }));
  let verified = 0;
  const d = deps(db, { verifyManualTx: async () => { verified++; return true; } });
  const r = await handleVorhabenAction(d, ATTESTER, "payout_record_manual", { lineId: L_ID, txHash: TX });
  assert.equal(r.ok, false);
  if (!r.ok) { assert.equal(r.code, "TX_USED"); assert.equal(r.status, 409); }
  assert.equal(verified, 0);
  assert.equal(db.tables.proposal_payout_lines[0].status, "geplant");

  const db2 = fakeDb(seed({ proposal_payout_lines: [manualLine()], treasury_tx_links: [{ tx_hash: TX, proposal_id: P_ID }] }));
  const r2 = await handleVorhabenAction(deps(db2), ATTESTER, "payout_record_manual", { lineId: L_ID, txHash: TX });
  assert.equal(r2.ok, true);
});

test("payout_record_manual: the execution hash of a safe_eure line (any case) is TX_USED", async () => {
  const safeLine = manualLine({ id: "55555555-5555-4555-8555-555555555555", role: "aufgabe", rail: "safe_eure", reference_type: "task",
    reference_id: T_ID, status: "bestaetigt", tx_hash: "0x" + "AB".repeat(32) });
  const db = fakeDb(seed({ proposal_payout_lines: [manualLine(), safeLine] }));
  let verified = 0;
  const r = await handleVorhabenAction(deps(db, { verifyManualTx: async () => { verified++; return true; } }), ATTESTER,
    "payout_record_manual", { lineId: L_ID, txHash: TX });
  assert.equal(r.ok, false);
  if (!r.ok) { assert.equal(r.code, "TX_USED"); assert.equal(r.status, 409); }
  assert.equal(verified, 0);
  assert.equal(db.tables.proposal_payout_lines[0].status, "geplant");
});

test("payout_record_manual: a unique violation on the CAS (concurrent claim of the same tx) is TX_USED 409", async () => {
  const db = fakeDb(seed({ proposal_payout_lines: [manualLine()] }),
    { updateError: { proposal_payout_lines: { message: "duplicate key value violates unique constraint \"proposal_payout_lines_manual_tx_key\"", code: "23505" } } });
  const d = deps(db);
  const r = await handleVorhabenAction(d, ATTESTER, "payout_record_manual", { lineId: L_ID, txHash: TX });
  assert.equal(r.ok, false);
  if (!r.ok) { assert.equal(r.code, "TX_USED"); assert.equal(r.status, 409); }
  assert.equal(d.settled.length, 0);
});

test("payout_record_manual: a numeric amount from PostgREST reaches the verifier as a string", async () => {
  const db = fakeDb(seed({ proposal_payout_lines: [manualLine({ amount: 150 })] }));
  let amount: unknown = null;
  const d = deps(db, { verifyManualTx: async (_h, a) => { amount = a; return true; } });
  const r = await handleVorhabenAction(d, ATTESTER, "payout_record_manual", { lineId: L_ID, txHash: TX });
  assert.equal(r.ok, true);
  assert.equal(amount, "150");
  assert.equal(d.settled[0].amount, "150");
});

// ---- manual task payouts (aufgabe line + its platform fee, ideally one Safe batch tx) ----------

const F_ID = "66666666-6666-4666-8666-666666666666";
const taskLine = (over: Row = {}): Row => manualLine({
  role: "aufgabe", recipient_wallet: APPLICANT, recipient_label: "Bea", amount: "5", reference_type: "task", reference_id: T_ID, ...over,
});
const feeLineRow = (over: Row = {}): Row => manualLine({
  id: F_ID, role: "plattform", recipient_wallet: PLATFORM, recipient_label: "Plattform", amount: "0.25", reference_type: "task",
  reference_id: T_ID, created_at: new Date(NOW - 1800_000).toISOString(), ...over,
});
/** A fake chain: the tx holds exactly these EURe transfers from the Safe. */
const chainWith = (transfers: Array<{ to: string; amount: string }>, calls: unknown[][] = []): TaskDeps["verifyManualTx"] =>
  async (h, a, nb, to) => {
    calls.push([h, a, nb, to]);
    return transfers.some((t) => t.amount === a && (!to || t.to === to));
  };
const taskSeed = (lines: Row[]) => seed({
  proposals: [proposal({ lifecycle_stage: "in_umsetzung" })],
  proposal_tasks: [task({ status: "abgenommen", assignee_wallet: APPLICANT })],
  proposal_payout_lines: lines,
});

test("payout_record_manual on a task line with the fee in the same tx records + settles both, main first", async () => {
  const db = fakeDb(taskSeed([taskLine(), feeLineRow()]));
  const calls: unknown[][] = [];
  const d = deps(db, { verifyManualTx: chainWith([{ to: APPLICANT, amount: "5" }, { to: PLATFORM, amount: "0.25" }], calls) });
  const r = await handleVorhabenAction(d, ATTESTER, "payout_record_manual", { lineId: L_ID, txHash: TX });
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.data, { status: "bestaetigt", feeRecorded: true, feeOpen: false });
  assert.deepEqual(calls, [
    [TX, "5", Math.floor((NOW - 3600_000) / 1000), APPLICANT],
    [TX, "0.25", Math.floor((NOW - 1800_000) / 1000), PLATFORM],
  ]);
  const [main, fee] = db.tables.proposal_payout_lines;
  assert.deepEqual([main.status, main.tx_hash, fee.status, fee.tx_hash], ["gesendet", TX, "gesendet", TX]);
  assert.deepEqual(d.settled.map((l) => [l.id, l.status, l.tx_hash]), [[L_ID, "gesendet", TX], [F_ID, "gesendet", TX]]);
});

test("payout_record_manual on a task line without the fee in the tx settles the reward and leaves the fee geplant", async () => {
  const db = fakeDb(taskSeed([taskLine(), feeLineRow()]));
  const d = deps(db, { verifyManualTx: chainWith([{ to: APPLICANT, amount: "5" }]) });
  const r = await handleVorhabenAction(d, ATTESTER, "payout_record_manual", { lineId: L_ID, txHash: TX });
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.data, { status: "bestaetigt", feeRecorded: false, feeOpen: true });
  const [main, fee] = db.tables.proposal_payout_lines;
  assert.equal(main.status, "gesendet");
  assert.deepEqual([fee.status, fee.tx_hash], ["geplant", null]);
  assert.deepEqual(d.settled.map((l) => l.id), [L_ID]);

  // The fee is then recorded on its own with a second tx; the reward line keeps its hash.
  const TX2 = "0x" + "cd".repeat(32);
  const d2 = deps(db, { verifyManualTx: chainWith([{ to: PLATFORM, amount: "0.25" }]) });
  const r2 = await handleVorhabenAction(d2, ATTESTER, "payout_record_manual", { lineId: F_ID, txHash: TX2 });
  assert.equal(r2.ok, true);
  assert.deepEqual([db.tables.proposal_payout_lines[1].status, db.tables.proposal_payout_lines[1].tx_hash], ["gesendet", TX2]);
});

test("payout_record_manual: the fee line of a task may reuse the hash of its own reward line", async () => {
  const db = fakeDb(taskSeed([taskLine({ status: "bestaetigt", tx_hash: TX }), feeLineRow()]));
  const d = deps(db, { verifyManualTx: chainWith([{ to: APPLICANT, amount: "5" }, { to: PLATFORM, amount: "0.25" }]) });
  const r = await handleVorhabenAction(d, ATTESTER, "payout_record_manual", { lineId: F_ID, txHash: TX });
  assert.equal(r.ok, true);
  assert.equal(db.tables.proposal_payout_lines[1].status, "gesendet");
});

test("payout_record_manual: a transfer to someone else than the assignee is BAD_TX", async () => {
  const db = fakeDb(taskSeed([taskLine(), feeLineRow()]));
  const d = deps(db, { verifyManualTx: chainWith([{ to: OTHER, amount: "5" }, { to: PLATFORM, amount: "0.25" }]) });
  const r = await handleVorhabenAction(d, ATTESTER, "payout_record_manual", { lineId: L_ID, txHash: TX });
  assert.equal(r.ok, false);
  if (!r.ok) { assert.equal(r.code, "BAD_TX"); assert.equal(r.status, 400); }
  assert.equal(updatesOf(db, "proposal_payout_lines").length, 0);
  assert.equal(d.settled.length, 0);
});

test("payout_record_manual: a hash already used by another task's line is TX_USED", async () => {
  const T2 = "77777777-7777-4777-8777-777777777777";
  const other = taskLine({ id: "88888888-8888-4888-8888-888888888888", reference_id: T2, status: "bestaetigt", tx_hash: TX });
  const db = fakeDb(taskSeed([taskLine(), feeLineRow(), other]));
  let verified = 0;
  const r = await handleVorhabenAction(deps(db, { verifyManualTx: async () => { verified++; return true; } }), ATTESTER,
    "payout_record_manual", { lineId: L_ID, txHash: TX });
  assert.equal(r.ok, false);
  if (!r.ok) { assert.equal(r.code, "TX_USED"); assert.equal(r.status, 409); }
  assert.equal(verified, 0);
  assert.equal(db.tables.proposal_payout_lines[0].status, "geplant");
});

test("payout_record_manual: a 23505 on the fee line (old per-tx index) still settles the reward; fee not recorded", async () => {
  const db = fakeDb(taskSeed([taskLine(), feeLineRow()]), {
    updateErrorWhen: (table, eqs) => (table === "proposal_payout_lines" && eqs.id === F_ID
      ? { message: "duplicate key value violates unique constraint \"proposal_payout_lines_manual_tx_key\"", code: "23505" } : null),
  });
  const d = deps(db, { verifyManualTx: chainWith([{ to: APPLICANT, amount: "5" }, { to: PLATFORM, amount: "0.25" }]) });
  const r = await handleVorhabenAction(d, ATTESTER, "payout_record_manual", { lineId: L_ID, txHash: TX });
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.data, { status: "bestaetigt", feeRecorded: false, feeOpen: true });
  assert.equal(db.tables.proposal_payout_lines[0].status, "gesendet");
  assert.equal(db.tables.proposal_payout_lines[1].status, "geplant");
  assert.deepEqual(d.settled.map((l) => l.id), [L_ID]);
});

test("payout_record_manual: a platform line of a budget (proposal reference) is not recordable by hand", async () => {
  const db = fakeDb(seed({ proposal_payout_lines: [feeLineRow({ reference_type: "proposal", reference_id: P_ID })] }));
  const r = await handleVorhabenAction(deps(db), ATTESTER, "payout_record_manual", { lineId: F_ID, txHash: TX });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.code, "BAD_LINE");
});

test("task_create bounds the reward at 9.999.999,99", async () => {
  const base = { proposalId: P_ID, title: "Überweisung", criteria: ["Beleg"], rewardAsset: "EURe" };
  for (const bad of ["10000000", "0", "0.00", "12345678.5", "-1", "1e3"]) {
    const db = fakeDb(seed());
    const r = await handleVorhabenAction(deps(db), PROPOSER, "task_create", { ...base, rewardAmount: bad });
    assert.equal(r.ok, false, bad);
    if (!r.ok) { assert.equal(r.code, "BAD_REQUEST"); assert.match(r.message, /9\.999\.999,99/); }
  }
  const db = fakeDb(seed({ proposal_tasks: [] }));
  const ok = await handleVorhabenAction(deps(db), PROPOSER, "task_create", { ...base, rewardAmount: "9999999.99" });
  assert.equal(ok.ok, true);
});

test("task_approve: when line creation fails the notice does not promise a payout underway", async () => {
  const db = fakeDb(seed({
    proposals: [proposal({ lifecycle_stage: "angenommen" })],
    proposal_tasks: [task({ status: "eingereicht", assignee_wallet: APPLICANT })],
    proposal_contracts: [],
  }));
  // Break ensureContract's read so createTaskLines throws.
  const realFrom = db.from;
  (db as any).from = (t: string) => {
    if (t !== "proposal_contracts") return realFrom(t);
    return { upsert: async () => ({ error: { message: "boom" } }), select: () => realFrom(t).select() };
  };
  const r = await handleVorhabenAction(deps(db), ATTESTER, "task_approve", { taskId: T_ID });
  assert.equal(r.ok, true);
  assert.equal(db.tables.proposal_tasks[0].status, "abgenommen");
  assert.equal(db.tables.notifications[0].body, "Deine Aufgabe wurde abgenommen. Die Auszahlung wird vorbereitet.");
});
