import { test } from "node:test";
import assert from "node:assert/strict";
import { RESERVED_TYPE_IDS } from "@netizen-labs/credential-registry";
import type { Hex } from "viem";
import { InMemoryCredentialStore, type TypeRow } from "../src/lib/credentials/store";
import { metadataFor, metadataUrl, RESERVED_METADATA, typeDirectory, typeMetadataJson, reservedMetadataFor } from "../src/lib/credentials/metadata";
import type { ActionRow, ActionStatus } from "../src/lib/credentials/store";
import { TYPE_TEMPLATES } from "../src/lib/credentials/templates";

const ORG = "6f1c2a7e-0d3b-4c55-9a1e-2b3c4d5e6f70";
const WALLET = "0x00000000000000000000000000000000000000a1";
const ADDR_RE = /0x[0-9a-fA-F]{40}(?![0-9a-fA-F])/;

function typeRow(over: Partial<TypeRow> = {}): TypeRow {
  return {
    typeId: ("0x" + "11".repeat(32)) as Hex,
    registry: "0x00000000000000000000000000000000000000ff",
    accountId: ORG,
    orgId: ("0x" + "22".repeat(32)) as Hex,
    localUuid: null,
    localId: ("0x" + "33".repeat(32)) as Hex,
    kind: "membership",
    policy: "issuer_batch",
    name: "Mitglied",
    description: "Mitglied im Heimatverein",
    imageUrl: null,
    benefits: ["Vergünstigter Eintritt"],
    template: "mitglied",
    defaultValiditySeconds: 0,
    claimStart: null,
    claimEnd: null,
    supplyCap: 0,
    publicClaim: true,
    recognised: false,
    retired: false,
    chainStatus: "onchain",
    eventId: null,
    createdBy: WALLET,
    createdAt: "2026-11-17T00:00:00.000Z",
    ...over,
  };
}

test("metadata JSON carries name, kind, organisation and benefits and no address", () => {
  const j = typeMetadataJson(typeRow(), { name: "Heimatverein" });
  assert.equal(j.name, "Mitglied");
  assert.equal(j.description, "Mitglied im Heimatverein");
  assert.equal(j.image, null);
  assert.deepEqual(j.properties, { kind: "membership", organisation: "Heimatverein", recognised: false, benefits: ["Vergünstigter Eintritt"] });
  assert.doesNotMatch(JSON.stringify(j), ADDR_RE);
  assert.equal(typeMetadataJson(typeRow({ description: null }), null).properties.organisation, null);
  assert.equal(
    metadataUrl(("0x" + "ab".repeat(32)) as Hex),
    `https://www.roebel.app/api/credentials/types/0x${"ab".repeat(32)}/metadata`,
  );
  assert.equal(TYPE_TEMPLATES.mitarbeiter.name, "Mitarbeiter:in");
  assert.equal(TYPE_TEMPLATES.vorstand.kind, "role");
  assert.equal(TYPE_TEMPLATES.abzeichen.kind, "badge");
});

test("reserved metadata exists for the three reserved type ids", () => {
  assert.equal(RESERVED_METADATA.citizen.name, "Bürgerausweis");
  assert.equal(RESERVED_METADATA.attester.name, "Bescheiniger-Ausweis");
  assert.equal(RESERVED_METADATA.guest.name, "Gastkarte");
  for (const k of ["citizen", "attester", "guest"] as const) {
    assert.ok(RESERVED_METADATA[k].description.length > 40);
    assert.equal(reservedMetadataFor(RESERVED_TYPE_IDS[k]), RESERVED_METADATA[k]);
    assert.equal(reservedMetadataFor(RESERVED_TYPE_IDS[k].toUpperCase().replace("0X", "0x") as Hex), RESERVED_METADATA[k]);
  }
  assert.equal(reservedMetadataFor(("0x" + "11".repeat(32)) as Hex), null);
});

test("the type directory lists on-chain, non-retired types only and carries no address or count", async () => {
  const s = new InMemoryCredentialStore();
  s.seedAccount({ id: ORG, accountType: "organisation", name: "Heimatverein", subType: "verein", avatarUrl: null, membersPublicColumn: null });
  const live = typeRow({ typeId: ("0x" + "01".repeat(32)) as Hex, imageUrl: "https://img/x.png", recognised: true });
  await s.upsertType(live);
  await s.upsertType(typeRow({ typeId: ("0x" + "02".repeat(32)) as Hex, chainStatus: "draft" }));
  await s.upsertType(typeRow({ typeId: ("0x" + "03".repeat(32)) as Hex, retired: true }));
  await s.upsertType(typeRow({ typeId: ("0x" + "04".repeat(32)) as Hex, accountId: null, name: "Gemeinschaft" }));
  const dir = await typeDirectory(s);
  assert.deepEqual(
    dir.map((d) => d.typeId).sort(),
    [live.typeId, "0x" + "04".repeat(32)].sort(),
  );
  const e = dir.find((d) => d.typeId === live.typeId)!;
  assert.deepEqual(e, {
    typeId: live.typeId,
    kind: "membership",
    name: "Mitglied",
    imageUrl: "https://img/x.png",
    orgName: "Heimatverein",
    orgAccountId: ORG,
    recognised: true,
  });
  assert.equal(dir.find((d) => d.typeId !== live.typeId)!.orgName, null);
  const text = JSON.stringify(dir);
  assert.doesNotMatch(text, ADDR_RE);
  for (const d of dir) assert.ok(Object.keys(d).every((k) => !/^count$|holders|supply/i.test(k)));
});

test("metadataFor: reserved and on-chain types are served; a draft only while its createType action is live", async () => {
  const s = new InMemoryCredentialStore();
  s.seedAccount({ id: ORG, accountType: "organisation", name: "Heimatverein", subType: "verein", avatarUrl: null, membersPublicColumn: null });
  const now = Date.parse("2026-11-17T10:00:00Z");
  assert.equal((await metadataFor(s, RESERVED_TYPE_IDS.citizen, now))?.name, "Bürgerausweis");
  assert.equal(await metadataFor(s, ("0x" + "99".repeat(32)) as Hex, now), null);

  const onchain = typeRow();
  await s.upsertType(onchain);
  assert.equal((await metadataFor(s, onchain.typeId, now))?.properties.organisation, "Heimatverein");

  const draft = typeRow({ typeId: ("0x" + "44".repeat(32)) as Hex, localId: ("0x" + "55".repeat(32)) as Hex, chainStatus: "draft" });
  await s.upsertType(draft);
  // No action at all: not served.
  assert.equal(await metadataFor(s, draft.typeId, now), null);
  const action = (id: string, status: ActionStatus, expiresAt = "2026-11-24T10:00:00.000Z"): ActionRow => ({
    id, accountId: ORG, status, expiresAt, preparedBy: WALLET, preparedVia: "dashboard", confirmedBy: null, txHash: null, error: null,
    preparedBlock: "1", createdAt: "2026-11-17T09:00:00.000Z", summary: {},
    steps: [{ fn: "createType", orgId: draft.orgId, localId: draft.localId, kind: "membership", policy: "issuerBatch",
      config: { metadataURI: metadataUrl(draft.typeId), defaultValidity: 0, claimStart: 0, claimEnd: 0, supplyCap: 0, publicClaim: true } }],
  });
  for (const [i, st] of (["cancelled", "expired", "failed"] as const).entries()) {
    await s.insertAction(action(`00000000-0000-4000-8000-00000000000${i}`, st));
  }
  // An awaiting action whose time ran out does not count either.
  await s.insertAction(action("00000000-0000-4000-8000-000000000009", "awaiting_confirmation", "2026-11-17T09:59:00.000Z"));
  assert.equal(await metadataFor(s, draft.typeId, now), null);
  // A confirmed (or submitted, or still awaiting) createType action: served, so wallets reading the
  // on-chain URI right after confirmation never see a 404 before the sync marks the type on chain.
  await s.insertAction(action("00000000-0000-4000-8000-00000000000a", "done"));
  assert.equal((await metadataFor(s, draft.typeId, now))?.name, "Mitglied");
});
