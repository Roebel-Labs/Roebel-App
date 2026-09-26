import { test } from "node:test";
import assert from "node:assert/strict";
import { INSPIRATION_TASKS, SIGNALS, rankInspiration, type Audience, type InspirationTask } from "./catalog";

const AUDIENCES: Audience[] = ["citizen", "restaurant", "verein", "business", "tourism", "kommune"];
const KNOWN_SIGNALS = new Set<string>(Object.values(SIGNALS));

test("catalog has 40–60 tasks with unique ids", () => {
  assert.ok(INSPIRATION_TASKS.length >= 40 && INSPIRATION_TASKS.length <= 60, `got ${INSPIRATION_TASKS.length}`);
  const ids = new Set(INSPIRATION_TASKS.map((t) => t.id));
  assert.equal(ids.size, INSPIRATION_TASKS.length);
});

test("every task respects the copy and data contract", () => {
  for (const t of INSPIRATION_TASKS) {
    assert.ok(t.title.length > 0 && t.title.length <= 48, `title too long: ${t.id} (${t.title.length})`);
    assert.ok(t.pitch.length > 20, `pitch too short: ${t.id}`);
    assert.ok(t.starterPrompt.length > 40, `starterPrompt too short: ${t.id}`);
    assert.ok(t.audience.length > 0, `no audience: ${t.id}`);
    assert.ok(t.requiredTools.length > 0, `no tools: ${t.id}`);
    for (const s of t.signals) assert.ok(KNOWN_SIGNALS.has(s), `unknown signal ${s} in ${t.id}`);
    const text = `${t.title} ${t.pitch} ${t.starterPrompt}`;
    assert.doesNotMatch(text, /\bCRC\b/, `CRC in ${t.id}`);
    assert.doesNotMatch(text, /0x[0-9a-fA-F]{6,}/, `wallet-like address in ${t.id}`);
    assert.doesNotMatch(text, /Röbel ?Card/i, `Röbel Card in ${t.id}`);
    if (t.recurring) assert.ok(t.recurring.suggestion.length > 0);
  }
});

test("every audience has at least five tasks", () => {
  for (const a of AUDIENCES) {
    const n = INSPIRATION_TASKS.filter((t) => t.audience.includes(a)).length;
    assert.ok(n >= 5, `${a} has only ${n}`);
  }
});

const task = (id: string, over: Partial<InspirationTask> = {}): InspirationTask => ({
  id,
  audience: ["citizen"],
  title: id,
  pitch: "p",
  value: { kind: "good", estimate: "x" },
  botSlug: "mecky",
  starterPrompt: "s",
  requiredTools: ["search_roebel"],
  signals: [],
  tier: "free",
  ...over,
});

test("rankInspiration filters by audience and orders by matched signals", () => {
  const tasks = [
    task("a", { signals: ["x"] }),
    task("b", { signals: ["x", "y"], botSlug: "recherche" }),
    task("c", { audience: ["verein"], signals: ["x", "y", "z"] }),
  ];
  const out = rankInspiration(tasks, new Set(["x", "y"]), "citizen", 5).map((t) => t.id);
  assert.deepEqual(out, ["b", "a"]);
});

test("rankInspiration breaks ties by value kind, routine, then catalog order", () => {
  const tasks = [
    task("good", { botSlug: "mecky" }),
    task("time", { value: { kind: "time", estimate: "" }, botSlug: "tagesplaner" }),
    task("money", { value: { kind: "money", estimate: "" }, botSlug: "recherche" }),
    task("good-routine", { recurring: { suggestion: "jeden Montag" }, botSlug: "design" }),
    task("good-2", { botSlug: null }),
  ];
  const out = rankInspiration(tasks, new Set(), "citizen", 5).map((t) => t.id);
  assert.deepEqual(out, ["money", "time", "good-routine", "good", "good-2"]);
});

test("rankInspiration mixes bots but still fills the limit", () => {
  const tasks = [
    task("m1", { signals: ["s"] }),
    task("m2", { signals: ["s"] }),
    task("m3", { signals: ["s"] }),
    task("r1", { botSlug: "recherche" }),
  ];
  assert.deepEqual(rankInspiration(tasks, new Set(["s"]), "citizen", 2).map((t) => t.id), ["m1", "r1"]);
  assert.deepEqual(rankInspiration(tasks, new Set(["s"]), "citizen", 4).map((t) => t.id), ["m1", "m2", "r1", "m3"]);
  assert.deepEqual(rankInspiration(tasks, new Set(), "citizen", 0), []);
});

test("real catalog: a restaurant before the season sees restaurant work first", () => {
  const signals = new Set<string>([SIGNALS.restaurant, SIGNALS.noMenu, SIGNALS.preSeason, SIGNALS.lowRating]);
  const top = rankInspiration(INSPIRATION_TASKS, signals, "restaurant", 6);
  assert.equal(top.length, 6);
  assert.ok(top.every((t) => t.audience.includes("restaurant")));
  assert.ok(top.some((t) => t.id === "restaurant-menu-digital"));
});

test("real catalog: a Verein in a grant window gets grant work on top", () => {
  const signals = new Set<string>([SIGNALS.verein, SIGNALS.grantWindow]);
  const top = rankInspiration(INSPIRATION_TASKS, signals, "verein", 4);
  assert.ok(top.slice(0, 2).some((t) => t.id === "verein-grant-finder"));
  assert.ok(top.every((t) => t.audience.includes("verein")));
});
