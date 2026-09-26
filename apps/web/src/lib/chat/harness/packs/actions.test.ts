import { test } from "node:test";
import assert from "node:assert/strict";
import { isToolInputError } from "../errors";
import { pickRecipient } from "../recipients";
import type { HarnessContext } from "../types";
import {
  ACTION_TOOLS, actionsDeps, allowedImageHost, assertNoAddress, commentOnPost, createFeedPost, createListing,
  createOrgEvent, emailFooter, listingFields, normalizeEventCategory, orderPair, pickManagedOrg, sendDirectMessage,
  sendEmail, submitEvent, validateEmailInput, validateEventDate, validateTime,
} from "./actions";

const SELF = "0x" + "11".repeat(20);
const ANNA = "0x" + "aa".repeat(20);
const ctx = (over: Partial<HarnessContext> = {}): HarnessContext => ({
  tenant: { id: "roebel", name: "Röbel/Müritz", region: "", timezone: "Europe/Berlin", locale: "de", appOrigin: "https://www.roebel.app", facts: [] },
  wallet: SELF, threadId: "t", botId: "b", taskId: null, emitPart: () => {},
  profile: { displayName: "Max", username: "max", isCitizen: true, orgs: [] },
  ...over,
});

/** Stubs every DB seam; returns a restore fn. */
function stub(over: Partial<typeof actionsDeps> = {}) {
  const saved = { ...actionsDeps };
  Object.assign(actionsDeps, {
    userRow: async () => ({ is_verified_citizen: true, tier: "resident", email: "max@example.org", display_name: "Max" }),
    personalAccountId: async (w: string) => (w === SELF ? "acc-self" : "acc-anna"),
    executedToday: async () => 0,
    resolve: async (q: string) => pickRecipient([
      { wallet_address: ANNA, username: "anna", display_name: "Anna Schulz" },
      { wallet_address: "0x" + "ab".repeat(20), username: "anna2", display_name: "Anna Schulz" },
    ], q, SELF),
    post: async () => ({ id: "5f0c3c8e-1d2b-4c3a-9e8f-0a1b2c3d4e5f", content: "Wer kennt einen Klempner?", status: "published" }),
    orgForManager: async () => ({ id: "org-1", name: "Heimatverein", contact_email: "verein@example.org" }),
    ...over,
  });
  return () => Object.assign(actionsDeps, saved);
}

const inputError = (re: RegExp) => (err: unknown) => { assert.ok(isToolInputError(err), String(err)); assert.match((err as Error).message, re); return true; };

test("validateEventDate: format, real date, not past", () => {
  const now = new Date("2026-09-26T10:00:00Z");
  assert.equal(validateEventDate("2026-10-03", now), "2026-10-03");
  assert.equal(validateEventDate("2026-09-26", now), "2026-09-26");
  assert.throws(() => validateEventDate("03.10.2026", now), inputError(/JJJJ-MM-TT/));
  assert.throws(() => validateEventDate("2026-02-30", now), inputError(/gibt es nicht/));
  assert.throws(() => validateEventDate("2026-09-25", now), inputError(/Vergangenheit/));
});

test("validateTime + category normalisation", () => {
  assert.equal(validateTime("9:30"), "09:30");
  assert.equal(validateTime("19.30 Uhr"), "19:30");
  assert.equal(validateTime(undefined), null);
  assert.throws(() => validateTime("25:00"), inputError(/HH:MM/));
  assert.equal(normalizeEventCategory("musik"), "Musik");
  assert.equal(normalizeEventCategory("Party"), "Sonstige");
});

test("listingFields: price types, categories, service detection", () => {
  assert.deepEqual(listingFields({ price: 12.5, category: "Moebel" }), { price: 12.5, price_type: "fixed", category: "moebel", listing_type: "product" });
  assert.equal(listingFields({ price: 0, category: "garten" }).price_type, "free");
  assert.equal(listingFields({ category: "garten" }).price_type, "negotiable");
  assert.equal(listingFields({ category: "nachhilfe" }).listing_type, "service");
  assert.throws(() => listingFields({ category: "autos" }), inputError(/Kategorie/));
  assert.throws(() => listingFields({ price: -1, category: "garten" }), inputError(/Preis/));
});

test("validateEmailInput: single address, header injection stripped", () => {
  assert.deepEqual(validateEmailInput({ to: " amt@roebel.de ", subject: "Hallo\r\nBcc: x@y.de", body: " Text " }),
    { to: "amt@roebel.de", subject: "Hallo Bcc: x@y.de", body: "Text" });
  for (const to of ["a@b.de, c@d.de", "kein-at", "a@b", "<a@b.de>"]) {
    assert.throws(() => validateEmailInput({ to, subject: "s", body: "b" }), inputError(/E-Mail-Adresse/));
  }
  assert.match(emailFooter(ctx()), /Gesendet mit Mecky im Auftrag von Max$/);
});

test("image hosts, address guard, pair order, org choice", () => {
  assert.ok(allowedImageHost("https://abc.supabase.co/storage/v1/object/public/images/x.jpg", ""));
  assert.ok(!allowedImageHost("http://abc.supabase.co/x.jpg", ""));
  assert.ok(!allowedImageHost("https://evil.example/x.jpg", ""));
  assert.throws(() => assertNoAddress(`schick an ${ANNA}`), inputError(/Wallet/));
  assert.deepEqual(orderPair("b", "a"), ["a", "b"]);
  const orgs = [{ id: "1", name: "Heimatverein" }, { id: "2", name: "Café Mühle" }];
  assert.equal(pickManagedOrg(orgs, "heimatverein").id, "1");
  assert.throws(() => pickManagedOrg(orgs, undefined), inputError(/Welche|welche/));
  assert.throws(() => pickManagedOrg([], undefined), inputError(/keine Organisation/));
  assert.equal(pickManagedOrg([orgs[0]], undefined).id, "1");
});

test("schemas reject bad input", () => {
  assert.equal(createFeedPost.inputSchema.safeParse({ text: "" }).success, false);
  assert.equal(createFeedPost.inputSchema.safeParse({ text: "x".repeat(501) }).success, false);
  assert.equal(createFeedPost.inputSchema.safeParse({ text: "Hallo", imageUrl: "nope" }).success, false);
  assert.equal(commentOnPost.inputSchema.safeParse({ postId: "p" }).success, false);
  assert.equal(submitEvent.inputSchema.safeParse({ title: "Fest", date: "2026-10-03", location: "Markt" }).success, false);
  assert.equal(createListing.inputSchema.safeParse({ title: "Sofa", description: "d", category: "moebel", price: -5 }).success, false);
  assert.equal(sendDirectMessage.inputSchema.safeParse({ recipient: "anna" }).success, false);
  assert.equal(sendEmail.inputSchema.safeParse({ to: "a@b.de", subject: "", body: "x" }).success, false);
});

test("risks + availability", () => {
  for (const t of ACTION_TOOLS) assert.equal(t.risk, t.name === "send_email" ? "external" : "public", t.name);
  assert.equal(createOrgEvent.available!(ctx()), false);
  assert.equal(createOrgEvent.available!(ctx({ profile: { displayName: "Max", username: "max", isCitizen: true, orgs: [{ id: "o", name: "V", role: "member", kind: "verein" }] } })), false);
  assert.equal(createOrgEvent.available!(ctx({ profile: { displayName: "Max", username: "max", isCitizen: true, orgs: [{ id: "o", name: "V", role: "admin", kind: "verein" }] } })), true);
});

test("create_feed_post: non-citizens get a clear note, limit is enforced", async () => {
  let restore = stub({ userRow: async () => ({ is_verified_citizen: false, tier: "resident", email: null, display_name: "Max" }) });
  try {
    await assert.rejects(() => createFeedPost.preview!({ text: "Hallo Röbel" }, ctx()), inputError(/verifizierte/));
  } finally { restore(); }
  restore = stub({ executedToday: async () => 3 });
  try {
    await assert.rejects(() => createFeedPost.preview!({ text: "Hallo Röbel" }, ctx()), inputError(/Tageslimit/));
  } finally { restore(); }
});

test("send_direct_message: ambiguous recipient asks, exact one resolves", async () => {
  const restore = stub();
  try {
    await assert.rejects(() => sendDirectMessage.preview!({ recipient: "anna schulz", text: "Hi" }, ctx()), inputError(/Mehrere Personen/));
    const p = await sendDirectMessage.preview!({ recipient: "@anna", text: "Hi" }, ctx());
    assert.deepEqual(p.fields, [{ label: "An", value: "Anna Schulz" }]);
  } finally { restore(); }
});

test("submit_event needs a profile email", async () => {
  const restore = stub({ userRow: async () => ({ is_verified_citizen: true, tier: null, email: null, display_name: "Max" }) });
  try {
    await assert.rejects(() => submitEvent.preview!({ title: "Fest", date: "2099-01-01", location: "Markt", description: "d" }, ctx()), /zu weit|E-Mail/);
  } finally { restore(); }
});

test("no preview or summary contains 0x", async () => {
  const restore = stub();
  const org = ctx({ profile: { displayName: "Max", username: "max", isCitizen: true, orgs: [{ id: "org-1", name: "Heimatverein", role: "owner", kind: "verein" }] } });
  const future = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
  const cases: [typeof ACTION_TOOLS[number], unknown, HarnessContext][] = [
    [createFeedPost, { text: "Hallo Röbel" }, ctx()],
    [commentOnPost, { postId: "5f0c3c8e-1d2b-4c3a-9e8f-0a1b2c3d4e5f", text: "Frag mal Herrn Kurz" }, ctx()],
    [submitEvent, { title: "Herbstfest", date: future, time: "15:00", location: "Marktplatz", description: "Mit Musik", category: "Musik" }, ctx()],
    [createOrgEvent, { title: "Chorprobe", date: future, location: "Kirche", description: "Offen", ticketPrice: 5 }, org],
    [createListing, { title: "Sofa", description: "Gut erhalten", category: "moebel", price: 40 }, ctx()],
    [sendDirectMessage, { recipient: "@anna", text: "Hallo Anna" }, ctx()],
    [sendEmail, { to: "amt@roebel.de", subject: "Laterne", body: "Die Laterne ist kaputt." }, ctx()],
  ];
  try {
    for (const [tool, input, c] of cases) {
      const parsed = tool.inputSchema.parse(input);
      const preview = await tool.preview!(parsed, c);
      assert.doesNotMatch(JSON.stringify(preview) + tool.summarize(parsed, c), /0x[0-9a-f]{6}/i, tool.name);
    }
  } finally { restore(); }
});
