import { test } from "node:test";
import assert from "node:assert/strict";
import { isToolInputError } from "../errors";
import type { HarnessContext } from "../types";
import { actionsDeps } from "./actions";
import {
  categoryDay, dayCategoryName, mittagstischDeps, pickRestaurant, planWeek, replacedCategories, setMittagstisch, weekBounds,
} from "./mittagstisch";
import type { PlannedDay, PlannedWeek, WeekMenu } from "./mittagstisch";

const NOW = new Date("2026-11-23T08:00:00Z"); // Monday
const inputError = (re: RegExp) => (err: unknown) => { assert.ok(isToolInputError(err), String(err)); assert.match((err as Error).message, re); return true; };

const ctx = (orgs = [{ id: "org-1", name: "Bistro zur Waage", role: "owner", kind: "restaurant" }]): HarnessContext => ({
  tenant: { id: "roebel", name: "Röbel/Müritz", region: "", timezone: "Europe/Berlin", locale: "de", appOrigin: "https://www.roebel.app", facts: [] },
  wallet: "0x" + "11".repeat(20), threadId: "t", botId: "b", taskId: null, emitPart: () => {},
  profile: { displayName: "Max", username: "max", isCitizen: true, orgs },
});

test("week helpers: bounds, category names, day parsing", () => {
  assert.deepEqual(weekBounds("2026-11-26"), { monday: "2026-11-23", sunday: "2026-11-29" });
  assert.deepEqual(weekBounds("2026-11-23"), { monday: "2026-11-23", sunday: "2026-11-29" });
  assert.deepEqual(weekBounds("2026-11-29"), { monday: "2026-11-23", sunday: "2026-11-29" });
  assert.equal(dayCategoryName("2026-11-24"), "Dienstag, 24.11.");
  assert.equal(categoryDay("Mittwoch, 25.11.", "2026-11-24"), "2026-11-25");
  assert.equal(categoryDay("FREITAG", "2026-11-24"), "2026-11-27");
  assert.equal(categoryDay("Mo", "2026-11-24"), "2026-11-23");
  assert.equal(categoryDay("Montag, 04.01.", "2026-12-28"), "2027-01-04");
  assert.equal(categoryDay("Tagessuppe", "2026-11-24"), null);
});

test("planWeek: sorts, validates one week, rejects duplicates and past days", () => {
  const w = planWeek({
    price: 7.5,
    days: [
      { date: "2026-11-26", dishes: [{ name: "Linsensuppe", vegetarian: true }] },
      { date: "2026-11-24", dishes: [{ name: " Schnitzel ", description: "mit Bratkartoffeln", price: 8.9 }] },
    ],
  }, NOW);
  assert.equal(w.first, "2026-11-24");
  assert.equal(w.last, "2026-11-26");
  assert.equal(w.price, 7.5);
  assert.deepEqual(w.days.map((d) => d.category), ["Dienstag, 24.11.", "Donnerstag, 26.11."]);
  assert.deepEqual(w.days[0].dishes[0], { name: "Schnitzel", description: "mit Bratkartoffeln", price: 8.9, vegetarian: false });

  assert.throws(() => planWeek({ days: [{ date: "2026-11-27", dishes: [{ name: "Fisch" }] }, { date: "2026-11-30", dishes: [{ name: "Gulasch" }] }] }, NOW), inputError(/einer Woche/));
  assert.throws(() => planWeek({ days: [{ date: "2026-11-24", dishes: [{ name: "A1" }] }, { date: "2026-11-24", dishes: [{ name: "B2" }] }] }, NOW), inputError(/doppelt/));
  assert.throws(() => planWeek({ days: [{ date: "2026-11-20", dishes: [{ name: "Fisch" }] }] }, NOW), inputError(/Vergangenheit/));
  assert.throws(() => planWeek({ days: [{ date: "2026-11-24", dishes: [{ name: "0x" + "ab".repeat(20) }] }] }, NOW), inputError(/Wallet/));
});

test("pickRestaurant + replacedCategories", () => {
  const a = { id: "r1", name: "Bistro zur Waage", orgSlug: "waage" };
  const b = { id: "r2", name: "Waage Café", orgSlug: "waage" };
  assert.equal(pickRestaurant([a], undefined, "X").id, "r1");
  assert.equal(pickRestaurant([a, b], "waage café", "X").id, "r2");
  assert.throws(() => pickRestaurant([a, b], undefined, "X"), inputError(/Zur Wahl/));
  assert.throws(() => pickRestaurant([], undefined, "Heimatverein"), inputError(/noch keine Speisekarte/));

  const menu: WeekMenu = { id: "m1", start_date: "2026-11-24", end_date: "2026-11-27", categories: [
    { id: "c-di", name: "Dienstag, 24.11." }, { id: "c-mi", name: "Mittwoch, 25.11." }, { id: "c-x", name: "Dessert" },
  ] };
  const w = planWeek({ days: [{ date: "2026-11-25", dishes: [{ name: "Eintopf" }] }, { date: "2026-11-27", dishes: [{ name: "Fisch" }] }] }, NOW);
  assert.deepEqual(replacedCategories(menu, w).map((c) => c.id), ["c-mi"]);
  assert.deepEqual(replacedCategories(null, w), []);
});

/** Stubs both DB seams; records writes. */
function stub(menu: WeekMenu | null) {
  const savedA = { ...actionsDeps };
  const savedM = { ...mittagstischDeps };
  const log: string[] = [];
  Object.assign(actionsDeps, {
    executedToday: async () => 0,
    orgForManager: async () => ({ id: "org-1", name: "Bistro zur Waage", contact_email: null }),
  });
  Object.assign(mittagstischDeps, {
    restaurantsForOrg: async () => [{ id: "r1", name: "Bistro zur Waage", orgSlug: "bistro-zur-waage" }],
    weekMenu: async () => menu,
    createMenu: async (_r: string, w: PlannedWeek) => { log.push(`create ${w.first}..${w.last}`); return "m-new"; },
    updateMenu: async (id: string, p: Record<string, unknown>) => { log.push(`update ${id} ${p.start_date}..${p.end_date}`); },
    insertDay: async (id: string, d: PlannedDay) => { log.push(`insert ${id} ${d.category} ${d.dishes.length}`); },
    deleteCategories: async (ids: string[]) => { if (ids.length) log.push(`delete ${ids.join(",")}`); },
  });
  return { log, restore: () => { Object.assign(actionsDeps, savedA); Object.assign(mittagstischDeps, savedM); } };
}

const futureWeek = () => {
  // Next week's Tuesday + Wednesday, relative to the real clock (execute uses new Date()).
  const { monday } = weekBounds(new Date().toISOString().slice(0, 10));
  const d = (n: number) => new Date(Date.parse(`${monday}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
  return { tue: d(8), wed: d(9) };
};

test("set_mittagstisch: new week creates a menu, inserts days", async () => {
  const { tue, wed } = futureWeek();
  const { log, restore } = stub(null);
  try {
    const input = { days: [{ date: tue, dishes: [{ name: "Schnitzel" }, { name: "Gemüsepfanne", vegetarian: true }] }, { date: wed, dishes: [{ name: "Eintopf" }] }] };
    const preview = await setMittagstisch.preview!(input, ctx());
    assert.equal(preview.kind, "generic");
    assert.match(preview.fields.at(-1)!.value, /Neue Wochenkarte/);
    const res = await setMittagstisch.execute(input, ctx()) as { ok: boolean; url: string };
    assert.ok(res.ok);
    assert.equal(res.url, "https://www.roebel.app/app/orgs/bistro-zur-waage");
    assert.deepEqual(log, [`create ${tue}..${wed}`, `insert m-new ${dayCategoryName(tue)} 2`, `insert m-new ${dayCategoryName(wed)} 1`]);
  } finally { restore(); }
});

test("set_mittagstisch: existing week replaces only the given day, inserts before deleting", async () => {
  const { tue, wed } = futureWeek();
  const menu: WeekMenu = { id: "m1", start_date: tue, end_date: wed, categories: [{ id: "c-tue", name: dayCategoryName(tue) }, { id: "c-wed", name: dayCategoryName(wed) }] };
  const { log, restore } = stub(menu);
  try {
    const input = { days: [{ date: wed, dishes: [{ name: "Linsensuppe" }] }] };
    const preview = await setMittagstisch.preview!(input, ctx());
    assert.match(preview.fields.at(-1)!.value, /Ersetzt/);
    await setMittagstisch.execute(input, ctx());
    assert.deepEqual(log, [`update m1 ${tue}..${wed}`, `insert m1 ${dayCategoryName(wed)} 1`, "delete c-wed"]);
  } finally { restore(); }
});

test("set_mittagstisch: only for org managers", () => {
  assert.equal(setMittagstisch.available!(ctx([])), false);
  assert.equal(setMittagstisch.available!(ctx([{ id: "o", name: "Verein", role: "member", kind: "verein" }])), false);
  assert.equal(setMittagstisch.available!(ctx()), true);
});
