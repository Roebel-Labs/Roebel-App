import assert from "node:assert/strict";
import { test } from "node:test";
import { dispatchLines, reconcile, settleIfMined, UNKLAR_AFTER_MS, type DispatchDeps } from "../src/lib/vorhaben/dispatch";
import type { LineRow } from "../src/lib/vorhaben/repo";

function line(p: Partial<LineRow>): LineRow {
  return { id: "l1", contract_id: "c1", proposal_id: "p1", role: "wahlhelfer", recipient_wallet: "0xaa", recipient_label: "Anna",
    amount: "10", asset: "MUENZEN", rail: "funder_muenzen", reference_type: "wahlhelfer", reference_id: "w1", status: "geplant",
    error: null, attempt_started_at: null, safe_tx_hash: null, safe_nonce: null, tx_hash: null, ...p };
}

/** Chainable fake honouring eq/in filters on proposal_payout_lines updates (first CAS wins). */
function fakeDb(rows: LineRow[]) {
  const updates: Array<{ id: string; patch: Record<string, unknown> }> = [];
  const inserts: Array<{ table: string; rows: unknown }> = [];
  const db = {
    updates, inserts,
    from(table: string) {
      return {
        update(patch: Record<string, unknown>) {
          const filters: Array<(r: LineRow) => boolean> = [];
          let id = "";
          const b: any = {
            eq(c: string, v: string) { if (c === "id") id = v; filters.push((r: any) => r[c] === v); return b; },
            in(c: string, v: string[]) { filters.push((r: any) => v.includes(r[c])); return b; },
            select() { return b; },
            then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) {
              let matched: LineRow[] = [];
              if (table === "proposal_payout_lines") matched = rows.filter((r) => filters.every((f) => f(r)));
              else updates.push({ id, patch });
              for (const r of matched) { updates.push({ id: r.id, patch }); Object.assign(r, patch); }
              return Promise.resolve({ data: matched.map((r) => ({ id: r.id })), error: null }).then(res, rej);
            },
          };
          return b;
        },
        select() {
          return {
            eq: () => ({ maybeSingle: async () => ({ data: { proposal_id: "0xkey" }, error: null }) }),
            in: (_c: string, v: string[]) => ({ order: async () => ({ data: rows.filter((r) => v.includes(r.status)), error: null }) }),
          };
        },
        insert: async (r: unknown) => { inserts.push({ table, rows: r }); return { error: null }; },
        upsert: async () => ({ error: null }),
      };
    },
  };
  return db;
}

function deps(db: ReturnType<typeof fakeDb>, over: Partial<DispatchDeps> = {}): DispatchDeps {
  return {
    db: db as never,
    sendFunder: async () => ({ status: "bestaetigt", txHash: "0xhash" }),
    proposeSafe: async () => {}, pollSafe: async () => {},
    receiptStatus: async () => "success",
    nowMs: () => 1_000_000_000,
    ...over,
  };
}

test("funder lines go to the edge function once each", async () => {
  const db = fakeDb([line({})]);
  const calls: string[] = [];
  await dispatchLines(deps(db, { sendFunder: async (id) => { calls.push(id); return { status: "bestaetigt", txHash: "0xh" }; } }), [line({}), line({ id: "l2", status: "bestaetigt" })]);
  assert.deepEqual(calls, ["l1"]);
});

test("two concurrent dispatchers: the edge claim decides, second call is a skip", async () => {
  let claimed = false;
  const send = async () => { if (claimed) return { status: "skipped" }; claimed = true; return { status: "bestaetigt", txHash: "0xh" }; };
  const db = fakeDb([line({})]);
  const results = await Promise.all([dispatchLines(deps(db, { sendFunder: send }), [line({})]), dispatchLines(deps(db, { sendFunder: send }), [line({})])]);
  assert.equal(results.length, 2);
  assert.equal(claimed, true);
});

test("manual and EURC lines are never sent automatically", async () => {
  const calls: string[] = [];
  const db = fakeDb([]);
  await dispatchLines(deps(db, { sendFunder: async (id) => { calls.push(id); return { status: "x" }; } }),
    [line({ id: "m", rail: "manual_safe" }), line({ id: "e", rail: "safe_eurc_base" })]);
  assert.deepEqual(calls, []);
});

test("reconcile: gesendet + mined → bestaetigt; reverted → fehlgeschlagen", async () => {
  const rows = [line({ id: "a", status: "gesendet", tx_hash: "0x1" }), line({ id: "b", status: "gesendet", tx_hash: "0x2" })];
  const db = fakeDb(rows);
  await reconcile(deps(db, { receiptStatus: async (h) => (h === "0x1" ? "success" : "reverted") }));
  assert.equal(rows[0].status, "bestaetigt");
  assert.equal(rows[1].status, "fehlgeschlagen");
});

test("reconcile: a funder line stuck in sendend without hash becomes unklar, never re-sent", async () => {
  const old = new Date(1_000_000_000 - UNKLAR_AFTER_MS - 1).toISOString();
  const rows = [line({ id: "s", status: "sendend", attempt_started_at: old })];
  const db = fakeDb(rows);
  const calls: string[] = [];
  await reconcile(deps(db, { sendFunder: async (id) => { calls.push(id); return { status: "x" }; } }));
  assert.equal(rows[0].status, "unklar");
  assert.deepEqual(calls, []);
});

test("reconcile: unklar line whose receipt is success becomes bestaetigt", async () => {
  const rows = [line({ id: "u", status: "unklar", tx_hash: "0x9" })];
  await reconcile(deps(fakeDb(rows)));
  assert.equal(rows[0].status, "bestaetigt");
});

test("reconcile: sendend with hash, pending under 30 min stays unchanged", async () => {
  const recent = new Date(1_000_000_000 - 5 * 60 * 1000).toISOString();
  const rows = [line({ id: "p", status: "sendend", tx_hash: "0x9", attempt_started_at: recent })];
  await reconcile(deps(fakeDb(rows), { receiptStatus: async () => "pending" }));
  assert.equal(rows[0].status, "sendend");
});

test("reconcile: pending over 30 min becomes unklar; already unklar is left alone", async () => {
  const old = new Date(1_000_000_000 - 31 * 60 * 1000).toISOString();
  const rows = [
    line({ id: "p", status: "gesendet", tx_hash: "0x9", attempt_started_at: old }),
    line({ id: "q", status: "unklar", tx_hash: "0x8", attempt_started_at: old, error: "keep" }),
  ];
  const db = fakeDb(rows);
  await reconcile(deps(db, { receiptStatus: async () => "pending" }));
  assert.equal(rows[0].status, "unklar");
  assert.match(rows[0].error ?? "", /not mined after 30 min/);
  assert.equal(rows[1].error, "keep");
  assert.equal(db.updates.length, 1);
});

test("reconcile never calls sendFunder", async () => {
  const old = new Date(1_000_000_000 - 31 * 60 * 1000).toISOString();
  const rows = [
    line({ id: "a", status: "sendend", attempt_started_at: old }),
    line({ id: "b", status: "sendend", tx_hash: "0x1", attempt_started_at: old }),
    line({ id: "c", status: "unklar", tx_hash: "0x2" }),
    line({ id: "d", status: "gesendet", tx_hash: "0x3" }),
  ];
  const calls: string[] = [];
  await reconcile(deps(fakeDb(rows), { sendFunder: async (id) => { calls.push(id); return { status: "x" }; }, receiptStatus: async () => "pending" }));
  assert.deepEqual(calls, []);
});

test("two concurrent settleIfMined calls on the same line settle and notify once", async () => {
  const rows = [line({ id: "g", status: "gesendet", tx_hash: "0x1" })];
  const db = fakeDb(rows);
  const d = deps(db);
  const res = await Promise.all([settleIfMined(d, rows[0]), settleIfMined(d, { ...rows[0] })]);
  assert.deepEqual(res.slice().sort(), ["settled", "skipped"]);
  assert.equal(db.inserts.filter((i) => i.table === "notifications").length, 1);
});

test("dispatchLines: edge returns gesendet + receipt success -> bestaetigt and one notification", async () => {
  const rows = [line({})];
  const db = fakeDb(rows);
  await dispatchLines(deps(db, { sendFunder: async () => { rows[0].status = "gesendet"; return { status: "gesendet", txHash: "0xh" }; } }), [line({})]);
  assert.equal(rows[0].status, "bestaetigt");
  assert.equal(db.inserts.filter((i) => i.table === "notifications").length, 1);
});

test("reconcile continues past a line whose receiptStatus throws", async () => {
  const rows = [line({ id: "x", status: "gesendet", tx_hash: "0xbad" }), line({ id: "y", status: "gesendet", tx_hash: "0xok" })];
  await reconcile(deps(fakeDb(rows), { receiptStatus: async (h) => { if (h === "0xbad") throw new Error("rpc down"); return "success"; } }));
  assert.equal(rows[0].status, "gesendet");
  assert.equal(rows[1].status, "bestaetigt");
});

test("reconcile: a manual_safe line with a recorded hash settles through the receipt path", async () => {
  const rows = [line({ id: "m", role: "empfaenger", rail: "manual_safe", asset: "EURe", recipient_wallet: null, status: "gesendet", tx_hash: "0x9" })];
  const db = fakeDb(rows);
  await reconcile(deps(db));
  assert.equal(rows[0].status, "bestaetigt");
});
