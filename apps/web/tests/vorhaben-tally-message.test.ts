import assert from "node:assert/strict";
import { test } from "node:test";
import { buildTallyConfirmMessage, tallyResultHash, type TallyFacts } from "../src/lib/vorhaben/tally-message";

const facts: TallyFacts = { proposalId: 42n, proposalNumber: 3, title: "150 € Spende für den Vereinsbus",
  forVotes: 7n, againstVotes: 2n, abstainVotes: 1n, tallyAddress: "0x00000000000000000000000000000000000000aa" };

test("message is stable German text containing every fact", () => {
  const m = buildTallyConfirmMessage(facts);
  assert.equal(m,
    `Ich bestätige das Auszählungsergebnis von Vorschlag #3 „150 € Spende für den Vereinsbus": ` +
    `Ja 7, Nein 2, Enthaltung 1. Auszählungsvertrag 0x00000000000000000000000000000000000000aa auf Gnosis. ` +
    `Ergebnis-Hash ${tallyResultHash(facts)}.`);
});

test("hash changes when any count changes", () => {
  assert.notEqual(tallyResultHash(facts), tallyResultHash({ ...facts, forVotes: 8n }));
  assert.match(tallyResultHash(facts), /^0x[0-9a-f]{64}$/);
});
