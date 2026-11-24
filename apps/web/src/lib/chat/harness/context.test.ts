import { test } from "node:test";
import assert from "node:assert/strict";
import { formatHarnessContext, formatProfileBlock, toProfile, POLICY_TEXT } from "./context";
import { cleanFact } from "./memory";
import { ROEBEL_TENANT } from "./tenants";

test("toProfile: display name, citizen (flag or tier), orgs only", () => {
  const p = toProfile(
    { display_name: " Anna ", username: "anna_r", is_verified_citizen: false, tier: "citizen" },
    [
      { role: "owner", accounts: { id: "p1", name: "Anna R.", account_type: "personal", sub_type: null } },
      { role: "admin", accounts: [{ id: "o1", name: "SV Röbel", account_type: "organisation", sub_type: "verein" }] },
      { role: "member", accounts: null },
    ],
  );
  assert.deepEqual(p, {
    displayName: "Anna", username: "anna_r", isCitizen: true,
    orgs: [{ id: "o1", name: "SV Röbel", role: "admin", kind: "verein" }],
  });
  assert.equal(toProfile(null, []), null);
  assert.equal(toProfile({ display_name: null, username: null, is_verified_citizen: null, tier: "guest" },
    [{ role: "owner", accounts: { id: "p", name: "Ben", account_type: "personal", sub_type: null } }])?.displayName, "Ben");
});

test("formatProfileBlock: German lines, never a wallet", () => {
  const block = formatProfileBlock({
    displayName: "Anna", username: "anna_r", isCitizen: true,
    orgs: [{ id: "o1", name: "Hafenbistro", role: "owner", kind: "restaurant" }],
  });
  assert.match(block, /^Über den Menschen:/);
  assert.match(block, /- Name: Anna/);
  assert.match(block, /@anna_r/);
  assert.match(block, /Verifizierte Bürgerin/);
  assert.match(block, /Hafenbistro \(Gastronomie, Rolle: Inhaber\/in\)/);
  assert.doesNotMatch(block, /0x/);
  assert.match(formatProfileBlock(null), /Noch kein Profil/);
});

test("formatHarnessContext: profile, tenant facts, memories with ids, policy", () => {
  const text = formatHarnessContext({
    tenant: ROEBEL_TENANT, profile: null,
    memories: [{ id: "m1", botId: null, fact: "Mag keine Pilze.", createdAt: "2026-09-26T10:00:00Z" }],
  });
  assert.match(text, /Über Röbel\/Müritz \(Mecklenburgische Seenplatte\):/);
  assert.match(text, /Was du dir gemerkt hast/);
  assert.match(text, /- Mag keine Pilze\. \(id: m1\)/);
  assert.ok(text.includes(POLICY_TEXT));
  assert.match(text, /brauchen eine Freigabe/);
  const noMem = formatHarnessContext({ tenant: ROEBEL_TENANT, profile: null, memories: [], includePolicy: false });
  assert.doesNotMatch(noMem, /gemerkt/);
  assert.doesNotMatch(noMem, /Freigabe/);
  assert.ok(ROEBEL_TENANT.facts.length >= 6 && ROEBEL_TENANT.facts.length <= 10);
});

test("cleanFact: trims, collapses spaces, caps at 500", () => {
  assert.equal(cleanFact("  Hat  zwei Kinder "), "Hat zwei Kinder");
  assert.equal(cleanFact("   "), null);
  assert.equal(cleanFact("x".repeat(600))?.length, 500);
});

test("formatActiveAccountBlock: org mode, member, personal, unknown", async () => {
  const { formatActiveAccountBlock } = await import("./context");
  const profile = {
    displayName: "Max", username: null, isCitizen: true,
    orgs: [
      { id: "11111111-1111-4111-8111-111111111111", name: "Café Hafen", role: "owner", kind: "business" },
      { id: "22222222-2222-4222-8222-222222222222", name: "SV Röbel", role: "member", kind: "verein" },
    ],
  } as never;
  const org = formatActiveAccountBlock(profile, "11111111-1111-4111-8111-111111111111")!;
  assert.match(org, /als Organisation „Café Hafen“/);
  assert.match(org, /org = "Café Hafen"/);
  assert.match(formatActiveAccountBlock(profile, "22222222-2222-4222-8222-222222222222")!, /nur Mitglied/);
  assert.match(formatActiveAccountBlock(profile, "33333333-3333-4333-8333-333333333333")!, /persönlichen Konto/);
  assert.equal(formatActiveAccountBlock(profile, null), null);
});
