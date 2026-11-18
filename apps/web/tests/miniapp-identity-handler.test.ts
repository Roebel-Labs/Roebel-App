// apps/web/tests/miniapp-identity-handler.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { deriveSubject } from "../src/lib/miniapp/subject";
import type { GrantRow, GrantStore } from "../src/lib/miniapp/grants";
import { builtinCredentialSource, type CredentialSource } from "../src/lib/miniapp/credentialSource";
import { handleIdentityRequest, type IdentityApp, type IdentityDeps } from "../src/lib/miniapp/identityHandler";

const SECRET = "s".repeat(40);
const W = "0xC49de63ccfee46c6c5c3e393293f66779799fb28";
const WL = W.toLowerCase();
const APP_ID = "11111111-2222-3333-4444-555555555555";
const V1_ID = "66666666-7777-8888-9999-000000000000";
const T = "type:0x" + "cd".repeat(32);
const headers = { get: () => null };

const v2App: IdentityApp = {
  id: APP_ID,
  slug: "demo",
  status: "live",
  manifestVersion: "2",
  identity: {
    profile: true,
    address: true,
    credentials: [
      { type: "citizen", reason: "Nur für Bürger:innen" },
      { type: "attester", reason: "Prüfer:innen" },
      { type: T, reason: "Mitglied" },
    ],
  },
};
const v1App: IdentityApp = { id: V1_ID, slug: "old", status: "live", manifestVersion: "1", identity: null };

function memoryStore(): GrantStore & { rows: Map<string, GrantRow> } {
  const rows = new Map<string, GrantRow>();
  const subjects = new Map<string, string>();
  return {
    rows,
    get: async (a, w) => rows.get(`${a}:${w.toLowerCase()}`) ?? null,
    put: async (a, w, g) => void rows.set(`${a}:${w.toLowerCase()}`, g),
    subject: async (a, w) => {
      const s = deriveSubject(SECRET, a, w);
      subjects.set(s, w.toLowerCase());
      return s;
    },
    walletOf: async (s) => subjects.get(s) ?? null,
  };
}

const body = (action: string, payload: Record<string, unknown>) => ({ scope: "roebel-miniapp-v1", action, wallet: W, timestampSec: 1, payload });

function deps(over: Partial<IdentityDeps> = {}): IdentityDeps {
  return {
    verify: async (b) => {
      const x = b as { action: "identity_get" | "identity_set"; payload: Record<string, unknown> };
      return { ok: true, wallet: W, action: x.action, payload: x.payload };
    },
    getApp: async (ref) => ([v2App, v1App].find((a) => a.slug === ref || a.id === ref) ?? null),
    store: memoryStore(),
    credentials: builtinCredentialSource({ isCitizen: async () => true, isAttester: async () => false }),
    take: async () => true,
    ...over,
  };
}

test("identity_get for a new user returns the pseudonym and an empty grant", async () => {
  const r = await handleIdentityRequest(body("identity_get", { app: "demo" }), headers, deps());
  assert.equal(r.status, 200);
  assert.equal(r.json.subject, deriveSubject(SECRET, APP_ID, W));
  assert.deepEqual(r.json.asked, []);
  assert.deepEqual(r.json.granted, { profile: false, address: false, credentials: [] });
  assert.deepEqual(r.json.credentials, []);
  assert.deepEqual(r.json.types, {
    citizen: { name: "Bürger:in" },
    attester: { name: "Bescheiniger:in" },
    [T]: null,
  });
});

test("identity_set stores the clamped grant and returns the held credentials", async () => {
  const d = deps();
  const r = await handleIdentityRequest(
    body("identity_set", { app: "demo", grant: { profile: true, credentials: ["citizen", "attester", "guest"], asked: ["profile", "cred:citizen"] } }),
    headers,
    d,
  );
  assert.equal(r.status, 200);
  const s = r.json as unknown as { granted: { credentials: string[] }; asked: string[]; credentials: Record<string, unknown>[] };
  assert.deepEqual(s.granted.credentials, ["citizen", "attester"]);
  assert.deepEqual(s.asked, ["profile", "cred:citizen", "cred:attester"]);
  assert.equal(s.credentials.length, 1);
  assert.equal(s.credentials[0].type, "citizen");
  assert.equal("private" in s.credentials[0], false);
  assert.deepEqual(await d.store!.get(APP_ID, WL), {
    profile: true,
    address: false,
    credentials: ["citizen", "attester"],
    asked: ["profile", "cred:citizen", "cred:attester"],
  });
  // A later identity_get reads the same state.
  const g = await handleIdentityRequest(body("identity_get", { app: APP_ID }), headers, d);
  assert.deepEqual(g.json.granted, s.granted);
});

test("a privately held type is flagged in types only, never in credentials", async () => {
  const privSource: CredentialSource = {
    held: async (_w, refs) =>
      refs.includes(T)
        ? [{ type: T, kind: "membership", org: "3f2504e0-4f89-41d3-9a0c-0305e82c3301", name: "Verein", validUntil: null, recognised: true, private: true }]
        : [],
    describe: async (ref) => (ref === T ? { type: T, kind: "membership", name: "Verein", orgName: "TSV", recognised: true } : null),
  };
  const r = await handleIdentityRequest(
    body("identity_set", { app: "demo", grant: { credentials: [T] } }),
    headers,
    deps({ credentials: privSource }),
  );
  const s = r.json as unknown as { credentials: Record<string, unknown>[]; types: Record<string, unknown> };
  assert.deepEqual(s.types[T], { name: "Verein", orgName: "TSV", private: true });
  assert.equal(s.credentials[0].type, T);
  assert.equal("private" in s.credentials[0], false);
});

test("identity_get never contains the wallet for a version-2 app", async () => {
  const d = deps();
  await handleIdentityRequest(body("identity_set", { app: "demo", grant: { profile: true, address: true, credentials: ["citizen"] } }), headers, d);
  const r = await handleIdentityRequest(body("identity_get", { app: "demo" }), headers, d);
  assert.equal(r.status, 200);
  assert.ok(!JSON.stringify(r.json).toLowerCase().includes(WL));
  assert.ok(!JSON.stringify(r.json).toLowerCase().includes(WL.slice(2)));
});

test("a version-1 app answers with the address and refuses identity_set", async () => {
  const g = await handleIdentityRequest(body("identity_get", { app: "old" }), headers, deps());
  assert.equal(g.status, 200);
  assert.deepEqual(g.json, {
    subject: WL,
    asked: [],
    granted: { profile: true, address: true, credentials: [] },
    credentials: [],
    types: {},
  });
  const s = await handleIdentityRequest(body("identity_set", { app: "old", grant: { profile: true } }), headers, deps());
  assert.equal(s.status, 400);
  assert.equal(s.json.code, "invalid_params");
});

test("a missing subject secret answers 503 identity_unavailable", async () => {
  const r = await handleIdentityRequest(body("identity_get", { app: "demo" }), headers, deps({ store: null }));
  assert.equal(r.status, 503);
  assert.equal(r.json.code, "identity_unavailable");
});

test("unknown and suspended apps, failed verification, rate limit, chain failure", async () => {
  assert.equal((await handleIdentityRequest(body("identity_get", { app: "nope" }), headers, deps())).status, 404);
  assert.equal(
    (await handleIdentityRequest(body("identity_get", { app: "demo" }), headers, deps({ getApp: async () => ({ ...v2App, status: "suspended" }) }))).status,
    403,
  );
  const bad = await handleIdentityRequest(body("identity_get", { app: "demo" }), headers, deps({
    verify: async () => ({ ok: false, status: 401, code: "BAD_SIGNATURE", message: "nope" }),
  }));
  assert.equal(bad.status, 401);
  assert.equal((await handleIdentityRequest(body("identity_get", { app: "demo" }), headers, deps({ take: async () => false }))).status, 429);
  const down = await handleIdentityRequest(body("identity_get", { app: "demo" }), headers, deps({
    credentials: builtinCredentialSource({ isCitizen: async () => { throw new Error("rpc"); }, isAttester: async () => false }),
  }));
  assert.equal(down.status, 503);
  assert.equal(down.json.code, "credentials_unavailable");
});

test("a stored grant is re-clamped when the manifest drops a credential", async () => {
  const d = deps();
  await d.store!.put(APP_ID, WL, { profile: false, address: false, credentials: ["citizen", "guest"], asked: ["cred:citizen", "cred:guest"] });
  const r = await handleIdentityRequest(body("identity_get", { app: "demo" }), headers, d);
  assert.deepEqual(r.json.granted, { profile: false, address: false, credentials: ["citizen"] });
  assert.deepEqual(r.json.asked, ["cred:citizen"]);
});
