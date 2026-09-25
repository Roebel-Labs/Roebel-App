import { test } from "node:test";
import assert from "node:assert/strict";
import { pickResponders, rowsToModelMessages } from "./runtime";

const A = { id: "a", name: "Mecky" };
const B = { id: "b", name: "Recherche" };

test("pickResponders: direct thread → the one bot", () => {
  assert.deepEqual(pickResponders([A], { text: "Hallo" }), ["a"]);
});

test("pickResponders: mentions (ids or @Name) win, in thread order", () => {
  assert.deepEqual(pickResponders([A, B], { text: "hey", mentionBotIds: ["b"] }), ["b"]);
  assert.deepEqual(pickResponders([A, B], { text: "@recherche und @Mecky?" }), ["a", "b"]);
  assert.deepEqual(pickResponders([A, B], { text: "x", mentionBotIds: ["zzz"] }), ["a", "b"]);
});

test("pickResponders: reply to a bot addresses that bot", () => {
  assert.deepEqual(pickResponders([A, B], { text: "genau", replyToBotId: "b" }), ["b"]);
});

test("rowsToModelMessages: own bot = assistant, others prefixed, starts with user", () => {
  const rows = [
    { id: "1", role: "bot" as const, bot_id: "a", parts: [{ type: "text", text: "Moin!" }] },
    { id: "2", role: "user" as const, bot_id: null, parts: [{ type: "image", url: "https://x.test/old.jpg" }, { type: "text", text: "Was ist das?" }] },
    { id: "3", role: "bot" as const, bot_id: "b", parts: [{ type: "text", text: "Ein Hafen." }] },
    { id: "4", role: "user" as const, bot_id: null, parts: [{ type: "image", url: "https://x.test/new.jpg" }, { type: "text", text: "Und das?" }] },
  ];
  const msgs = rowsToModelMessages(rows, "a", new Map([["a", "Mecky"], ["b", "Recherche"]]));
  assert.equal(msgs[0].role, "user");
  assert.deepEqual(msgs[1], { role: "assistant", content: "Moin!" });
  assert.deepEqual(msgs[2], { role: "user", content: [{ type: "text", text: "(ein Bild angehängt)" }, { type: "text", text: "Was ist das?" }] });
  assert.deepEqual(msgs[3], { role: "user", content: "[Recherche]: Ein Hafen." });
  const last = msgs[4] as { role: string; content: { type: string }[] };
  assert.equal(last.content[0].type, "image");
});
