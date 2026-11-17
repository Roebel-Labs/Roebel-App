import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { Address, Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { InMemoryCredentialStore } from "../src/lib/credentials/store";
import {
  createPresentation,
  resolvePresentation,
  showMessage,
  SHOW_SCOPE,
  SHOW_TTL_SECONDS,
  type Presentation,
  type PresentationDeps,
} from "../src/lib/credentials/presentations";
import { CODE_ALPHABET } from "../src/lib/chat/pairing";
import type { Caller } from "../src/lib/credentials/caller";
import { keccak256, recoverMessageAddress, toHex } from "viem";
import { buildTree, leafHash, signClaim, type Leaf } from "@netizen-labs/credential-registry";

const REGISTRY = "0x00000000000000000000000000000000000000c1" as Address;

const TYPE = `0x${"ab".repeat(32)}` as Hex;
const T0 = Date.parse("2026-11-17T10:00:00Z");
const holder = privateKeyToAccount(generatePrivateKey());
const HOLDER = holder.address.toLowerCase() as Address;
const OTHER = "0x00000000000000000000000000000000000000b2";

const caller = (wallet: string, action: Caller["action"], via: Caller["via"] = "signature"): Caller => ({ ok: true, wallet, via, action, payload: {} });

function world() {
  const store = new InMemoryCredentialStore();
  let now = T0;
  const d: PresentationDeps = {
    store,
    registry: REGISTRY,
    now: () => now,
    verifySignature: async (wallet, message, signature) => {
      try {
        return (await recoverMessageAddress({ message, signature: signature as Hex })).toLowerCase() === wallet.toLowerCase();
      } catch {
        return false;
      }
    },
  };
  return { store, d, setNow: (t: number) => (now = t) };
}

async function presentation(issuedAtSec = T0 / 1000, signer = holder): Promise<Presentation> {
  const nonce = "n0nce-123456";
  const accountSignature = await signer.signMessage({ message: showMessage({ typeId: TYPE, account: HOLDER, issuedAtSec, nonce }) });
  return { v: 1, typeId: TYPE, account: HOLDER, issuedAtSec, nonce, accountSignature };
}

test("showMessage has the fixed format", () => {
  assert.equal(SHOW_SCOPE, "roebel-credential-show-v1");
  assert.equal(SHOW_TTL_SECONDS, 300);
  assert.equal(
    showMessage({ typeId: TYPE, account: "0xABCDEF0000000000000000000000000000000001", issuedAtSec: 5, nonce: "x" }),
    `roebel-credential-show-v1:${TYPE}:0xabcdef0000000000000000000000000000000001:5:x`,
  );
});

test("present_create refuses a presentation for another account", async () => {
  const w = world();
  const r = await createPresentation(w.d, caller(OTHER, "present_create"), await presentation());
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.status, 403);
  assert.equal(w.store.presentations.size, 0);
});

test("present_resolve verifies the signature, returns the age and deletes the code", async () => {
  const w = world();
  const p = await presentation();
  const created = await createPresentation(w.d, caller(HOLDER, "present_create"), p);
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const { code, expiresAt } = created.data;
  assert.equal(code.length, 12);
  for (const ch of code) assert.ok(CODE_ALPHABET.includes(ch));
  assert.equal(expiresAt, new Date(T0 + 300_000).toISOString());
  // stored by hash only
  assert.ok(w.store.presentations.has(createHash("sha256").update(code).digest("hex")));
  assert.equal([...w.store.presentations.keys()].includes(code), false);

  w.setNow(T0 + 42_000);
  const r = await resolvePresentation(w.d, caller(OTHER, "present_resolve", "chat_session"), { code: `${code.slice(0, 4).toLowerCase()}-${code.slice(4)}` });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.data.signatureValid, true);
  assert.equal(r.data.ageSeconds, 42);
  assert.equal(r.data.presentation.account, HOLDER);
  const json = JSON.stringify(r.data);
  assert.equal(/displayName|avatar/i.test(json), false);

  const again = await resolvePresentation(w.d, caller(OTHER, "present_resolve"), { code });
  assert.equal(again.ok, false);
  if (!again.ok) assert.equal(again.status, 404);
});

test("a forged signature resolves with signatureValid false", async () => {
  const w = world();
  const p = await presentation(T0 / 1000, privateKeyToAccount(generatePrivateKey()));
  const created = await createPresentation(w.d, caller(HOLDER, "present_create"), p);
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const r = await resolvePresentation(w.d, caller(OTHER, "present_resolve"), { code: created.data.code });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.data.signatureValid, false);
});

test("a presentation older than 300 s is gone", async () => {
  const w = world();
  const created = await createPresentation(w.d, caller(HOLDER, "present_create"), await presentation());
  assert.equal(created.ok, true);
  if (!created.ok) return;
  w.setNow(T0 + 301_000);
  const r = await resolvePresentation(w.d, caller(OTHER, "present_resolve"), { code: created.data.code });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.status, 404);
  // a presentation issued long ago is refused at create time
  const stale = await createPresentation(w.d, caller(HOLDER, "present_create"), await presentation(T0 / 1000 - 400));
  assert.equal(stale.ok, false);
});

// ── the private part ─────────────────────────────────────────────────────────

const claimKey = generatePrivateKey();
const CLAIM_SUBJECT = privateKeyToAccount(claimKey).address.toLowerCase() as Address;
const OTHER_WALLET = "0x00000000000000000000000000000000000000b3" as Address;

async function privateWorld() {
  const w = world();
  const leaves: Record<"mine" | "other" | "claim", Leaf> = {
    mine: { kind: "account", typeId: TYPE, subject: HOLDER, validUntil: 0n, salt: keccak256(toHex("s1")) },
    other: { kind: "account", typeId: TYPE, subject: OTHER_WALLET, validUntil: 0n, salt: keccak256(toHex("s2")) },
    claim: { kind: "claimKey", typeId: TYPE, subject: CLAIM_SUBJECT, validUntil: 0n, salt: keccak256(toHex("s3")) },
  };
  const hashes = Object.fromEntries(Object.entries(leaves).map(([k, l]) => [k, leafHash(l).toLowerCase() as Hex])) as Record<keyof typeof leaves, Hex>;
  const tree = buildTree(Object.values(hashes));
  const batchId = "55555555-5555-4555-8555-000000000001";
  await w.store.insertBatchWithInvitations(
    { id: batchId, actionId: null, typeId: TYPE, root: tree.root, count: 3, source: "people" },
    (Object.keys(leaves) as (keyof typeof leaves)[]).map((k, i) => ({
      id: `55555555-5555-4555-8555-00000000010${i}`, typeId: TYPE, leafKind: leaves[k].kind === "account" ? "account" : "claim_key",
      subject: leaves[k].subject, validUntil: "0", salt: leaves[k].salt, leafHash: hashes[k], proof: tree.proofOf(hashes[k]),
      claimKeyEnc: null, tokenHash: null, tokenEnc: null, recipientWallet: null, displayName: null, contactEmail: null, status: "accepted" as const,
    })),
  );
  await w.store.updateBatch(batchId, { status: "onchain", chainBatchId: "9" });
  const part = async (k: keyof typeof leaves, account: Address = HOLDER) => ({
    batchId: "9",
    leaf: { kind: leaves[k].kind, typeId: TYPE, subject: leaves[k].subject, validUntil: "0", salt: leaves[k].salt },
    proof: tree.proofOf(hashes[k]),
    claimSignature: leaves[k].kind === "claimKey" ? await signClaim(claimKey, { chainId: 100, registry: REGISTRY, batchId: 9n, leaf: hashes[k], account }) : null,
  });
  return { ...w, part, hashes, batchId };
}

test("a private part with the presenter's own account leaf and proof is accepted", async () => {
  const w = await privateWorld();
  const r = await createPresentation(w.d, caller(HOLDER, "present_create"), { ...(await presentation()), private: await w.part("mine") });
  assert.equal(r.ok, true, JSON.stringify(r));
  const c = await createPresentation(w.d, caller(HOLDER, "present_create"), { ...(await presentation()), private: await w.part("claim") });
  assert.equal(c.ok, true, JSON.stringify(c));
});

test("a foreign account leaf is refused", async () => {
  const w = await privateWorld();
  const r = await createPresentation(w.d, caller(HOLDER, "present_create"), { ...(await presentation()), private: await w.part("other") });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.code, "PROOF_INVALID");
});

test("a claim-key leaf with a signature copied from another account is refused", async () => {
  const w = await privateWorld();
  const copied = await w.part("claim", OTHER_WALLET);
  const r = await createPresentation(w.d, caller(HOLDER, "present_create"), { ...(await presentation()), private: copied });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.code, "PROOF_INVALID");
  const none = await createPresentation(w.d, caller(HOLDER, "present_create"), { ...(await presentation()), private: { ...copied, claimSignature: null } });
  assert.equal(none.ok, false);
});

test("a bad proof, an unknown batch or a revoked leaf is refused", async () => {
  const w = await privateWorld();
  const good = await w.part("mine");
  const badProof = await createPresentation(w.d, caller(HOLDER, "present_create"), { ...(await presentation()), private: { ...good, proof: [keccak256(toHex("x"))] } });
  assert.equal(badProof.ok, false);
  if (!badProof.ok) assert.equal(badProof.code, "PROOF_INVALID");
  const unknown = await createPresentation(w.d, caller(HOLDER, "present_create"), { ...(await presentation()), private: { ...good, batchId: "10" } });
  assert.equal(unknown.ok, false);
  await w.store.updateInvitations({ batchId: w.batchId, leafHash: w.hashes.mine }, { status: "revoked" });
  const revoked = await createPresentation(w.d, caller(HOLDER, "present_create"), { ...(await presentation()), private: good });
  assert.equal(revoked.ok, false);
  if (!revoked.ok) assert.equal(revoked.status, 410);
  assert.equal(w.store.presentations.size, 0);
});

test("purgeExpiredPresentations deletes only rows whose time ran out", async () => {
  const store = new InMemoryCredentialStore();
  const now = Date.parse("2026-11-17T10:00:00Z");
  await store.putPresentation({ codeHash: "old", payload: {}, expiresAt: new Date(now - 1000).toISOString() });
  await store.putPresentation({ codeHash: "live", payload: {}, expiresAt: new Date(now + 60_000).toISOString() });
  assert.equal(await store.purgeExpiredPresentations(now), 1);
  assert.deepEqual([...store.presentations.keys()], ["live"]);
});

test("a private part whose invitation is not accepted (declined or still open) is refused", async () => {
  const w = await privateWorld();
  for (const status of ["declined", "invited"] as const) {
    await w.store.updateInvitations({ batchId: w.batchId, leafHash: w.hashes.mine }, { status });
    const r = await createPresentation(w.d, caller(HOLDER, "present_create"), { ...(await presentation()), private: await w.part("mine") });
    assert.equal(r.ok, false, status);
    if (!r.ok) assert.equal(r.code, "PROOF_INVALID");
  }
  assert.equal(w.store.presentations.size, 0);
});
