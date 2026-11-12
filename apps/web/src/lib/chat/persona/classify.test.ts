import { test } from "node:test";
import assert from "node:assert/strict";
import {
  chunk, contactScore, isAutomated, isProfileWorthy, nameFromEmail, numberCitations, ownText, parseAddresses,
  personSlug, rankContacts, scrubSecrets, stripCitations,
} from "./classify";
import type { ContactStat, MailHeaders } from "./classify";

const h = (over: Partial<MailHeaders>): MailHeaders => ({ from: "Anne Eckloff <a.eckloff@stic.de>", to: "max@example.com", cc: "", subject: "Pitch", date: "", ...over });
const NOW = Date.parse("2026-11-12T12:00:00Z");
const DAY = 86_400_000;

test("parseAddresses reads names and lower-cases emails", () => {
  assert.deepEqual(parseAddresses('"Eckloff, Anne" <A.Eckloff@STIC.de>, lars@outlook.com, Lars Richter <richter-lars@outlook.com>'), [
    { name: "Eckloff, Anne", email: "a.eckloff@stic.de" },
    { name: "", email: "lars@outlook.com" },
    { name: "Lars Richter", email: "richter-lars@outlook.com" },
  ]);
  assert.deepEqual(parseAddresses("a@b.de, A@B.de"), [{ name: "", email: "a@b.de" }]);
  assert.deepEqual(parseAddresses(""), []);
});

test("a person writing from a normal address is not automated", () => {
  assert.equal(isAutomated(h({})), false);
  assert.equal(isAutomated(h({ from: "Verein <info@sv-roebel.de>" })), false, "small clubs write from info@");
});

test("list headers, bulk precedence, categories, noreply and platforms are automated", () => {
  assert.equal(isAutomated(h({ listUnsubscribe: "<mailto:x@y.z>" })), true);
  assert.equal(isAutomated(h({ precedence: "bulk" })), true);
  assert.equal(isAutomated(h({ autoSubmitted: "auto-generated" })), true);
  assert.equal(isAutomated(h({ autoSubmitted: "no" })), false);
  assert.equal(isAutomated(h({ labelIds: ["INBOX", "CATEGORY_UPDATES"] })), true);
  assert.equal(isAutomated(h({ from: "Vercel <notifications@vercel.com>" })), true);
  assert.equal(isAutomated(h({ from: "no-reply@irgendwo.de" })), true);
  assert.equal(isAutomated(h({ from: "GitHub <ci@github.com>" })), true);
  assert.equal(isAutomated(h({ from: "" })), true);
});

const c = (over: Partial<ContactStat>): ContactStat => ({ email: "a@b.de", name: "A", sent: 0, received: 0, lastAt: NOW, meetings: 0, ...over });

test("someone the user never wrote to and never met is not a contact", () => {
  assert.equal(contactScore(c({ received: 40 }), NOW), 0);
  assert.equal(isProfileWorthy(c({ received: 40 })), false);
});

test("reciprocal and recent contacts rank first", () => {
  const ranked = rankContacts([
    c({ email: "old@x.de", sent: 6, received: 6, lastAt: NOW - 300 * DAY }),
    c({ email: "oneway@x.de", sent: 3, lastAt: NOW - DAY }),
    c({ email: "close@x.de", sent: 3, received: 3, lastAt: NOW - DAY }),
    c({ email: "spam@x.de", received: 9 }),
  ], NOW);
  assert.deepEqual(ranked.map((x) => x.email), ["close@x.de", "oneway@x.de", "old@x.de"]);
});

test("a person page needs a real exchange", () => {
  assert.equal(isProfileWorthy(c({ sent: 1 })), false);
  assert.equal(isProfileWorthy(c({ sent: 2 })), true);
  assert.equal(isProfileWorthy(c({ sent: 1, received: 1 })), true);
  assert.equal(isProfileWorthy(c({ meetings: 1, received: 1 })), true);
});

test("personSlug is stable, case-insensitive and hides the address", () => {
  assert.equal(personSlug("A@B.de", "x"), personSlug("a@b.de", "y"));
  assert.match(personSlug("a@b.de", ""), /^person-[0-9a-f]{10}$/);
  assert.notEqual(personSlug(null, "Anne"), personSlug(null, "Lars"));
});

test("nameFromEmail", () => {
  assert.equal(nameFromEmail("gordon.dyballa@bht-berlin.de"), "Gordon Dyballa");
  assert.equal(nameFromEmail("max.brych03+test@gmail.com"), "Max Brych03");
});

test("ownText cuts quoted replies and signatures", () => {
  const body = "Hallo Anne,\n\nwir bewerben uns für Kohorte 4.\n\nLG Max\n\nAm Di., 3. Nov. 2026 um 10:12 Uhr schrieb Anne Eckloff <a.eckloff@stic.de>:\n> leider nicht weiter\n> Gruß";
  assert.equal(ownText(body), "Hallo Anne,\n\nwir bewerben uns für Kohorte 4.\n\nLG Max");
  assert.equal(ownText("Danke!\n-- \nMax Brych\nTel 123"), "Danke!");
  assert.equal(ownText("Passt.\n\nOn Tue, Nov 3, 2026 at 10:12 AM Anne wrote:\n> x"), "Passt.");
});

test("ownText marks a pure forward and keeps what was forwarded", () => {
  const t = ownText("---------- Forwarded message ---------\nVon: Punkt Werbung <info@punkt.de>\nRechnung RE026-433");
  assert.match(t, /^\[nur weitergeleitet, ohne eigenen Text\]/);
  assert.match(t, /RE026-433/);
});

test("ownText caps the length", () => {
  assert.equal(ownText("x".repeat(5000), 100).length, 100);
});

test("scrubSecrets removes keys, tokens, wallets, card numbers and IBANs", () => {
  const s = scrubSecrets(`key ${["sk", "ant", "x".repeat(24)].join("-")} wallet 0x3A08c86Efc5ff38CC35d850F1D4d564e497bFDEa card 4242 4242 4242 4242 iban DE89 3704 0044 0532 0130 00 ok`);
  assert.doesNotMatch(s, /sk-ant|xxxx|0x3A08|4242|3704/);
  assert.match(s, /ok$/);
  assert.equal(scrubSecrets("Termin am 12.11.2026 um 10:30, Rechnung RE026-433"), "Termin am 12.11.2026 um 10:30, Rechnung RE026-433");
});

test("numberCitations numbers known refs in order of first use and drops invented ones", () => {
  const known = new Map([
    ["s12", { ref: "s12", label: "E-Mail an a@b.de · „Pitch“", date: "2026-11-02" }],
    ["a3", { ref: "a3", label: "Benachrichtigung von Vercel · „Payment failed“", date: "2026-11-11" }],
  ]);
  const { body, sources } = numberCitations("Zahlung offen [a3]. Bewerbung geplant [s12, s999]. Wieder [a3] .", known);
  assert.equal(body, "Zahlung offen [[1]]. Bewerbung geplant [[2]]. Wieder [[1]].");
  assert.deepEqual(sources.map((s) => [s.n, s.date]), [[1, "2026-11-11"], [2, "2026-11-02"]]);
});

test("numberCitations leaves normal brackets and wiki links alone", () => {
  const { body, sources } = numberCitations("Siehe [Projekte](wiki:projects) und [Team].", new Map());
  assert.equal(body, "Siehe [Projekte](wiki:projects) und [Team].");
  assert.equal(sources.length, 0);
});

test("stripCitations", () => {
  assert.equal(stripCitations("Plant Kohorte 4 [[2]][[3]]. Offen [s1]."), "Plant Kohorte 4. Offen.");
});

test("chunk", () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
});
