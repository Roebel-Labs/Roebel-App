import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveRoutineSchedule } from "./routine-tools";
import { chatPushPayload } from "./push";

const TZ = "Europe/Berlin";

test("resolveRoutineSchedule: the user's words beat wrong structured fields", () => {
  // Model mixed up the weekday (7 → invalid / 1 = Monday) — the phrase wins.
  assert.deepEqual(
    resolveRoutineSchedule({ when: "jeden Sonntag um 8:41", kind: "weekly", weekday: 1, hour: 8, minute: 40 }),
    { kind: "weekly", weekday: 0, hour: 8, minute: 41, tz: TZ },
  );
});

test("resolveRoutineSchedule: falls back to structured fields", () => {
  assert.deepEqual(
    resolveRoutineSchedule({ when: "immer am Wochenanfang früh", kind: "weekly", weekday: 1, hour: 7 }),
    { kind: "weekly", weekday: 1, hour: 7, minute: 0, tz: TZ },
  );
  assert.deepEqual(resolveRoutineSchedule({ kind: "daily", hour: 6, minute: 30 }), { kind: "daily", hour: 6, minute: 30, tz: TZ });
});

test("resolveRoutineSchedule: null when nothing usable", () => {
  assert.equal(resolveRoutineSchedule({ when: "bald mal" }), null);
  assert.equal(resolveRoutineSchedule({ kind: "weekly", hour: 8 }), null);
  assert.equal(resolveRoutineSchedule({}), null);
});

test("chatPushPayload: opens the thread, lowercases the wallet, clips the body", () => {
  const p = chatPushPayload({ wallet: "0xABC", threadId: "t1", title: "Mecky · Essensplan", body: "x".repeat(200) });
  assert.deepEqual(p.walletAddresses, ["0xabc"]);
  assert.deepEqual(p.data, { type: "chat_thread", threadId: "t1" });
  assert.equal(p.type, "chat_thread");
  assert.equal(p.body.length, 140);
  assert.equal(chatPushPayload({ wallet: "0x1", threadId: "t", title: "A", body: "  " }).body, "Neue Nachricht");
});
