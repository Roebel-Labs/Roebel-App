import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildEvent, deriveOrgIdentity, getPublicKeyHex, verifyEvent, type NostrEvent, type OrgIdentity } from "@netizen-labs/nostr";
import { headAddress, safeParseAction, safeParseTransition, taskAddress } from "@netizen-labs/protocol";
import { drainOutbox, resolvePubkeys, type OutboxDeps } from "../src/outbox.js";
import { buildSpecs, publishOnce, signSpec } from "../src/sync.js";
import type { PublishSpec } from "../src/mappers.js";

const SECRET = "a-node-secret-with-plenty-of-entropy-0123456789";
const NODE = "roebel";
const TOWN = deriveOrgIdentity(SECRET, NODE, "town").publicKey;
const P_UUID = "f4a87bbe-9deb-4f5e-9807-3b8534135c15";
const KEY = "0xabc123";
const T1 = "11111111-1111-4111-8111-111111111111";
const T2 = "22222222-2222-4222-8222-222222222222";
const WALLET = "0x" + "1".repeat(40);
const ACTOR_PK = "e".repeat(64);
const NOW = 1_790_000_000;

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

/** Just enough PostgREST for the drain: eq / is.null / not.is.null / in.() / or=(col.ilike.v) / order / limit. */
function matches(row: Row, query: string): boolean {
  for (const part of query.split("&")) {
    if (!part) continue;
    const i = part.indexOf("=");
    const key = part.slice(0, i);
    const value = decodeURIComponent(part.slice(i + 1));
    if (key === "select" || key === "order" || key === "limit") continue;
    if (key === "or") {
      const alts = value.replace(/^\(|\)$/g, "").split(",");
      const ok = alts.some((alt) => {
        const [col, op, ...rest] = alt.split(".");
        const v = rest.join(".");
        if (op !== "ilike") throw new Error(`fake: unsupported or-op ${op}`);
        return String(row[col] ?? "").toLowerCase() === v.toLowerCase();
      });
      if (!ok) return false;
      continue;
    }
    const cell = row[key];
    if (value === "is.null") { if (cell !== null && cell !== undefined) return false; }
    else if (value === "not.is.null") { if (cell === null || cell === undefined) return false; }
    else if (value === "is.true") { if (cell !== true) return false; }
    else if (value.startsWith("eq.")) { if (String(cell) !== value.slice(3)) return false; }
    else if (value.startsWith("in.(")) { if (!value.slice(4, -1).split(",").includes(String(cell))) return false; }
    else throw new Error(`fake: unsupported filter ${part}`);
  }
  return true;
}

function fakeDb(tables: Tables) {
  const fetchRows = async (table: string, query: string): Promise<Row[]> => {
    let rows = (tables[table] ?? []).filter((r) => matches(r, query));
    const order = /(?:^|&)order=id\.(asc|desc)/.exec(query)?.[1];
    if (order) rows = [...rows].sort((a, b) => (Number(a.id) - Number(b.id)) * (order === "asc" ? 1 : -1));
    const limit = /(?:^|&)limit=(\d+)/.exec(query)?.[1];
    if (limit) rows = rows.slice(0, Number(limit));
    return structuredClone(rows);
  };
  const updateRow = async (table: string, query: string, body: Row): Promise<void> => {
    for (const r of tables[table] ?? []) if (matches(r, query)) Object.assign(r, structuredClone(body));
  };
  const insertRow = async (table: string, body: Row): Promise<Row> => {
    (tables[table] ??= []).push(structuredClone(body));
    return body;
  };
  return { fetchRows, updateRow, insertRow };
}

function outbox(over: Row): Row {
  return {
    object_type: "task", object_id: T1, proposal_id: P_UUID, action: "task_assigned", from_status: "offen", to_status: "vergeben",
    actor_wallet: null, actor_role: "proposer", body: null, extra: {}, occurred_at: "2026-10-01T10:00:00+00:00",
    signed_event: null, event_id: null, published_at: null, attempts: 0, last_error: null, seq: 1, ...over,
  };
}

function baseTables(rows: Row[], extra: Tables = {}): Tables {
  return {
    nostr_outbox: rows,
    proposals: [{ id: P_UUID, proposal_id: KEY, proposal_number: 3, title: "Vereinsbus", lifecycle_stage: "in_umsetzung", tally_confirm_opened_at: null }],
    nostr_identities: [],
    nostr_stage_ledger: [],
    proposal_payout_lines: [],
    ...extra,
  };
}

function harness(tables: Tables, failIf: (ev: NostrEvent) => boolean = () => false) {
  const db = fakeDb(tables);
  const published: NostrEvent[] = [];
  const logs: string[] = [];
  let signs = 0;
  let fail = failIf;
  const identities = new Map<string, OrgIdentity>();
  const deps: OutboxDeps = {
    ...db,
    publish: async (ev) => {
      if (fail(ev)) return { ok: false, message: "blocked: test" };
      const dup = published.some((p) => p.id === ev.id);
      published.push(ev);
      return { ok: true, message: dup ? "duplicate: have it" : "" };
    },
    sign: (spec: PublishSpec) => { if (spec.kind === 2101) signs += 1; return signSpec(spec, identities, SECRET, NODE); },
    townPubkey: TOWN,
    now: () => NOW,
    log: (m) => logs.push(m),
  };
  return {
    deps, published, logs,
    get signs() { return signs; },
    setFail(f: (ev: NostrEvent) => boolean) { fail = f; },
  };
}

const tag = (ev: NostrEvent, name: string) => ev.tags.find((t) => t[0] === name)?.[1];

/** A person-signed 2101 that matches outbox({}) (task_assigned on T1, seq 1) under TOWN; `over` replaces tags by name. */
function buildPersonEvent(sk: Uint8Array, over: Record<string, string[][]> = {}): NostrEvent {
  const pk = getPublicKeyHex(sk);
  const base: Record<string, string[][]> = {
    a: [["a", taskAddress(TOWN, T1), "", "object"], ["a", headAddress(TOWN, KEY), "", "proposal"]],
    action: [["action", "task_assigned"]], from: [["from", "offen"]], to: [["to", "vergeben"]],
    p: [["p", pk, "", "proposer"]], role: [["role", "proposer"]], seq: [["seq", "1"]], occurred_at: [["occurred_at", String(NOW - 5)]],
  };
  const tags = Object.entries({ ...base, ...over }).flatMap(([, v]) => v);
  return buildEvent(sk, 2101, "", { createdAt: NOW - 5, tags });
}

describe("drainOutbox", () => {
  it("records seq_missing for a row without a valid seq", async () => {
    const tables = baseTables([outbox({ id: 1, seq: null })]);
    const h = harness(tables, () => false);
    const r = await drainOutbox(h.deps);
    assert.equal(r.failed, 1);
    assert.equal(tables.nostr_outbox[0].last_error, "seq_missing");
    assert.equal(h.published.length, 0);
  });

  it("signs once and stores the event before publishing; a retry re-sends the same id", async () => {
    const tables = baseTables([outbox({ id: 1 })]);
    const h = harness(tables, () => true);
    const first = await drainOutbox(h.deps);
    assert.equal(first.failed, 1);
    const row = tables.nostr_outbox[0];
    assert.ok(row.signed_event);
    assert.match(String(row.event_id), /^[0-9a-f]{64}$/);
    assert.equal(row.published_at, null);
    assert.equal(row.attempts, 1);
    assert.equal(row.last_error, "blocked: test");

    h.setFail(() => false);
    const second = await drainOutbox(h.deps);
    assert.equal(second.published, 1);
    assert.equal(h.published.length, 1);
    assert.equal(h.published[0].id, row.event_id);
    assert.ok(verifyEvent(h.published[0]));
    assert.equal(h.signs, 1);
    assert.ok(tables.nostr_outbox[0].published_at);
    assert.equal(h.published[0].created_at, NOW);
  });

  it("keeps strict per-object order: a failed row holds back later rows on the same object", async () => {
    const tables = baseTables([
      outbox({ id: 1, action: "task_created", from_status: null, to_status: "offen" }),
      outbox({ id: 2, seq: 2 }),
    ]);
    const h = harness(tables, () => true);
    const first = await drainOutbox(h.deps);
    assert.equal(first.failed, 1);
    assert.equal(first.waiting, 1);
    assert.equal(tables.nostr_outbox[1].signed_event, null);

    h.setFail(() => false);
    const second = await drainOutbox(h.deps);
    assert.equal(second.published, 2);
    const [a, b] = h.published;
    assert.equal(a.id, tables.nostr_outbox[0].event_id);
    assert.equal(tag(a, "prior"), undefined);
    assert.equal(tag(b, "prior"), tables.nostr_outbox[0].event_id);
    assert.ok(safeParseAction(b).ok);
  });

  it("does not block other objects", async () => {
    const tables = baseTables([outbox({ id: 1 }), outbox({ id: 2, object_id: T2 })]);
    const h = harness(tables);
    h.setFail((ev) => ev.tags.some((t) => t[0] === "a" && t[1].endsWith(`:task:${T1}`)));
    const s = await drainOutbox(h.deps);
    assert.deepEqual({ published: s.published, failed: s.failed, waiting: s.waiting }, { published: 1, failed: 1, waiting: 0 });
    assert.ok(tables.nostr_outbox[1].published_at);
    assert.equal(tables.nostr_outbox[0].published_at, null);
  });

  it("publishes no p tag for an actor without an identity", async () => {
    const tables = baseTables([outbox({ id: 1, actor_wallet: WALLET })]);
    const h = harness(tables);
    await drainOutbox(h.deps);
    assert.equal(h.published.length, 1);
    assert.ok(!h.published[0].tags.some((t) => t[0] === "p"));
    assert.ok(!JSON.stringify(h.published[0]).includes(WALLET));
  });

  it("ignores a revoked identity", async () => {
    const tables = baseTables([outbox({ id: 1, actor_wallet: WALLET })], {
      nostr_identities: [{ wallet_address: WALLET, pubkey_hex: ACTOR_PK, revoked_at: "2026-09-01T00:00:00+00:00" }],
    });
    const h = harness(tables);
    await drainOutbox(h.deps);
    assert.ok(!h.published[0].tags.some((t) => t[0] === "p"));
  });

  it("tags an actor with an identity as p with its role (case-insensitive wallet match)", async () => {
    const tables = baseTables([outbox({ id: 1, actor_wallet: WALLET, actor_role: "attester" })], {
      nostr_identities: [{ wallet_address: "0x" + "1".repeat(40).toUpperCase(), pubkey_hex: ACTOR_PK, revoked_at: null }],
    });
    const h = harness(tables);
    await drainOutbox(h.deps);
    assert.deepEqual(h.published[0].tags.find((t) => t[0] === "p"), ["p", ACTOR_PK, "", "attester"]);
  });

  it("publishes NSP-12 transitions exactly once along the legal path, notices first", async () => {
    const tables = baseTables([
      outbox({ id: 1, object_type: "proposal", object_id: P_UUID, action: "stage_changed", from_status: "auszaehlung", to_status: "in_umsetzung", actor_role: "system" }),
    ], {
      proposal_payout_lines: [
        { proposal_id: P_UUID, status: "bestaetigt", tx_hash: "0x" + "d".repeat(64) },
        { proposal_id: P_UUID, status: "geplant", tx_hash: null },
      ],
    });
    const h = harness(tables);
    const s1 = await drainOutbox(h.deps);
    assert.equal(s1.transitions, 2);
    const after2101 = h.published.slice(1);
    assert.equal(h.published[0].kind, 2101);
    assert.deepEqual(after2101.map((e) => e.kind), [32102, 2100, 2100]);
    assert.equal(tag(after2101[0], "d"), `gemeinschaftskasse:${KEY}:beschluss`);
    assert.deepEqual([tag(after2101[1], "from"), tag(after2101[1], "to")], ["meinungsbild", "beschlussvorlage"]);
    assert.deepEqual([tag(after2101[2], "from"), tag(after2101[2], "to")], ["beschlussvorlage", "beschlossen"]);
    assert.ok(after2101[2].tags.some((t) => t[0] === "a" && t[3] === "notice" && t[1] === `32102:${TOWN}:gemeinschaftskasse:${KEY}:beschluss`));
    for (const e of after2101.slice(1)) assert.ok(safeParseTransition(e).ok);
    assert.deepEqual(tables.nostr_stage_ledger.map((r) => r.nsp12_stage), ["beschlussvorlage", "beschlossen"]);
    assert.equal(tables.nostr_stage_ledger[1].event_id, after2101[2].id);

    tables.nostr_outbox.push(outbox({ id: 2, seq: 2, object_type: "proposal", object_id: P_UUID, action: "stage_changed", from_status: "in_umsetzung", to_status: "umgesetzt", actor_role: "system" }));
    const before = h.published.length;
    const s2 = await drainOutbox(h.deps);
    assert.equal(s2.transitions, 1);
    const fresh = h.published.slice(before);
    assert.deepEqual(fresh.map((e) => e.kind), [2101, 32102, 2100]);
    assert.equal(tag(fresh[0], "prior"), tables.nostr_outbox[0].event_id);
    assert.equal(tag(fresh[1], "d"), `gemeinschaftskasse:${KEY}:ausgefuehrt`);
    assert.deepEqual(fresh[1].tags.filter((t) => t[0] === "tx"), [["tx", "0x" + "d".repeat(64)]]);
    assert.deepEqual([tag(fresh[2], "from"), tag(fresh[2], "to")], ["beschlossen", "umgesetzt"]);
    assert.equal(tables.nostr_stage_ledger.length, 3);

    const settled = h.published.length;
    const s3 = await drainOutbox(h.deps);
    assert.equal(s3.transitions, 0);
    assert.equal(h.published.length, settled);
  });

  it("retries a failed transition on the next pass without duplicating the ones already recorded", async () => {
    const tables = baseTables([
      outbox({ id: 1, object_type: "proposal", object_id: P_UUID, action: "stage_changed", from_status: "auszaehlung", to_status: "angenommen", actor_role: "system" }),
    ]);
    const h = harness(tables, (ev) => ev.kind === 2100 && tag(ev, "to") === "beschlossen");
    const s1 = await drainOutbox(h.deps);
    assert.equal(s1.transitions, 1);
    assert.equal(tables.nostr_outbox[0].published_at, null, "stage row stays open until its transitions are on the record");
    h.setFail(() => false);
    const s2 = await drainOutbox(h.deps);
    assert.equal(s2.transitions, 1);
    assert.deepEqual(tables.nostr_stage_ledger.map((r) => r.nsp12_stage), ["beschlussvorlage", "beschlossen"]);
    assert.equal(h.published.filter((e) => e.kind === 2100 && tag(e, "to") === "beschlussvorlage").length, 1);
    assert.ok(tables.nostr_outbox[0].published_at);
  });

  it("logs an ALARM when a row reaches 10 attempts", async () => {
    const tables = baseTables([outbox({ id: 1, attempts: 9 })]);
    const h = harness(tables, () => true);
    await drainOutbox(h.deps);
    assert.equal(tables.nostr_outbox[0].attempts, 10);
    assert.ok(h.logs.some((l) => l.includes("ALARM") && l.includes("nostr_outbox 1")));
  });

  it("marks a row whose proposal is missing and blocks its object", async () => {
    const tables = baseTables([outbox({ id: 1, proposal_id: "99999999-9999-4999-8999-999999999999" }), outbox({ id: 2, proposal_id: "99999999-9999-4999-8999-999999999999" })]);
    const h = harness(tables);
    const s = await drainOutbox(h.deps);
    assert.equal(tables.nostr_outbox[0].last_error, "proposal_missing");
    assert.equal(tables.nostr_outbox[0].attempts, 1);
    assert.equal(s.waiting, 1);
    assert.equal(h.published.length, 0);
  });
});

describe("resolvePubkeys", () => {
  it("chunks at 50 wallets and lowercases keys", async () => {
    const wallets = Array.from({ length: 120 }, (_, i) => "0x" + i.toString(16).padStart(40, "0"));
    const queries: string[] = [];
    const map = await resolvePubkeys(async (_t, q) => {
      queries.push(q);
      return q.includes(wallets[0]) ? [{ wallet_address: wallets[0].toUpperCase().replace("0X", "0x"), pubkey_hex: ACTOR_PK }] : [];
    }, [...wallets, "system", null]);
    assert.equal(queries.length, 3);
    assert.ok(queries.every((q) => q.includes("revoked_at=is.null")));
    assert.equal(map.get(wallets[0]), ACTOR_PK);
  });
});

describe("buildSpecs vorhaben", () => {
  it("rebuilds tasks, contract, lines, Bürgervotum and head tags from current rows", async () => {
    const tables: Tables = {
      proposals: [{
        id: P_UUID, proposal_id: KEY, proposal_number: 3, title: "Vereinsbus", vorhaben_enabled: true, lifecycle_stage: "in_umsetzung",
        budget_amount: "150.000000000000000000", budget_asset: "EURe", for_votes: "12", against_votes: "2", abstain_votes: "1",
        tally_confirm_opened_at: "2026-09-28T08:00:00+00:00", updated_at: "2026-09-01T00:00:00+00:00",
      }],
      proposal_tasks: [{
        id: T1, proposal_id: P_UUID, title: "Spende überweisen", description: "", acceptance_criteria: [], reward_amount: "5.000000000000000000",
        reward_asset: "EURe", status: "vergeben", assignee_wallet: WALLET, created_by_wallet: "0x" + "2".repeat(40),
        created_at: "2026-09-29T00:00:00+00:00", updated_at: "2026-10-01T12:00:00+00:00",
      }],
      proposal_contracts: [{ id: "c1", proposal_id: P_UUID, platform_fee_bps: 200, platform_safe_address: "0x" + "3".repeat(40), created_at: "2026-09-29T00:00:00+00:00" }],
      proposal_payout_lines: [
        { id: "l1", contract_id: "c1", proposal_id: P_UUID, role: "aufgabe", recipient_wallet: WALLET, recipient_label: "x", amount: "5.000000000000000000", asset: "EURe", rail: "safe_eure", reference_type: "task", reference_id: T1, status: "geplant", updated_at: "2026-10-01T13:00:00+00:00" },
        { id: "l2", contract_id: "c1", proposal_id: P_UUID, role: "plattform", recipient_wallet: null, recipient_label: "Plattform", amount: "0.5", asset: "EURe", rail: "safe_eure", reference_type: "proposal", reference_id: P_UUID, status: "sendend", updated_at: "2026-10-01T09:00:00+00:00" },
      ],
      proposal_wahlhelfer: [],
      nostr_identities: [{ wallet_address: WALLET, pubkey_hex: ACTOR_PK, revoked_at: null }],
    };
    const db = fakeDb(tables);
    const specs = await buildSpecs({ datasets: ["proposals", "vorhaben"], fetchRows: db.fetchRows, nodeId: NODE, nodeSecret: SECRET, governor: "100:0x5F5e" });
    const kinds = specs.map((s) => s.kind).sort();
    assert.deepEqual(kinds, [32100, 32104, 32108, 32110, 32111]);
    const task = specs.find((s) => s.kind === 32108)!;
    assert.deepEqual(task.tags.find((t) => t[0] === "p"), ["p", ACTOR_PK, "", "assignee"]);
    const contract = specs.find((s) => s.kind === 32110)!;
    assert.deepEqual(contract.tags.find((t) => t[0] === "total"), ["total", "5.5", "EURe"]);
    assert.equal(contract.tags.filter((t) => t[3] === "line").length, 2);
    assert.equal(contract.createdAt, Math.floor(Date.parse("2026-10-01T13:00:00+00:00") / 1000) + 3);
    const head = specs.find((s) => s.kind === 32100)!;
    assert.ok(head.tags.some((t) => t[0] === "vorhaben" && t[1] === "in_umsetzung"));
    assert.ok(head.tags.some((t) => t[3] === "task" && t[1].endsWith(T1)));
    assert.ok(head.createdAt >= task.createdAt);
    assert.ok(specs.every((s) => s.scope === "town"));
  });
});

describe("publishOnce vorhaben", () => {
  it("drains the outbox after the state events over the same client, and a drain error never fails the pass", async () => {
    const tables = baseTables([outbox({ id: 1 })], { proposal_tasks: [], proposal_contracts: [], proposal_wahlhelfer: [] });
    (tables.proposals[0] as Row).vorhaben_enabled = true;
    const db = fakeDb(tables);
    const sent: NostrEvent[] = [];
    let announced: string[] = [];
    const deps = {
      nodeSecret: SECRET, nodeId: NODE, datasets: ["vorhaben"] as ("vorhaben")[], relayUrl: "ws://test",
      fetchRows: db.fetchRows, updateRow: db.updateRow, insertRow: db.insertRow,
      makeClient: () => ({ publish: async (e: NostrEvent) => { sent.push(e); return { ok: true, message: "" }; }, close: () => {} }),
      onPubkeys: async (pks: string[]) => { announced = pks; },
    };
    await publishOnce(deps as never);
    assert.ok(announced.includes(TOWN));
    assert.equal(sent.at(-1)!.kind, 2101);
    assert.ok(tables.nostr_outbox[0].published_at);

    const broken = { ...deps, fetchRows: async (t: string, q: string) => { if (t === "nostr_outbox") throw new Error("boom"); return db.fetchRows(t, q); } };
    const logs: string[] = [];
    await publishOnce({ ...broken, log: (m: string) => logs.push(m) } as never);
    assert.ok(logs.some((l) => l.includes("outbox drain failed: boom")));
  });
});

describe("fix round 1", () => {
  it("re-produces the identical 2100 id when the ledger write failed after relay OK", async () => {
    const tables = baseTables([
      outbox({ id: 1, object_type: "proposal", object_id: P_UUID, action: "stage_changed", from_status: "auszaehlung", to_status: "angenommen", actor_role: "system" }),
    ]);
    const h = harness(tables);
    let failLedger = true;
    const insert = h.deps.insertRow;
    h.deps.insertRow = async (t, b) => { if (t === "nostr_stage_ledger" && failLedger) throw new Error("db down"); return insert(t, b); };
    let clock = NOW;
    h.deps.now = () => clock;
    await drainOutbox(h.deps);
    const first = h.published.filter((e) => e.kind === 2100);
    assert.equal(first.length, 1);
    assert.equal(tables.nostr_stage_ledger.length, 0);
    assert.ok(h.logs.some((l) => l.includes("ALARM nostr_stage_ledger")));

    failLedger = false;
    clock = NOW + 600;
    await drainOutbox(h.deps);
    const again = h.published.filter((e) => e.kind === 2100 && tag(e, "to") === "beschlussvorlage");
    assert.equal(again.length, 2);
    assert.equal(again[1].id, again[0].id);
    assert.deepEqual(tables.nostr_stage_ledger.map((r) => r.nsp12_stage), ["beschlussvorlage", "beschlossen"]);
    assert.ok(tables.nostr_outbox[0].published_at);
  });

  it("logs an ALARM when more than 50 rows wait in one pass", async () => {
    const rows = Array.from({ length: 52 }, (_, i) => outbox({ id: i + 1, seq: i + 1 }));
    const h = harness(baseTables(rows), () => true);
    const s = await drainOutbox(h.deps);
    assert.equal(s.waiting, 51);
    assert.ok(h.logs.some((l) => l.includes("ALARM") && l.includes("51 rows waiting")));
  });

  it("isolates a Vorhaben load failure: other datasets build, no proposal heads", async () => {
    const tables: Tables = {
      accounts: [{ id: "11111111-1111-1111-1111-111111111111", account_type: "organisation", name: "Hafenverein", slug: "hafenverein", updated_at: "2026-07-28T12:00:00+00:00" }],
      events: [{ id: "ev-1", account_id: "11111111-1111-1111-1111-111111111111", title: "Seefest", date: "2026-08-14", time: "19:30:00", status: "approved", updated_at: "2026-07-30T10:00:00+00:00" }],
      proposals: [{ id: P_UUID, proposal_id: KEY, title: "Vereinsbus", vorhaben_enabled: true, updated_at: "2026-09-01T00:00:00+00:00" }],
      nostr_identities: [], account_owners: [],
    };
    const db = fakeDb(tables);
    const logs: string[] = [];
    const fetchRows = async (t: string, q: string) => { if (t === "proposal_tasks") throw new Error("proposal_tasks: PostgREST 400"); return db.fetchRows(t, q); };
    const specs = await buildSpecs({ datasets: ["events", "proposals", "vorhaben"], fetchRows, nodeId: NODE, nodeSecret: SECRET, governor: "100:0x5F5e", log: (m) => logs.push(m) });
    assert.ok(specs.some((s) => s.kind === 31923));
    assert.ok(!specs.some((s) => s.kind === 32100));
    assert.ok(logs.some((l) => l.includes("vorhaben state load failed")));
  });
  describe("person-signed rows", () => {
    const sk = new Uint8Array(32).fill(7);
    const personEvent = () => buildPersonEvent(sk);

    it("waits without signing or attempts until the API attaches the person's event, then relays it verbatim", async () => {
      const tables = baseTables([outbox({ id: 1, person_signed: true, occurred_at: new Date((NOW - 60) * 1000).toISOString() })]);
      const h = harness(tables);
      const first = await drainOutbox(h.deps);
      assert.equal(first.waiting, 1);
      assert.equal(first.failed, 0);
      assert.equal(h.signs, 0);
      assert.equal(h.published.length, 0);
      assert.equal(tables.nostr_outbox[0].attempts, 0);
      assert.equal(tables.nostr_outbox[0].signed_event, null);

      const ev = personEvent();
      Object.assign(tables.nostr_outbox[0], { signed_event: ev, event_id: ev.id });
      const second = await drainOutbox(h.deps);
      assert.equal(second.published, 1);
      assert.equal(h.signs, 0);
      assert.deepEqual(h.published[0], ev);
      assert.ok(tables.nostr_outbox[0].published_at);
    });

    it("blocks later rows of the object while waiting", async () => {
      const tables = baseTables([outbox({ id: 1, person_signed: true }), outbox({ id: 2, seq: 2 })]);
      const h = harness(tables);
      const r = await drainOutbox(h.deps);
      assert.equal(r.waiting, 2);
      assert.equal(h.signs, 0);
      assert.equal(h.published.length, 0);
    });

    it("rejects a stored person event that fails verification", async () => {
      const ev = personEvent();
      const bad = { ...ev, content: "tampered" };
      const tables = baseTables([outbox({ id: 1, person_signed: true, signed_event: bad, event_id: ev.id })]);
      const h = harness(tables);
      const r = await drainOutbox(h.deps);
      assert.equal(r.failed, 1);
      assert.equal(tables.nostr_outbox[0].last_error, "person_event_invalid");
      assert.equal(tables.nostr_outbox[0].attempts, 1);
      assert.equal(h.published.length, 0);
    });

    it("chains the next town row's prior to the person event id", async () => {
      const ev = personEvent();
      const tables = baseTables([
        outbox({ id: 1, person_signed: true, signed_event: ev, event_id: ev.id }),
        outbox({ id: 2, seq: 2, action: "task_cancelled", to_status: "abgebrochen" }),
      ]);
      const h = harness(tables);
      const r = await drainOutbox(h.deps);
      assert.equal(r.published, 2);
      assert.equal(h.signs, 1);
      assert.equal(tag(h.published[1], "prior"), ev.id);
    });

    it("fails on an event_id that differs from the stored person event", async () => {
      const ev = personEvent();
      const tables = baseTables([outbox({ id: 1, person_signed: true, signed_event: ev, event_id: "f".repeat(64) })]);
      const h = harness(tables);
      const r = await drainOutbox(h.deps);
      assert.equal(r.failed, 1);
      assert.equal(tables.nostr_outbox[0].last_error, "person_event_id_mismatch");
      assert.equal(tables.nostr_outbox[0].attempts, 1);
      assert.equal(h.published.length, 0);
    });

    it("rejects a person event of the wrong kind or with the wrong seq", async () => {
      const wrongKind = buildEvent(sk, 1, "", { createdAt: NOW - 5, tags: personEvent().tags });
      const wrongSeq = buildPersonEvent(sk, { seq: [["seq", "2"]] });
      for (const ev of [wrongKind, wrongSeq]) {
        const tables = baseTables([outbox({ id: 1, person_signed: true, signed_event: ev, event_id: ev.id })]);
        const h = harness(tables);
        const r = await drainOutbox(h.deps);
        assert.equal(r.failed, 1);
        assert.equal(tables.nostr_outbox[0].last_error, "person_event_invalid");
        assert.equal(h.published.length, 0);
      }
    });

    it("never overwrites a person event the API attached while the town row was being signed", async () => {
      const tables = baseTables([outbox({ id: 1 })]);
      const h = harness(tables);
      const ev = personEvent();
      const realUpdate = h.deps.updateRow;
      let raced = false;
      h.deps.updateRow = async (table, query, body) => {
        if (!raced && table === "nostr_outbox" && "signed_event" in body) {
          raced = true;
          // The API's conditional attach lands between the publisher's read and its store.
          Object.assign(tables.nostr_outbox[0], { signed_event: ev, event_id: ev.id, person_signed: true });
          assert.ok(query.includes("signed_event=is.null"));
        }
        return realUpdate(table, query, body);
      };
      const r = await drainOutbox(h.deps);
      assert.equal(r.published, 1);
      assert.deepEqual(tables.nostr_outbox[0].signed_event, ev);
      assert.equal(tables.nostr_outbox[0].event_id, ev.id);
      assert.deepEqual(h.published, [ev]);
      assert.ok(tables.nostr_outbox[0].published_at);
    });

    it("emits no warning while waiting under 15 minutes", async () => {
      const tables = baseTables([outbox({ id: 1, person_signed: true, occurred_at: new Date((NOW - 14 * 60) * 1000).toISOString() })]);
      const h = harness(tables);
      await drainOutbox(h.deps);
      assert.equal(h.logs.filter((l) => l.includes("WARNING")).length, 0);
    });

    it("signs via the town path when person_signed was flipped back to false", async () => {
      const tables = baseTables([outbox({ id: 1, person_signed: false })]);
      const h = harness(tables);
      const r = await drainOutbox(h.deps);
      assert.equal(r.published, 1);
      assert.equal(h.signs, 1);
      assert.equal(h.published[0].pubkey, TOWN);
    });

    it("warns once per pass about rows waiting longer than 15 minutes", async () => {
      const old = new Date((NOW - 16 * 60) * 1000).toISOString();
      const tables = baseTables([
        outbox({ id: 1, person_signed: true, occurred_at: old }),
        outbox({ id: 2, object_id: T2, person_signed: true, occurred_at: old }),
      ]);
      const h = harness(tables);
      await drainOutbox(h.deps);
      assert.equal(h.logs.filter((l) => l.includes("WARNING")).length, 1);
    });
  });
});

describe("fix round 2: seq order (M1)", () => {
  it("publishes in seq order when ids are inverted and chains prior to seq - 1", async () => {
    // Concurrent inserts: id 1 got seq 2, id 2 got seq 1.
    const tables = baseTables([
      outbox({ id: 1, seq: 2 }),
      outbox({ id: 2, seq: 1, action: "task_created", from_status: null, to_status: "offen" }),
    ]);
    const h = harness(tables);
    const r = await drainOutbox(h.deps);
    assert.equal(r.published, 2);
    const [first, second] = h.published;
    assert.equal(tag(first, "seq"), "1");
    assert.equal(tag(first, "prior"), undefined);
    assert.equal(tag(second, "seq"), "2");
    assert.equal(tag(second, "prior"), first.id);
  });

  it("chains to seq - 1, not to the last row published by id", async () => {
    const published = "a".repeat(64);
    const later = "b".repeat(64);
    const tables = baseTables([
      outbox({ id: 5, seq: 1, published_at: "2026-10-01T10:00:00+00:00", event_id: published }),
      outbox({ id: 9, seq: 3, published_at: "2026-10-01T10:05:00+00:00", event_id: later }),
      outbox({ id: 7, seq: 2 }),
    ]);
    const h = harness(tables);
    await drainOutbox(h.deps);
    assert.equal(h.published.length, 1);
    assert.equal(tag(h.published[0], "prior"), published);
  });

  it("waits (no attempt) while the seq - 1 predecessor is unpublished outside the batch", async () => {
    const tables = baseTables([outbox({ id: 1, seq: 2 }), outbox({ id: 2, seq: 1 })]);
    const h = harness(tables);
    // Batch of one: only id 1 (seq 2) is fetched; its predecessor is not on the record.
    const r = await drainOutbox(h.deps, 1);
    assert.equal(r.waiting, 1);
    assert.equal(r.failed, 0);
    assert.equal(h.published.length, 0);
    assert.equal(tables.nostr_outbox[0].attempts, 0);
    assert.equal(tables.nostr_outbox[0].signed_event, null);
  });

  it("fails predecessor_missing for a gap in the chain", async () => {
    const tables = baseTables([outbox({ id: 1, seq: 3 })]);
    const h = harness(tables);
    const r = await drainOutbox(h.deps);
    assert.equal(r.failed, 1);
    assert.equal(tables.nostr_outbox[0].last_error, "predecessor_missing");
  });

  it("keeps seq_missing for pre-migration rows without seq", async () => {
    const tables = baseTables([outbox({ id: 1, seq: undefined }), outbox({ id: 2, seq: null })]);
    const h = harness(tables);
    const r = await drainOutbox(h.deps);
    assert.equal(r.failed, 1);
    assert.equal(r.waiting, 1);
    assert.equal(tables.nostr_outbox[0].last_error, "seq_missing");
  });
});

describe("fix round 2: person events must describe their row (I2)", () => {
  const sk = new Uint8Array(32).fill(9);
  const OTHER_TOWN = "f".repeat(64);
  const cases: Array<[string, Record<string, string[][]>]> = [
    ["object address under another town key", { a: [["a", taskAddress(OTHER_TOWN, T1), "", "object"], ["a", headAddress(TOWN, KEY), "", "proposal"]] }],
    ["proposal address under another town key", { a: [["a", taskAddress(TOWN, T1), "", "object"], ["a", headAddress(OTHER_TOWN, KEY), "", "proposal"]] }],
    ["another object", { a: [["a", taskAddress(TOWN, T2), "", "object"], ["a", headAddress(TOWN, KEY), "", "proposal"]] }],
    ["action", { action: [["action", "task_cancelled"]] }],
    ["to", { to: [["to", "abgebrochen"]] }],
    ["first p tag", { p: [["p", ACTOR_PK, "", "proposer"], ["p", getPublicKeyHex(sk), "", "proposer"]] }],
  ];
  for (const [name, over] of cases) {
    it(`does not relay a person event with a mismatched ${name}; the town key signs the same seq`, async () => {
      const ev = buildPersonEvent(sk, over);
      const tables = baseTables([outbox({ id: 1, person_signed: true, signed_event: ev, event_id: ev.id })]);
      const h = harness(tables);
      const r = await drainOutbox(h.deps);
      assert.equal(r.published, 1);
      assert.equal(h.published.length, 1);
      assert.notEqual(h.published[0].id, ev.id);
      assert.equal(h.published[0].pubkey, TOWN);
      assert.equal(tag(h.published[0], "seq"), "1");
      const row = tables.nostr_outbox[0];
      assert.equal(row.person_signed, false);
      assert.equal(row.event_id, h.published[0].id);
      assert.ok(row.published_at);
      assert.ok(h.logs.some((l) => l.startsWith("RELEASED nostr_outbox 1") && l.includes("person_event_mismatch")));
    });
  }

  it("relays a matching person event verbatim", async () => {
    const ev = buildPersonEvent(sk);
    const tables = baseTables([outbox({ id: 1, person_signed: true, signed_event: ev, event_id: ev.id })]);
    const h = harness(tables);
    await drainOutbox(h.deps);
    assert.deepEqual(h.published, [ev]);
    assert.equal(h.signs, 0);
  });

  it("releases a mismatched person event the API attached during the town store race", async () => {
    const tables = baseTables([outbox({ id: 1 })]);
    const h = harness(tables);
    const ev = buildPersonEvent(sk, { action: [["action", "task_cancelled"]] });
    const realUpdate = h.deps.updateRow;
    let raced = false;
    h.deps.updateRow = async (table, query, body) => {
      if (!raced && table === "nostr_outbox" && body.signed_event) {
        raced = true;
        Object.assign(tables.nostr_outbox[0], { signed_event: ev, event_id: ev.id, person_signed: true });
      }
      return realUpdate(table, query, body);
    };
    const r = await drainOutbox(h.deps);
    assert.equal(r.published, 1);
    assert.equal(h.published.length, 1);
    assert.equal(h.published[0].pubkey, TOWN);
    assert.equal(tables.nostr_outbox[0].person_signed, false);
    assert.equal(tables.nostr_outbox[0].event_id, h.published[0].id);
  });

  it("fails without re-signing when the row changed before the release", async () => {
    const ev = buildPersonEvent(sk, { action: [["action", "task_cancelled"]] });
    const tables = baseTables([outbox({ id: 1, person_signed: true, signed_event: ev, event_id: ev.id })]);
    const h = harness(tables);
    const realUpdate = h.deps.updateRow;
    h.deps.updateRow = async (table, query, body) => {
      if (body.person_signed === false) tables.nostr_outbox[0].event_id = "d".repeat(64); // someone else rewrote it
      return realUpdate(table, query, body);
    };
    const r = await drainOutbox(h.deps);
    assert.equal(r.failed, 1);
    assert.equal(h.published.length, 0);
    assert.equal(h.signs, 0);
    assert.match(String(tables.nostr_outbox[0].last_error), /^person_event_mismatch/);
  });
});

describe("fix round 2: a person event the relay keeps blocking (I1)", () => {
  const sk = new Uint8Array(32).fill(11);
  const blockedPerson = (ev: NostrEvent) => ev.pubkey !== TOWN;

  it("releases after 3 blocked passes and town-signs the same seq; later rows follow", async () => {
    const ev = buildPersonEvent(sk);
    const tables = baseTables([
      outbox({ id: 1, person_signed: true, signed_event: ev, event_id: ev.id }),
      outbox({ id: 2, seq: 2, action: "task_cancelled", to_status: "abgebrochen" }),
    ]);
    const h = harness(tables);
    const realPublish = h.deps.publish;
    h.deps.publish = async (e) => (blockedPerson(e) ? { ok: false, message: "blocked: only Röbel / Müritz members may publish to this relay" } : realPublish(e));

    for (const n of [1, 2]) {
      const r = await drainOutbox(h.deps);
      assert.equal(r.published, 0);
      assert.equal(r.waiting, 1);
      assert.match(String(tables.nostr_outbox[0].last_error), new RegExp(`^person_blocked ${n}/3: blocked:`));
      assert.equal(tables.nostr_outbox[0].person_signed, true);
    }
    const r3 = await drainOutbox(h.deps);
    assert.equal(r3.published, 2);
    const row = tables.nostr_outbox[0];
    assert.equal(row.person_signed, false);
    assert.equal(h.published[0].pubkey, TOWN);
    assert.equal(tag(h.published[0], "seq"), "1");
    assert.equal(row.event_id, h.published[0].id);
    assert.equal(tag(h.published[1], "prior"), h.published[0].id);
    assert.ok(h.logs.some((l) => l.startsWith("RELEASED nostr_outbox 1") && l.includes("person_event_blocked")));
  });

  it("keeps retrying the person event on rate limits and network errors", async () => {
    const ev = buildPersonEvent(sk);
    const tables = baseTables([outbox({ id: 1, person_signed: true, signed_event: ev, event_id: ev.id, attempts: 5, last_error: "person_blocked 2/3: blocked: x" })]);
    const h = harness(tables);
    let message = "rate-limited: slow down";
    h.deps.publish = async () => { if (message === "throw") throw new Error("socket hang up"); return { ok: false, message }; };
    await drainOutbox(h.deps);
    assert.equal(tables.nostr_outbox[0].last_error, "rate-limited: slow down");
    message = "throw";
    for (let i = 0; i < 4; i++) await drainOutbox(h.deps);
    assert.equal(tables.nostr_outbox[0].person_signed, true);
    assert.deepEqual(tables.nostr_outbox[0].signed_event, ev);
    assert.equal(h.signs, 0);
  });

  it("a non-blocked failure resets the streak", async () => {
    const ev = buildPersonEvent(sk);
    const tables = baseTables([outbox({ id: 1, person_signed: true, signed_event: ev, event_id: ev.id, last_error: "rate-limited: x" })]);
    const h = harness(tables);
    h.deps.publish = async () => ({ ok: false, message: "blocked: nope" });
    await drainOutbox(h.deps);
    assert.match(String(tables.nostr_outbox[0].last_error), /^person_blocked 1\/3/);
  });

  it("never releases a town-signed row that is blocked", async () => {
    const tables = baseTables([outbox({ id: 1, last_error: "person_blocked 2/3: blocked: x" })]);
    const h = harness(tables, () => true);
    await drainOutbox(h.deps);
    assert.equal(tables.nostr_outbox[0].last_error, "blocked: test");
    assert.equal(h.signs, 1);
  });
});
