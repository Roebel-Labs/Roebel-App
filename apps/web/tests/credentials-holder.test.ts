import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { orgIdFromUuid } from "@netizen-labs/protocol";
import { credentialTypeId, leafHash, recoverClaimSigner } from "@netizen-labs/credential-registry";
import { keccak256, toHex, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { InMemoryCredentialStore, type NewInvitation, type TypeRow } from "../src/lib/credentials/store";
import { holdings, ME_ACTIONS, mine, redeem, respond, type HolderDeps } from "../src/lib/credentials/holder";
import { authenticateCaller } from "../src/lib/credentials/caller";
import { sealSecret } from "../src/lib/credentials/secrets";
import type { Caller } from "../src/lib/credentials/caller";

process.env.CREDENTIAL_SECRETS_KEY = randomBytes(32).toString("base64");

const REGISTRY = "0x00000000000000000000000000000000000000c1" as Address;
const VEREIN = "6f1c2a7e-0d3b-4c55-9a1e-2b3c4d5e6f70";
const FRAKTION = "7a2d3b8f-1e4c-4d66-8b2f-3c4d5e6f7081";
const OWNER = "0x00000000000000000000000000000000000000a1";
const ALICE = "0x00000000000000000000000000000000000000b1";
const BOB = "0x00000000000000000000000000000000000000b2";
const T0 = Date.parse("2026-11-17T10:00:00Z");

const typeIdOf = (account: string, local: string) => credentialTypeId(orgIdFromUuid(account) as Hex, keccak256(toHex(local))).toLowerCase() as Hex;

function typeRow(typeId: Hex, accountId: string, kind: TypeRow["kind"], name: string, publicClaim = true): TypeRow {
  return {
    typeId, registry: REGISTRY, accountId, orgId: orgIdFromUuid(accountId).toLowerCase() as Hex, localUuid: null, localId: keccak256(toHex(name)),
    kind, policy: "issuer_batch", name, description: "Beschreibung", imageUrl: null, benefits: ["Rabatt"], template: null,
    defaultValiditySeconds: 0, claimStart: null, claimEnd: null, supplyCap: 0, publicClaim, recognised: false, retired: false,
    chainStatus: "onchain", eventId: null, createdBy: OWNER, createdAt: new Date(T0).toISOString(),
  };
}

let n = 0;
const uuid = () => `44444444-4444-4444-8444-${(++n).toString(16).padStart(12, "0")}`;

const caller = (wallet: string, action: Caller["action"] = "mine", via: Caller["via"] = "signature"): Caller => ({ ok: true, wallet, via, action, payload: {} });

type World = Awaited<ReturnType<typeof world>>;

async function world(opts: { privateOnly?: Record<string, boolean>; held?: Record<string, boolean> } = {}) {
  const store = new InMemoryCredentialStore();
  store.seedAccount({ id: VEREIN, accountType: "organisation", name: "Heimatverein", subType: "verein", avatarUrl: "https://x/a.png", membersPublicColumn: null });
  store.seedAccount({ id: FRAKTION, accountType: "organisation", name: "Fraktion Grün", subType: "fraktion", avatarUrl: null, membersPublicColumn: false });
  const types = {
    verein: typeRow(typeIdOf(VEREIN, "mitglied"), VEREIN, "membership", "Mitglied"),
    badge: typeRow(typeIdOf(VEREIN, "helfer"), VEREIN, "badge", "Helfer 2026"),
    fraktion: typeRow(typeIdOf(FRAKTION, "mitglied"), FRAKTION, "membership", "Parteimitglied"),
  };
  for (const t of Object.values(types)) await store.upsertType(t);
  const privateOnly = opts.privateOnly ?? {};
  const held = opts.held ?? {};
  let now = T0;
  const d: HolderDeps = {
    store,
    reader: {
      async orgPrivateOnly(orgId: Hex) {
        return privateOnly[orgId.toLowerCase()] ?? false;
      },
      async holdsMany(typeIds: readonly Hex[], account: Address) {
        return typeIds.map((t) => held[`${t.toLowerCase()}:${account.toLowerCase()}`] ?? false);
      },
    } as never,
    registry: REGISTRY,
    now: () => now,
    takeRedeem: async () => true,
  };
  let batchNo = 0;
  async function batch(typeId: Hex, people: { wallet?: string; claimKey?: Hex; token?: string; validUntil?: string }[], status: "onchain" | "prepared" = "onchain") {
    const batchId = uuid();
    const chainBatchId = status === "onchain" ? String(++batchNo + 6) : null;
    const rows: NewInvitation[] = [];
    const out: { id: string; token: string | null; claimKey: Hex | null }[] = [];
    for (const p of people) {
      const id = uuid();
      const salt = keccak256(toHex(id));
      const validUntil = p.validUntil ?? "0";
      if (p.wallet) {
        rows.push({
          id, typeId, leafKind: "account", subject: p.wallet, validUntil, salt,
          leafHash: leafHash({ kind: "account", typeId, subject: p.wallet as Address, validUntil: BigInt(validUntil), salt }).toLowerCase() as Hex,
          proof: [keccak256(toHex(`p-${id}`))], claimKeyEnc: null, tokenHash: null, tokenEnc: null, recipientWallet: p.wallet, displayName: "Anna", contactEmail: null,
          status: "invited",
        });
        out.push({ id, token: null, claimKey: null });
      } else {
        const key = p.claimKey ?? generatePrivateKey();
        const subject = privateKeyToAccount(key).address.toLowerCase();
        const token = p.token ?? randomBytes(32).toString("base64url");
        rows.push({
          id, typeId, leafKind: "claim_key", subject, validUntil, salt,
          leafHash: leafHash({ kind: "claimKey", typeId, subject: subject as Address, validUntil: BigInt(validUntil), salt }).toLowerCase() as Hex,
          proof: [keccak256(toHex(`p-${id}`))], claimKeyEnc: sealSecret(key, `invitation:${id}:claim_key`),
          tokenHash: createHash("sha256").update(token).digest("hex"), tokenEnc: sealSecret(token, `invitation:${id}:token`),
          recipientWallet: null, displayName: "Bernd", contactEmail: null, status: "invited",
        });
        out.push({ id, token, claimKey: key });
      }
    }
    await store.insertBatchWithInvitations({ id: batchId, actionId: null, typeId, root: keccak256(toHex(batchId)), count: rows.length, source: "people" }, rows);
    if (chainBatchId) await store.updateBatch(batchId, { status: "onchain", chainBatchId });
    return { batchId, chainBatchId, invitations: out };
  }
  return { store, types, d, batch, setNow: (t: number) => (now = t) };
}

const ok = <T>(r: { ok: true; data: T } | { ok: false; status: number; code: string; message: string }): T => {
  assert.equal(r.ok, true, JSON.stringify(r));
  return (r as { ok: true; data: T }).data;
};

test("mine returns leaf, proof and batch id for account invitations of the caller only", async () => {
  const w: World = await world();
  const a = await w.batch(w.types.verein.typeId, [{ wallet: ALICE }, { wallet: BOB }]);
  await w.batch(w.types.badge.typeId, [{ wallet: ALICE }], "prepared");
  const views = ok(await mine(w.d, caller(ALICE)));
  assert.equal(views.length, 1);
  const v = views[0];
  assert.equal(v.id, a.invitations[0].id);
  assert.equal(v.state, "invited");
  assert.equal(v.claim.batchId, a.chainBatchId);
  assert.equal(v.claim.leaf.kind, "account");
  assert.equal(v.claim.leaf.subject, ALICE);
  assert.equal(v.claim.leaf.typeId, w.types.verein.typeId);
  assert.equal(v.claim.proof.length, 1);
  assert.equal(v.claim.claimSignature, null);
  assert.equal(v.type.name, "Mitglied");
  assert.equal(v.type.publicClaimAllowed, true);
  assert.deepEqual(v.org, { accountId: VEREIN, name: "Heimatverein", avatarUrl: "https://x/a.png" });
  // nothing in the view tells whether the person claimed publicly
  assert.equal(JSON.stringify(v).includes("claimedOnchain"), false);
  assert.equal(JSON.stringify(v).includes("Anna"), false);
});

test("publicClaimAllowed follows the chain's orgPrivateOnly for memberships", async () => {
  const w = await world({ privateOnly: { [orgIdFromUuid(FRAKTION).toLowerCase()]: true } });
  await w.batch(w.types.fraktion.typeId, [{ wallet: ALICE }]);
  const [v] = ok(await mine(w.d, caller(ALICE)));
  assert.equal(v.type.publicClaimAllowed, false);
});

test("redeem binds a claim-key invitation to the first caller and returns a signature that recovers to the leaf subject for that caller", async () => {
  const w = await world();
  const b = await w.batch(w.types.verein.typeId, [{}]);
  const inv = b.invitations[0];
  const v = ok(await redeem(w.d, caller(ALICE, "redeem"), { token: inv.token! }));
  assert.equal(v.id, inv.id);
  assert.equal(v.claim.leaf.kind, "claimKey");
  assert.ok(v.claim.claimSignature);
  const row = await w.store.getInvitation(inv.id);
  assert.equal(row!.recipientWallet, ALICE);
  const signer = await recoverClaimSigner({
    chainId: 100, registry: REGISTRY, batchId: BigInt(b.chainBatchId!), leaf: row!.leafHash, account: ALICE as Address, signature: v.claim.claimSignature!,
  });
  assert.equal(signer.toLowerCase(), v.claim.leaf.subject);
  assert.equal(JSON.stringify(v).includes(inv.claimKey!.slice(2)), false);
  // now listed in mine with a signature for the caller
  const [m] = ok(await mine(w.d, caller(ALICE)));
  assert.equal(m.id, inv.id);
  assert.ok(m.claim.claimSignature);
});

test("a second account redeeming the same token gets 409 ALREADY_REDEEMED", async () => {
  const w = await world();
  const b = await w.batch(w.types.verein.typeId, [{}]);
  const token = b.invitations[0].token!;
  const [r1, r2] = await Promise.all([redeem(w.d, caller(ALICE, "redeem"), { token }), redeem(w.d, caller(BOB, "redeem"), { token })]);
  assert.equal(r1.ok, true);
  assert.equal(r2.ok, false);
  if (r2.ok) return;
  assert.equal(r2.status, 409);
  assert.equal(r2.code, "ALREADY_REDEEMED");
  assert.equal(r2.message, "Dieser Ausweis wurde bereits abgeholt.");
  assert.equal((await w.store.getInvitation(b.invitations[0].id))!.recipientWallet, ALICE);
});

test("the same account may redeem again (reinstall) and gets a fresh signature", async () => {
  const w = await world();
  const b = await w.batch(w.types.verein.typeId, [{}]);
  const token = b.invitations[0].token!;
  const v1 = ok(await redeem(w.d, caller(ALICE, "redeem"), { token }));
  const v2 = ok(await redeem(w.d, caller(ALICE.toUpperCase().replace("0X", "0x"), "redeem"), { token }));
  assert.equal(v2.id, v1.id);
  assert.ok(v2.claim.claimSignature);
  const row = await w.store.getInvitation(b.invitations[0].id);
  const signer = await recoverClaimSigner({
    chainId: 100, registry: REGISTRY, batchId: BigInt(b.chainBatchId!), leaf: row!.leafHash, account: ALICE as Address, signature: v2.claim.claimSignature!,
  });
  assert.equal(signer.toLowerCase(), v2.claim.leaf.subject);
});

test("redeem of a revoked invitation is 410; an unknown token 404", async () => {
  const w = await world();
  const b = await w.batch(w.types.verein.typeId, [{}]);
  await w.store.updateInvitation(b.invitations[0].id, { status: "revoked" });
  const r = await redeem(w.d, caller(ALICE, "redeem"), { token: b.invitations[0].token! });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.status, 410);
  const u = await redeem(w.d, caller(ALICE, "redeem"), { token: randomBytes(32).toString("base64url") });
  assert.equal(u.ok, false);
  if (!u.ok) {
    assert.equal(u.status, 404);
    assert.equal(u.message, "Dieser Link ist nicht gültig.");
  }
  // a batch that is not on chain yet does not redeem either
  const p = await w.batch(w.types.verein.typeId, [{}], "prepared");
  const pr = await redeem(w.d, caller(ALICE, "redeem"), { token: p.invitations[0].token! });
  assert.equal(pr.ok, false);
  if (!pr.ok) assert.equal(pr.status, 404);
  assert.equal((await w.store.getInvitation(p.invitations[0].id))!.recipientWallet, null);
});

test("redeem is rate limited per wallet", async () => {
  const w = await world();
  const b = await w.batch(w.types.verein.typeId, [{}]);
  const seen: string[] = [];
  w.d.takeRedeem = async (wallet) => {
    seen.push(wallet);
    return false;
  };
  const r = await redeem(w.d, caller(ALICE, "redeem"), { token: b.invitations[0].token! });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.status, 429);
  assert.deepEqual(seen, [ALICE]);
  assert.equal((await w.store.getInvitation(b.invitations[0].id))!.recipientWallet, null);
});

test("respond does not accept a visibility field and stores none", async () => {
  const w = await world();
  const b = await w.batch(w.types.verein.typeId, [{ wallet: ALICE }]);
  const id = b.invitations[0].id;
  const bad = await respond(w.d, caller(ALICE, "respond"), { invitationId: id, decision: "accept", visibility: "public" } as never);
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.equal(bad.status, 400);
  assert.equal((await w.store.getInvitation(id))!.status, "invited");

  ok(await respond(w.d, caller(ALICE, "respond"), { invitationId: id, decision: "accept" }));
  const row = await w.store.getInvitation(id);
  assert.equal(row!.status, "accepted");
  assert.equal(row!.respondedAt, new Date(T0).toISOString());
  assert.equal("visibility" in (row as object), false);
  assert.equal(row!.claimedOnchain, false);

  // someone else's invitation is not found
  const other = await respond(w.d, caller(BOB, "respond"), { invitationId: id, decision: "decline" });
  assert.equal(other.ok, false);
  if (!other.ok) assert.equal(other.status, 404);
  ok(await respond(w.d, caller(ALICE, "respond"), { invitationId: id, decision: "decline" }));
  assert.equal((await w.store.getInvitation(id))!.status, "declined");
});

test("holdings: public from chain, private from an accepted invitation, false after revocation or expiry", async () => {
  const w = await world();
  w.d.reader = {
    ...(w.d.reader as object),
    async holdsMany(typeIds: readonly Hex[], account: Address) {
      return typeIds.map((t) => t === w.types.badge.typeId && account.toLowerCase() === ALICE);
    },
  } as never;
  const b = await w.batch(w.types.verein.typeId, [{ wallet: ALICE }]);
  const f = await w.batch(w.types.fraktion.typeId, [{ wallet: ALICE, validUntil: String(T0 / 1000 + 60) }]);
  const ids = [w.types.verein.typeId, w.types.badge.typeId, w.types.fraktion.typeId];

  let h = ok(await holdings(w.d, caller(ALICE, "holdings"), { typeIds: ids }));
  assert.deepEqual(h.map((x) => [x.held, x.visibility]), [[false, null], [true, "public"], [false, null]]);

  ok(await respond(w.d, caller(ALICE, "respond"), { invitationId: b.invitations[0].id, decision: "accept" }));
  ok(await respond(w.d, caller(ALICE, "respond"), { invitationId: f.invitations[0].id, decision: "accept" }));
  h = ok(await holdings(w.d, caller(ALICE, "holdings"), { typeIds: ids }));
  assert.deepEqual(h.map((x) => [x.held, x.visibility]), [[true, "private"], [true, "public"], [true, "private"]]);
  assert.equal(h[2].validUntil, new Date((T0 / 1000 + 60) * 1000).toISOString());

  w.setNow(T0 + 61_000);
  await w.store.updateBatch(b.batchId, { status: "revoked" });
  h = ok(await holdings(w.d, caller(ALICE, "holdings"), { typeIds: ids }));
  assert.deepEqual(h.map((x) => [x.held, x.visibility]), [[false, null], [true, "public"], [false, null]]);

  const bad = await holdings(w.d, caller(ALICE, "holdings"), { typeIds: ["nope" as Hex] });
  assert.equal(bad.ok, false);
});

test("holdings never reports another wallet's invitation", async () => {
  const w = await world();
  const b = await w.batch(w.types.verein.typeId, [{ wallet: ALICE }]);
  ok(await respond(w.d, caller(ALICE, "respond"), { invitationId: b.invitations[0].id, decision: "accept" }));
  const h = ok(await holdings(w.d, caller(BOB, "holdings"), { typeIds: [w.types.verein.typeId] }));
  assert.deepEqual(h, [{ typeId: w.types.verein.typeId, held: false, visibility: null, validUntil: null }]);
});

test("a pairing session is refused for mine, redeem, respond and present_create, allowed for holdings and present_resolve", async () => {
  const req = { headers: { get: (k: string) => (k.toLowerCase() === "authorization" ? "Bearer chat.jwt" : null) } };
  for (const action of ["mine", "redeem", "respond", "present_create"] as const) {
    const r = await authenticateCaller(req, { action, payload: {} }, ME_ACTIONS, { verifyChatToken: async () => ALICE, verifySigned: (async () => { throw new Error("no"); }) as never });
    assert.equal(r.ok, false, action);
    if (!r.ok) assert.equal(r.status, 403, action);
  }
  for (const action of ["holdings", "present_resolve"] as const) {
    const r = await authenticateCaller(req, { action, payload: {} }, ME_ACTIONS, { verifyChatToken: async () => ALICE, verifySigned: (async () => { throw new Error("no"); }) as never });
    assert.equal(r.ok, true, action);
  }
});

test("redeem of a prepared invitation of an on-chain batch marks it invited and drops the mail address", async () => {
  const w = await world();
  const b = await w.batch(w.types.verein.typeId, [{}]);
  const id = b.invitations[0].id;
  await w.store.updateInvitation(id, { status: "prepared", contactEmail: "b@example.org" });
  const v = ok(await redeem(w.d, caller(ALICE, "redeem"), { token: b.invitations[0].token! }));
  assert.equal(v.state, "invited");
  const row = await w.store.getInvitation(id);
  assert.equal(row!.status, "invited");
  assert.equal(row!.contactEmail, null);
  assert.equal(row!.invitedAt, new Date(T0).toISOString());
  const [m] = ok(await mine(w.d, caller(ALICE)));
  assert.equal(m.id, id);
  ok(await respond(w.d, caller(ALICE, "respond"), { invitationId: id, decision: "accept" }));
});

test("validation messages of respond and holdings are German", async () => {
  const w = await world();
  const b = await w.batch(w.types.verein.typeId, [{ wallet: ALICE }]);
  const id = b.invitations[0].id;
  const cases = [
    await respond(w.d, caller(ALICE, "respond"), null as never),
    await respond(w.d, caller(ALICE, "respond"), { invitationId: id, decision: "accept", visibility: "public" } as never),
    await respond(w.d, caller(ALICE, "respond"), { invitationId: id, decision: "maybe" } as never),
    await holdings(w.d, caller(ALICE, "holdings"), { typeIds: [] }),
  ];
  const messages = cases.map((r) => (r.ok ? "" : (r as { message: string }).message));
  assert.deepEqual(messages, [
    "Einladung und Entscheidung fehlen.",
    "Unerwartete Angabe in der Anfrage.",
    "Bitte annehmen oder ablehnen.",
    "Bitte 1 bis 50 Ausweise abfragen.",
  ]);
});
