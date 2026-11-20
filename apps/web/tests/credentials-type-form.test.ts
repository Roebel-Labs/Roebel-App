import { test } from "node:test";
import assert from "node:assert/strict";
import { formFromTemplate, formFromType, typeFormToPayload, validateTypeForm, type TypeForm } from "../src/lib/credentials/type-form";

const TYPE_ID = `0x${"ab".repeat(32)}`;

test("formFromTemplate('vorstand') is a role named Vorstand with no cap", () => {
  const f = formFromTemplate("vorstand");
  assert.equal(f.template, "vorstand");
  assert.equal(f.name, "Vorstand");
  assert.equal(f.kind, "role");
  assert.equal(f.supplyCap, "");
  assert.equal(f.claimStart, "");
  assert.equal(f.claimEnd, "");
  assert.equal(f.imageUrl, null);
  assert.deepEqual(f.benefits, []);
  assert.ok(f.description.length > 0);
  assert.deepEqual(validateTypeForm(f), {});
  // Every template yields a valid form.
  for (const t of ["mitglied", "vorstand", "mitarbeiter", "ehrenmitglied", "stadtvertreter", "abzeichen"] as const) {
    assert.deepEqual(validateTypeForm(formFromTemplate(t)), {}, t);
  }
});

test("validateTypeForm reports name, cap and window errors in German", () => {
  const base = formFromTemplate("mitglied");
  const e = validateTypeForm({
    ...base,
    name: "A",
    description: "x".repeat(301),
    benefits: ["a", "b", "c", "d", "e", "f", "g"],
    supplyCap: "0",
    claimStart: "2026-12-10T10:00",
    claimEnd: "2026-12-01T10:00",
  });
  assert.match(e.name, /2 bis 60 Zeichen/);
  assert.match(e.description, /300 Zeichen/);
  assert.match(e.benefits, /6 Vorteile/);
  assert.match(e.supplyCap, /1 und 100\.000/);
  assert.match(e.claimEnd, /nach dem Beginn/);

  assert.match(validateTypeForm({ ...base, name: "x".repeat(61) }).name, /2 bis 60/);
  assert.match(validateTypeForm({ ...base, supplyCap: "100001" }).supplyCap, /1 und 100\.000/);
  assert.match(validateTypeForm({ ...base, supplyCap: "2.5" }).supplyCap, /1 und 100\.000/);
  assert.match(validateTypeForm({ ...base, benefits: ["y".repeat(81)] }).benefits, /80 Zeichen/);
  assert.deepEqual(validateTypeForm({ ...base, supplyCap: "100000", claimStart: "2026-12-01T10:00" }), {});
  // Blank benefit lines are ignored, not counted.
  assert.deepEqual(validateTypeForm({ ...base, benefits: ["Rabatt", "", "  "] }), {});
});

test("typeFormToPayload for update omits kind and carries the typeId", () => {
  const f: TypeForm = { ...formFromTemplate("mitglied"), name: "Mitglied 2027", kind: "badge" };
  const p = typeFormToPayload(f, "update", TYPE_ID);
  assert.equal(p.op, "update");
  assert.equal(p.typeId, TYPE_ID);
  assert.equal("kind" in p, false);
  assert.equal("template" in p, false);
  assert.equal(p.name, "Mitglied 2027");
  // On update an emptied field is sent as "" so the server clears it.
  assert.equal(p.claimStart, "");
  assert.equal(p.imageUrl, "");
  assert.equal(p.supplyCap, 0);
});

test("typeFormToPayload turns empty cap and dates into 0 / absent", () => {
  const p = typeFormToPayload({ ...formFromTemplate("ehrenmitglied"), benefits: [" Freier Eintritt ", ""] }, "create");
  assert.equal(p.op, "create");
  assert.equal(p.template, "ehrenmitglied");
  assert.equal(p.kind, "membership");
  assert.equal(p.supplyCap, 0);
  assert.equal("claimStart" in p, false);
  assert.equal("claimEnd" in p, false);
  assert.equal("imageUrl" in p, false);
  assert.equal("typeId" in p, false);
  assert.deepEqual(p.benefits, ["Freier Eintritt"]);

  const q = typeFormToPayload({ ...formFromTemplate("abzeichen"), template: "eigener", supplyCap: "250", claimStart: "2026-12-01T10:00", imageUrl: "https://x.example/a.png" }, "create");
  assert.equal("template" in q, false);
  assert.equal(q.supplyCap, 250);
  assert.equal(q.claimStart, new Date("2026-12-01T10:00").toISOString());
  assert.equal(q.imageUrl, "https://x.example/a.png");
});

test("formFromType round-trips an existing type into the edit form", () => {
  const f = formFromType({
    typeId: TYPE_ID, name: "Vorstand", kind: "role", description: null, imageUrl: null, benefits: ["a"], template: "vorstand",
    supplyCap: 0, claimStart: null, claimEnd: null,
  });
  assert.equal(f.template, "vorstand");
  assert.equal(f.supplyCap, "");
  assert.equal(f.description, "");
  assert.deepEqual(typeFormToPayload(f, "update", TYPE_ID).benefits, ["a"]);
});

test("types_list returns accepted and open counts per type for the list page", async () => {
  const { InMemoryCredentialStore } = await import("../src/lib/credentials/store");
  const { listTypesForOrg } = await import("../src/lib/credentials/actions");
  const ORG = "6f1c2a7e-0d3b-4c55-9a1e-2b3c4d5e6f70";
  const OWNER = "0x00000000000000000000000000000000000000a1";
  const store = new InMemoryCredentialStore();
  store.seedAccount({ id: ORG, accountType: "organisation", name: "Heimatverein", subType: "verein", avatarUrl: null, membersPublicColumn: null });
  store.seedOwner(ORG, OWNER, "owner");
  await store.upsertType({
    typeId: TYPE_ID as `0x${string}`, registry: "0xc1", accountId: ORG, orgId: `0x${"01".repeat(32)}`, localUuid: null, localId: `0x${"02".repeat(32)}`,
    kind: "membership", policy: "issuer_batch", name: "Mitglied", description: null, imageUrl: null, benefits: [], template: "mitglied",
    defaultValiditySeconds: 0, claimStart: null, claimEnd: null, supplyCap: 0, publicClaim: true, recognised: false, retired: false,
    chainStatus: "onchain", eventId: null, createdBy: OWNER, createdAt: "2026-11-17T10:00:00.000Z",
  });
  const inv = (i: number, status: "prepared" | "invited" | "accepted" | "declined" | "revoked") => ({
    id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, typeId: TYPE_ID as `0x${string}`, leafKind: "account" as const,
    subject: `0x${String(i).padStart(40, "0")}`, validUntil: "0", salt: `0x${"00".repeat(32)}` as `0x${string}`,
    leafHash: `0x${String(i).padStart(64, "0")}` as `0x${string}`, proof: [], claimKeyEnc: null, tokenHash: null, tokenEnc: null,
    recipientWallet: `0x${String(i).padStart(40, "0")}`, displayName: null, contactEmail: null, status,
  });
  await store.insertBatchWithInvitations(
    { id: "b1", actionId: null, typeId: TYPE_ID as `0x${string}`, root: `0x${"09".repeat(32)}`, count: 6, source: "people" },
    [inv(1, "accepted"), inv(2, "accepted"), inv(3, "invited"), inv(4, "prepared"), inv(5, "revoked"), inv(6, "declined")],
  );
  const d = { store, now: () => Date.parse("2026-11-18T10:00:00Z") } as never;
  const r = await listTypesForOrg(d, { ok: true, wallet: OWNER, via: "chat_session", action: "types_list", payload: {} }, ORG);
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.data[0].counts, { accepted: 2, open: 1 });
});

test("the retire summary on the phone says that every credential of the type stops counting (contract: retired types are not valid)", async () => {
  const { InMemoryCredentialStore } = await import("../src/lib/credentials/store");
  const { prepareTypeAction } = await import("../src/lib/credentials/actions");
  const ORG = "6f1c2a7e-0d3b-4c55-9a1e-2b3c4d5e6f70";
  const OWNER = "0x00000000000000000000000000000000000000a1";
  const store = new InMemoryCredentialStore();
  store.seedAccount({ id: ORG, accountType: "organisation", name: "Heimatverein", subType: "verein", avatarUrl: null, membersPublicColumn: null });
  store.seedOwner(ORG, OWNER, "owner");
  await store.upsertType({
    typeId: TYPE_ID as `0x${string}`, registry: "0xc1", accountId: ORG, orgId: `0x${"01".repeat(32)}`, localUuid: null, localId: `0x${"02".repeat(32)}`,
    kind: "membership", policy: "issuer_batch", name: "Mitglied", description: null, imageUrl: null, benefits: [], template: "mitglied",
    defaultValiditySeconds: 0, claimStart: null, claimEnd: null, supplyCap: 0, publicClaim: true, recognised: false, retired: false,
    chainStatus: "onchain", eventId: null, createdBy: OWNER, createdAt: "2026-11-17T10:00:00.000Z",
  });
  const d = {
    store,
    reader: { isOrgRegistered: async () => true, canManage: async () => true, orgPrivateOnly: async () => false },
    head: async () => 1n,
    notify: { push: async () => {} },
    now: () => Date.parse("2026-11-18T10:00:00Z"),
    registry: "0x00000000000000000000000000000000000000c1",
  } as never;
  const r = await prepareTypeAction(d, { ok: true, wallet: OWNER, via: "chat_session", action: "type_prepare", payload: {} }, {
    accountId: ORG, op: "retire", typeId: TYPE_ID as `0x${string}`,
  });
  assert.equal(r.ok, true);
  const a = r.ok && r.data.actionId ? await store.getAction(r.data.actionId) : null;
  const lines = (a?.summary.lines ?? []) as string[];
  assert.ok(lines.some((l) => /verlieren sofort ihre Gültigkeit/.test(l)), JSON.stringify(lines));
  assert.ok(!lines.some((l) => /bleiben gültig/.test(l)));
});
