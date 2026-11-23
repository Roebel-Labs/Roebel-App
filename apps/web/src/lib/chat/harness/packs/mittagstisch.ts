// Pack 'actions' — set_mittagstisch: an org that runs a restaurant enters its
// weekly lunch menu by chatting ("Dienstag Schnitzel, Mittwoch Linsensuppe").
// Same rows as the web dashboard (special-menus-tab): one special_menus row per
// week ("Mittagstisch", start/end = first/last day), one special_menu_categories
// row per day named "Dienstag, 24.11." (apps/expo/lib/special-menu-days.ts parses
// that name), dishes in special_menu_items. Inserting a dish without image_url
// fires the live trigger that generates its photo.
import { z } from "zod";
import { ToolInputError } from "../errors";
import type { ApprovalPreview, HarnessContext, HarnessTool, ToolRegistry } from "../types";
import {
  actionsDeps, assertNoAddress, checkLimit, clip, formatEuro, managedOrgs, pickManagedOrg, validateEventDate,
} from "./actions";

async function adminDb() {
  const { createAdminClient } = await import("../../../supabase/admin");
  return createAdminClient();
}

const WEEKDAYS = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

// ---- pure helpers (unit-tested) --------------------------------------------------------

function utcDay(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** 0 = Monday … 6 = Sunday. */
export function weekdayIndex(iso: string): number {
  return (utcDay(iso).getUTCDay() + 6) % 7;
}

/** Monday and Sunday (YYYY-MM-DD) of the week that contains `iso`. */
export function weekBounds(iso: string): { monday: string; sunday: string } {
  const d = utcDay(iso);
  const monday = new Date(d.getTime() - weekdayIndex(iso) * 86_400_000);
  return { monday: isoDay(monday), sunday: isoDay(new Date(monday.getTime() + 6 * 86_400_000)) };
}

/** Category name the app and the dashboard use: "Dienstag, 24.11.". */
export function dayCategoryName(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${WEEKDAYS[weekdayIndex(iso)]}, ${d}.${m}.`;
}

/**
 * Serving day of an existing category name ("Montag, 23.11.", "DIENSTAG", "Fr"),
 * anchored to the menu's week. Mirrors apps/expo/lib/special-menu-days.ts.
 */
export function categoryDay(name: string, menuStart: string | null): string | null {
  if (!menuStart) return null;
  const start = utcDay(menuStart);
  const explicit = /(\d{1,2})\.(\d{1,2})\./.exec(name);
  if (explicit) {
    const d = new Date(Date.UTC(start.getUTCFullYear(), Number(explicit[2]) - 1, Number(explicit[1])));
    if (d.getTime() < start.getTime() - 180 * 86_400_000) d.setUTCFullYear(d.getUTCFullYear() + 1);
    return isoDay(d);
  }
  const lower = name.toLowerCase();
  let idx = WEEKDAYS.findIndex((w) => lower.includes(w.toLowerCase()));
  if (idx < 0) {
    const short = /^\s*(mo|di|mi|do|fr|sa|so)\b/.exec(lower);
    idx = short ? ["mo", "di", "mi", "do", "fr", "sa", "so"].indexOf(short[1]) : -1;
  }
  if (idx < 0) return null;
  const monday = utcDay(weekBounds(menuStart).monday);
  return isoDay(new Date(monday.getTime() + idx * 86_400_000));
}

const dishInput = z.object({
  name: z.string().min(2).max(120).describe("Name des Gerichts, z. B. 'Schweineschnitzel mit Bratkartoffeln'"),
  description: z.string().max(300).optional().describe("Beilagen oder Hinweise (optional)"),
  price: z.number().min(0).max(200).optional().describe("Preis in Euro, nur wenn er vom Standardpreis abweicht"),
  vegetarian: z.boolean().optional().describe("true, wenn vegetarisch"),
});
const dayInput = z.object({
  date: z.string().describe("Tag JJJJ-MM-TT"),
  dishes: z.array(dishInput).min(1).max(6).describe("Gerichte an diesem Tag"),
});
const mittagstischInput = z.object({
  days: z.array(dayInput).min(1).max(7).describe("Die Tage einer Woche mit ihren Gerichten"),
  price: z.number().min(0).max(200).optional().describe("Standardpreis eines Mittagstischs in Euro (optional)"),
  org: z.string().optional().describe("Name der Organisation (nur nötig, wenn der Mensch mehrere verwaltet)"),
  restaurant: z.string().optional().describe("Name des Lokals (nur nötig, wenn die Organisation mehrere hat)"),
});
export type MittagstischInput = z.infer<typeof mittagstischInput>;

export interface PlannedDish { name: string; description: string | null; price: number | null; vegetarian: boolean }
export interface PlannedDay { date: string; category: string; dishes: PlannedDish[] }
export interface PlannedWeek { monday: string; sunday: string; first: string; last: string; price: number | null; days: PlannedDay[] }

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Validates and sorts the input; all days must be in one week and not in the past. */
export function planWeek(input: MittagstischInput, now = new Date()): PlannedWeek {
  const seen = new Set<string>();
  const days = input.days.map((d) => {
    const date = validateEventDate(d.date, now);
    if (seen.has(date)) throw new ToolInputError(`Der Tag ${dayCategoryName(date)} kommt doppelt vor. Bitte alle Gerichte eines Tages zusammenfassen.`);
    seen.add(date);
    const dishes = d.dishes.map((x) => {
      assertNoAddress(x.name, x.description);
      const name = x.name.trim();
      if (name.length < 2) throw new ToolInputError("Ein Gericht hat keinen Namen.");
      return {
        name,
        description: x.description?.trim() || null,
        price: x.price === undefined ? null : round2(x.price),
        vegetarian: !!x.vegetarian,
      };
    });
    return { date, category: dayCategoryName(date), dishes };
  }).sort((a, b) => a.date.localeCompare(b.date));
  const { monday, sunday } = weekBounds(days[0].date);
  if (days.some((d) => d.date > sunday)) {
    throw new ToolInputError("Bitte nur Tage einer Woche (Montag bis Sonntag) auf einmal eintragen. Die nächste Woche geht mit einem zweiten Aufruf.");
  }
  return {
    monday, sunday, first: days[0].date, last: days[days.length - 1].date,
    price: input.price === undefined ? null : round2(input.price),
    days,
  };
}

function dishLine(d: PlannedDish, defaultPrice: number | null): string {
  const price = d.price ?? defaultPrice;
  return [d.name, price !== null ? formatEuro(price) : null, d.vegetarian ? "vegetarisch" : null].filter(Boolean).join(" · ");
}

// ---- DB seam (tests replace these) -----------------------------------------------------

export interface RestaurantRow { id: string; name: string; orgSlug: string | null }
export interface WeekMenu {
  id: string; start_date: string | null; end_date: string | null;
  categories: { id: string; name: string }[];
}

export const mittagstischDeps = {
  async restaurantsForOrg(orgId: string): Promise<RestaurantRow[]> {
    const res = await (await adminDb()).from("restaurants").select("id, name, accounts:account_id(slug)")
      .eq("account_id", orgId).neq("status", "archived").limit(10);
    if (res.error) throw new Error(`[mittagstisch] restaurants: ${res.error.message}`);
    return ((res.data ?? []) as { id: string; name: string; accounts: { slug: string | null } | { slug: string | null }[] | null }[])
      .map((r) => ({ id: r.id, name: r.name, orgSlug: (Array.isArray(r.accounts) ? r.accounts[0] : r.accounts)?.slug ?? null }));
  },
  /** The newest non-archived special menu overlapping the week, with its categories. */
  async weekMenu(restaurantId: string, monday: string, sunday: string): Promise<WeekMenu | null> {
    const db = await adminDb();
    const res = await db.from("special_menus").select("id, start_date, end_date")
      .eq("restaurant_id", restaurantId).neq("status", "archived")
      .lte("start_date", sunday).gte("end_date", monday)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (res.error) throw new Error(`[mittagstisch] special_menus: ${res.error.message}`);
    const menu = res.data as { id: string; start_date: string | null; end_date: string | null } | null;
    if (!menu) return null;
    const cats = await db.from("special_menu_categories").select("id, name").eq("special_menu_id", menu.id);
    if (cats.error) throw new Error(`[mittagstisch] categories: ${cats.error.message}`);
    return { ...menu, categories: (cats.data ?? []) as { id: string; name: string }[] };
  },
  async createMenu(restaurantId: string, week: PlannedWeek): Promise<string> {
    const db = await adminDb();
    const last = await db.from("special_menus").select("sort_order").eq("restaurant_id", restaurantId)
      .order("sort_order", { ascending: false }).limit(1);
    const next = ((last.data?.[0] as { sort_order: number } | undefined)?.sort_order ?? -1) + 1;
    const res = await db.from("special_menus").insert({
      restaurant_id: restaurantId, name: "Mittagstisch", price: week.price,
      start_date: week.first, end_date: week.last, status: "published", sort_order: next,
    }).select("id").single();
    if (res.error) throw new Error(`[mittagstisch] create menu: ${res.error.message}`);
    return (res.data as { id: string }).id;
  },
  async updateMenu(menuId: string, patch: Record<string, unknown>): Promise<void> {
    const res = await (await adminDb()).from("special_menus").update(patch).eq("id", menuId);
    if (res.error) throw new Error(`[mittagstisch] update menu: ${res.error.message}`);
  },
  async insertDay(menuId: string, day: PlannedDay): Promise<void> {
    const db = await adminDb();
    const cat = await db.from("special_menu_categories").insert({
      special_menu_id: menuId, name: day.category, sort_order: weekdayIndex(day.date),
    }).select("id").single();
    if (cat.error) throw new Error(`[mittagstisch] category: ${cat.error.message}`);
    const categoryId = (cat.data as { id: string }).id;
    const items = await db.from("special_menu_items").insert(day.dishes.map((d, i) => ({
      special_menu_id: menuId, category_id: categoryId, name: d.name, description: d.description,
      price: d.price, is_vegetarian: d.vegetarian, sort_order: i,
    })));
    if (items.error) throw new Error(`[mittagstisch] items: ${items.error.message}`);
  },
  async deleteCategories(ids: string[]): Promise<void> {
    if (!ids.length) return;
    const db = await adminDb();
    const items = await db.from("special_menu_items").delete().in("category_id", ids);
    if (items.error) throw new Error(`[mittagstisch] delete items: ${items.error.message}`);
    const cats = await db.from("special_menu_categories").delete().in("id", ids);
    if (cats.error) throw new Error(`[mittagstisch] delete categories: ${cats.error.message}`);
  },
};

// ---- tool ------------------------------------------------------------------------------

export function pickRestaurant(list: RestaurantRow[], name: string | undefined, orgName: string): RestaurantRow {
  if (!list.length) {
    throw new ToolInputError(`${orgName} hat noch keine Speisekarte in der App. Sie wird einmal im Dashboard unter Speisekarten angelegt.`);
  }
  if (list.length === 1) return list[0];
  const q = name?.trim().toLowerCase();
  const hit = q ? list.filter((r) => r.name.trim().toLowerCase() === q) : [];
  if (hit.length === 1) return hit[0];
  throw new ToolInputError(`Für welches Lokal? Zur Wahl: ${list.map((r) => r.name).join(", ")}.`);
}

/** Existing day categories of the week menu that the new days replace. */
export function replacedCategories(menu: WeekMenu | null, week: PlannedWeek): { id: string; name: string }[] {
  if (!menu) return [];
  const dates = new Set(week.days.map((d) => d.date));
  return menu.categories.filter((c) => {
    const day = categoryDay(c.name, menu.start_date);
    return day !== null && dates.has(day);
  });
}

async function resolveTarget(input: MittagstischInput, ctx: HarnessContext) {
  const week = planWeek(input);
  const pick = pickManagedOrg(managedOrgs(ctx), input.org);
  const org = await actionsDeps.orgForManager(ctx.wallet, pick.id);
  if (!org) throw new ToolInputError("Keine Berechtigung für diese Organisation.");
  const restaurant = pickRestaurant(await mittagstischDeps.restaurantsForOrg(org.id), input.restaurant, org.name);
  const menu = await mittagstischDeps.weekMenu(restaurant.id, week.monday, week.sunday);
  return { week, org, restaurant, menu, replaced: replacedCategories(menu, week) };
}

export const setMittagstisch: HarnessTool<MittagstischInput> = {
  name: "set_mittagstisch",
  pack: "actions",
  risk: "public",
  description:
    "Trägt den Mittagstisch (Wochenkarte) eines Lokals ein, das zu einer Organisation des Menschen gehört (Inhaber/Admin). " +
    "Ein Aufruf = eine Woche; mehrere Gerichte pro Tag möglich. Gibt es für einen Tag schon Gerichte, werden sie ersetzt; " +
    "andere Tage der Woche bleiben. Erscheint sofort in der Röbel-App, Fotos der Gerichte entstehen automatisch.",
  inputSchema: mittagstischInput,
  available: (ctx) => managedOrgs(ctx).length > 0,
  summarize: ({ days }) => `Mittagstisch eintragen: ${days.length} ${days.length === 1 ? "Tag" : "Tage"}`,
  preview: async (input, ctx) => {
    const { week, restaurant, menu, replaced } = await resolveTarget(input, ctx);
    await checkLimit("set_mittagstisch", ctx);
    const fields = [
      { label: "Lokal", value: restaurant.name },
      ...week.days.map((d) => ({ label: d.category, value: d.dishes.map((x) => dishLine(x, week.price)).join("\n") })),
    ];
    if (week.price !== null) fields.push({ label: "Standardpreis", value: formatEuro(week.price) });
    fields.push({
      label: "Status",
      value: !menu ? "Neue Wochenkarte, sofort sichtbar" : replaced.length ? `Ersetzt: ${replaced.map((c) => c.name).join(", ")}` : "Ergänzt die Wochenkarte",
    });
    return { kind: "generic", fields } satisfies ApprovalPreview;
  },
  execute: async (input, ctx) => {
    const { week, restaurant, menu, replaced } = await resolveTarget(input, ctx);
    await checkLimit("set_mittagstisch", ctx);
    let menuId: string;
    if (!menu) {
      menuId = await mittagstischDeps.createMenu(restaurant.id, week);
    } else {
      menuId = menu.id;
      const start = menu.start_date && menu.start_date < week.first ? menu.start_date : week.first;
      const end = menu.end_date && menu.end_date > week.last ? menu.end_date : week.last;
      await mittagstischDeps.updateMenu(menuId, {
        start_date: start, end_date: end, status: "published", ...(week.price !== null ? { price: week.price } : {}),
      });
    }
    // New days first, then drop the replaced ones: a failure never leaves a day empty.
    for (const day of week.days) await mittagstischDeps.insertDay(menuId, day);
    await mittagstischDeps.deleteCategories(replaced.map((c) => c.id));
    return {
      ok: true,
      menuId,
      url: restaurant.orgSlug ? `${ctx.tenant.appOrigin}/app/orgs/${restaurant.orgSlug}` : null,
      info: `Mittagstisch für ${restaurant.name} eingetragen: ${week.days.map((d) => clip(d.category, 20)).join(", ")}.`,
    };
  },
};

export const MITTAGSTISCH_TOOLS = [setMittagstisch];

export function register(registry: ToolRegistry): void {
  for (const t of MITTAGSTISCH_TOOLS) registry.registerTool(t);
}
