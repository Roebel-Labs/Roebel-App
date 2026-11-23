import { test } from "node:test";
import assert from "node:assert/strict";
import type { ChatPart } from "../../types";
import type { HarnessContext } from "../types";
import { addDays, berlinToday, buildScheduleDays, dayLabel, scheduleDeps, scheduleTitle, showSchedule } from "./schedule";

const entry = (date: string, title: string, time: string | null, tag = "Vorgemerkt") =>
  ({ date, title, time, location: "Marktplatz", url: `https://www.roebel.app/app/events/${title}`, tag });

const ctx = (partTypes: string[] | null, emitted: ChatPart[] = []): HarnessContext => ({
  tenant: { id: "roebel", name: "Röbel/Müritz", region: "", timezone: "Europe/Berlin", locale: "de", appOrigin: "https://www.roebel.app", facts: [] },
  wallet: "0x" + "11".repeat(20), threadId: "t", botId: "b", taskId: null,
  emitPart: (p) => { emitted.push(p); },
  profile: null,
  turn: { partTypes },
});

test("date helpers + labels", () => {
  assert.equal(addDays("2026-11-30", 2), "2026-12-02");
  assert.equal(berlinToday(new Date("2026-11-23T23:30:00Z")), "2026-11-24");
  assert.equal(dayLabel("2026-11-24", "2026-11-24"), "Heute");
  assert.equal(dayLabel("2026-11-25", "2026-11-24"), "Morgen");
  assert.equal(dayLabel("2026-11-27", "2026-11-24"), "Freitag, 27.11.");
  assert.deepEqual(scheduleTitle("2026-11-24", 7, "2026-11-24"), { title: "Deine nächsten 7 Tage", subtitle: "24.11. – 30.11." });
  assert.equal(scheduleTitle("2026-11-26", 1, "2026-11-24").subtitle, "Donnerstag, 26.11.");
});

test("buildScheduleDays: days sorted, items by time, unknown time last", () => {
  const days = buildScheduleDays([
    entry("2026-11-26", "Chor", null),
    entry("2026-11-24", "Markt", "09:00"),
    entry("2026-11-26", "Lesung", "19:30"),
    entry("2026-11-26", "Frühstück", "08:00"),
  ]);
  assert.deepEqual(days.map((d) => d.date), ["2026-11-24", "2026-11-26"]);
  assert.deepEqual(days[1].items.map((i) => i.title), ["Frühstück", "Lesung", "Chor"]);
});

test("show_schedule: card for clients that render it, text data otherwise", async () => {
  const saved = scheduleDeps.entries;
  let asked: { from: string; to: string } | null = null;
  scheduleDeps.entries = async (_c, a) => { asked = a; return [entry(a.from, "Markt", "09:00")]; };
  try {
    const emitted: ChatPart[] = [];
    const res = await showSchedule.execute({ days: 7, include_org_events: true }, ctx(["schedule"], emitted)) as { termine: number };
    assert.equal(res.termine, 1);
    assert.equal(emitted.length, 1);
    const part = emitted[0] as Extract<ChatPart, { type: "schedule" }>;
    assert.equal(part.type, "schedule");
    assert.equal(part.days[0].items[0].title, "Markt");
    assert.equal(asked!.to, addDays(asked!.from, 6));

    const plain: ChatPart[] = [];
    const text = await showSchedule.execute({ from: "2026-12-01", days: 3, include_org_events: false }, ctx(null, plain)) as { tage: { termine: unknown[] }[] };
    assert.equal(plain.length, 0);
    assert.equal(text.tage[0].termine.length, 1);
    assert.deepEqual(asked, { from: "2026-12-01", to: "2026-12-03", includeOrgEvents: false });
  } finally { scheduleDeps.entries = saved; }
});

test("show_schedule: empty week still shows a card with a note", async () => {
  const saved = scheduleDeps.entries;
  scheduleDeps.entries = async () => [];
  try {
    const emitted: ChatPart[] = [];
    await showSchedule.execute({ days: 7, include_org_events: true }, ctx(["schedule"], emitted));
    const part = emitted[0] as Extract<ChatPart, { type: "schedule" }>;
    assert.equal(part.days.length, 0);
    assert.match(part.empty ?? "", /nichts vorgemerkt/);
  } finally { scheduleDeps.entries = saved; }
});
