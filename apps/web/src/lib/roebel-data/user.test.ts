import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "./fake-db.test-util";
import { shapeOutput } from "./shape";
import { getMyNotifications, getMyOrgs, getMyProfile, getMyTickets } from "./user";
import { getOrg, listOrgs } from "./public";

const W = "0xabcdef0123456789abcdef0123456789abcdef01";
const hasWallet = (v: unknown) => /0x[0-9a-f]{40}/i.test(JSON.stringify(v));

test("user formatters never echo the wallet, even if rows contain it", async () => {
  const db = fakeDb({
    users: [{ wallet_address: W, display_name: "Anna", username: "anna", bio: `meine adresse ${W}`, tier: "citizen" }],
    account_owners: [{ wallet_address: W, role: "owner", accounts: { name: "SV Röbel", slug: "sv-roebel", account_type: "organisation", sub_type: "verein", is_verified: true } }],
    tickets: [{ holder_wallet: W, status: "valid", checked_in_at: null, created_at: "x", events: { id: "e1", title: "Fest", date: "2999-01-01", time: null, location: "Markt" }, ticket_types: { name: "Standard" } }],
    notifications: [{ recipient_wallet: W, type: "like", title: "Neuer Like", body: `von ${W}`, is_read: false, created_at: "x" }],
  });
  const t = { id: "roebel", appOrigin: "https://www.roebel.app" };
  const profile = shapeOutput(await getMyProfile(db, t, W));
  const orgs = shapeOutput(await getMyOrgs(db, t, W));
  const tickets = shapeOutput(await getMyTickets(db, t, W));
  const notes = shapeOutput(await getMyNotifications(db, t, W, { limit: 5 }));
  for (const v of [profile, orgs, tickets, notes]) assert.ok(!hasWallet(v), JSON.stringify(v));
  assert.equal((profile as { name: string }).name, "Anna");
  assert.equal((profile as { buerger_verifiziert: boolean }).buerger_verifiziert, true);
  assert.equal(orgs.orgs[0].rolle, "Inhaber:in");
  assert.equal(orgs.orgs[0].url, "https://www.roebel.app/app/orgs/sv-roebel");
  assert.equal(tickets.tickets[0].veranstaltung, "Fest");
});

test("listOrgs merges accounts + Gewerbe, hides pending externals, dedupes by name", async () => {
  const db = fakeDb({
    accounts: [
      { name: "SV Röbel", slug: "sv", sub_type: "verein", bio: null, address: null, extern_status: null },
      { name: "Extern GmbH", slug: "ext", sub_type: "unternehmen", bio: null, address: null, extern_status: "pending" },
      { name: "Bäcker Schulz", slug: "baecker", sub_type: "unternehmen", bio: null, address: null, extern_status: null },
    ],
    businesses: [
      { name: "Bäcker Schulz", slug: "baecker-schulz", description: null, category: "food", address: null },
      { name: "Fahrrad Meyer", slug: "rad", description: null, category: "shop", address: null, owner_wallet_address: W },
    ],
  });
  const r = await listOrgs(db, "roebel", { limit: 10 });
  assert.deepEqual(r.orgs.map((o) => o.name), ["SV Röbel", "Bäcker Schulz", "Fahrrad Meyer"]);
  assert.equal(r.orgs[2].url, "https://www.roebel.app/app/gewerbe/rad");
  assert.ok(!hasWallet(r));
});

test("getOrg returns org profile with deep links", async () => {
  const db = fakeDb({
    accounts: [{ id: "a1", name: "SV Röbel", slug: "sv", sub_type: "verein", bio: "Fußball", address: "Platz 1", opening_hours: null, is_verified: true, extern_status: null }],
    events: [{ id: "e1", title: "Spiel", date: "2999-01-01", time: null, location: "Platz" }],
    restaurants: [],
    blog_articles: [],
    account_owners: [{ account_id: "a1" }],
  });
  const o = (await getOrg(db, "roebel", { slug: "sv" })) as Record<string, unknown> & { naechste_veranstaltungen: { url: string }[] };
  assert.equal(o.art, "Verein");
  assert.equal(o.url, "https://www.roebel.app/app/orgs/sv");
  assert.equal(o.naechste_veranstaltungen[0].url, "https://www.roebel.app/app/events/e1");
});
