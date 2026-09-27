/**
 * Passkey key backup: proof text (byte-exact vector shared with Expo), owner-only read/write,
 * no silent overwrite, fail-closed errors.
 * Run: cd apps/web && npx tsx --test src/lib/passkey/__tests__/key-backup.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyMessage, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { handleKeyBackupGet, handleKeyBackupPut, type KeyBackupDeps } from "../key-backup-handler";
import { buildKeyBackupProofMessage, keyBackupContent, keyBackupContentHash, type KeyBackupSlot } from "../key-backup-proof";
import { InMemoryKeyBackupStore, KeyBackupStoreError, type KeyBackupStore } from "../key-backup-store";
import { PASSKEY_KEY_BACKUP_TABLE, SupabaseKeyBackupStore } from "../key-backup-store-supabase";
import vector from "./key-backup-vector.json";

const NOW = 1_790_000_000;
const owner = privateKeyToAccount(`0x${"11".repeat(32)}`);
const stranger = privateKeyToAccount(`0x${"22".repeat(32)}`);
const ID = owner.address.toLowerCase() as Address;
const MACI = `pkv1:${"A".repeat(120)}`;
const NOSTR = `pkv1:${"B".repeat(80)}`;

/** Stand-in for verifyAccountSignature: the real rule is tested in lib/auth; here only "the identity signed THIS text". */
const eoaVerify: KeyBackupDeps["verify"] = ({ address, message, signature }) => verifyMessage({ address, message, signature });

function deps(over: Partial<KeyBackupDeps> = {}, store: KeyBackupStore = new InMemoryKeyBackupStore()): KeyBackupDeps {
  return { enabled: true, store, verify: eoaVerify, nowSec: () => NOW, ...over };
}

const post = (body: unknown) => new Request("http://x/api", { method: "POST", body: JSON.stringify(body) });

async function readProof(signer = owner, timestamp = NOW) {
  return { timestamp, signature: await signer.signMessage({ message: buildKeyBackupProofMessage({ action: "read", identity: ID, timestamp }) }) };
}
async function writeProof(blobs: Partial<Record<KeyBackupSlot, string>>, replace = false, signer = owner, timestamp = NOW) {
  const message = buildKeyBackupProofMessage({ action: "write", identity: ID, timestamp, contentHash: keyBackupContentHash(blobs, replace) });
  return { timestamp, signature: await signer.signMessage({ message }) };
}

test("vector: proof texts are byte-exact with apps/expo (key-backup-vector.json)", () => {
  const id = vector.identity as Address;
  assert.equal(keyBackupContent(vector.blobs, false), vector.content);
  assert.equal(keyBackupContentHash(vector.blobs, false), vector.contentHash);
  assert.equal(buildKeyBackupProofMessage({ action: "read", identity: id, timestamp: vector.timestamp }), vector.readMessage);
  assert.equal(
    buildKeyBackupProofMessage({ action: "write", identity: id, timestamp: vector.timestamp, contentHash: vector.contentHash }),
    vector.writeMessage,
  );
});

test("disabled → 503 before anything else", async () => {
  const r = await handleKeyBackupGet(post({}), { enabled: false } as KeyBackupDeps);
  assert.equal(r.status, 503);
  assert.deepEqual(await r.json(), { error: "disabled" });
});

test("no store configured → 503 store_unavailable (never an in-memory backup)", async () => {
  const r = await handleKeyBackupPut(post({}), deps({ store: null }));
  assert.equal(r.status, 503);
  assert.deepEqual(await r.json(), { error: "store_unavailable" });
});

test("owner writes, then reads back; empty backup reads as {}", async () => {
  const d = deps();
  let r = await handleKeyBackupGet(post({ identity: ID, proof: await readProof() }), d);
  assert.deepEqual(await r.json(), { blobs: {} });
  const blobs = { maci: MACI, nostr: NOSTR };
  r = await handleKeyBackupPut(post({ identity: ID, blobs, proof: await writeProof(blobs) }), d);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true, stored: ["maci", "nostr"] });
  r = await handleKeyBackupGet(post({ identity: ID.toUpperCase().replace("0X", "0x"), proof: await readProof() }), d);
  assert.deepEqual(await r.json(), { blobs });
});

test("a stranger can neither read nor write", async () => {
  const store = new InMemoryKeyBackupStore();
  await store.put(ID, { maci: MACI });
  const d = deps({}, store);
  let r = await handleKeyBackupGet(post({ identity: ID, proof: await readProof(stranger) }), d);
  assert.equal(r.status, 401);
  const blobs = { maci: NOSTR };
  r = await handleKeyBackupPut(post({ identity: ID, blobs, replace: true, proof: await writeProof(blobs, true, stranger) }), d);
  assert.equal(r.status, 401);
  assert.deepEqual(await store.get(ID), { maci: MACI });
});

test("the write proof binds the content: other blobs or replace flag under the same signature fail", async () => {
  const d = deps();
  const proof = await writeProof({ maci: MACI });
  let r = await handleKeyBackupPut(post({ identity: ID, blobs: { maci: NOSTR }, proof }), d);
  assert.equal(r.status, 401);
  r = await handleKeyBackupPut(post({ identity: ID, blobs: { maci: MACI }, replace: true, proof }), d);
  assert.equal(r.status, 401);
  // A read proof is not a write proof.
  r = await handleKeyBackupPut(post({ identity: ID, blobs: { maci: MACI }, proof: await readProof() }), d);
  assert.equal(r.status, 401);
});

test("never silently overwrites a different blob; replace:true does; same blob is idempotent", async () => {
  const store = new InMemoryKeyBackupStore();
  await store.put(ID, { maci: MACI });
  const d = deps({}, store);
  const other = `pkv1:${"C".repeat(120)}`;
  let r = await handleKeyBackupPut(post({ identity: ID, blobs: { maci: other, nostr: NOSTR }, proof: await writeProof({ maci: other, nostr: NOSTR }) }), d);
  assert.equal(r.status, 409);
  assert.deepEqual(await r.json(), { error: "exists", slots: ["maci"] });
  assert.deepEqual(await store.get(ID), { maci: MACI }, "nothing written on conflict");
  r = await handleKeyBackupPut(post({ identity: ID, blobs: { maci: MACI }, proof: await writeProof({ maci: MACI }) }), d);
  assert.equal(r.status, 200);
  r = await handleKeyBackupPut(post({ identity: ID, blobs: { maci: other }, replace: true, proof: await writeProof({ maci: other }, true) }), d);
  assert.equal(r.status, 200);
  assert.deepEqual(await store.get(ID), { maci: other });
});

test("stale proof → 401 proof_expired", async () => {
  const r = await handleKeyBackupGet(post({ identity: ID, proof: await readProof(owner, NOW - 601) }), deps());
  assert.deepEqual([r.status, await r.json()], [401, { error: "proof_expired" }]);
});

test("malformed bodies → 400", async () => {
  const d = deps();
  const proof = await readProof();
  for (const body of [
    { identity: "nope", proof },
    { identity: ID },
    { identity: ID, proof: { timestamp: "1", signature: proof.signature } },
  ]) {
    assert.equal((await handleKeyBackupGet(post(body), d)).status, 400);
  }
  for (const blobs of [{}, { other: MACI }, { maci: "raw-secret" }, { maci: `pkv2:${"A".repeat(60)}` }, [MACI]]) {
    assert.equal((await handleKeyBackupPut(post({ identity: ID, blobs, proof }), d)).status, 400);
  }
  assert.equal((await handleKeyBackupPut(post({ identity: ID, blobs: { maci: MACI }, replace: "yes", proof }), d)).status, 400);
});

test("verifier transport failure → 503 chain_unavailable; store failure → 503 store_unavailable", async () => {
  let r = await handleKeyBackupGet(post({ identity: ID, proof: await readProof() }), deps({ verify: async () => { throw new Error("rpc"); } }));
  assert.deepEqual([r.status, await r.json()], [503, { error: "chain_unavailable" }]);
  const failing: KeyBackupStore = { get: async () => { throw new KeyBackupStoreError("get"); }, put: async () => {} };
  r = await handleKeyBackupGet(post({ identity: ID, proof: await readProof() }), deps({}, failing));
  assert.deepEqual([r.status, await r.json()], [503, { error: "store_unavailable" }]);
});

test("SupabaseKeyBackupStore touches only passkey_key_backups and upserts on (identity_address, slot)", async () => {
  const calls: Array<{ table: string; op: string; arg?: unknown; opts?: unknown }> = [];
  const db = {
    from(table: string) {
      const q: any = {
        select: () => q,
        eq: (_c: string, v: string) => {
          calls.push({ table, op: "select", arg: v });
          return Promise.resolve({ data: [{ slot: "maci", blob: MACI }, { slot: "junk", blob: "x" }], error: null });
        },
        upsert: (rows: unknown, opts: unknown) => {
          calls.push({ table, op: "upsert", arg: rows, opts });
          return Promise.resolve({ error: null });
        },
      };
      return q;
    },
  };
  const s = new SupabaseKeyBackupStore(db as any);
  assert.deepEqual(await s.get("0xABCDEF0000000000000000000000000000000001"), { maci: MACI });
  await s.put("0xABCDEF0000000000000000000000000000000001", { nostr: NOSTR });
  assert.ok(calls.every((c) => c.table === PASSKEY_KEY_BACKUP_TABLE));
  assert.equal(calls[0].arg, "0xabcdef0000000000000000000000000000000001");
  const up = calls[1];
  assert.deepEqual(up.opts, { onConflict: "identity_address,slot" });
  assert.equal((up.arg as Array<{ identity_address: string; slot: string; blob: string }>)[0].blob, NOSTR);
});

test("the signed message is a plain EIP-191 text (what account.signMessage signs)", async () => {
  const sig: Hex = await owner.signMessage({ message: vector.readMessage });
  assert.equal(await verifyMessage({ address: owner.address, message: vector.readMessage, signature: sig }), true);
});
