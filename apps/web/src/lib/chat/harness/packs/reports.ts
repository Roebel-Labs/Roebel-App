// Pack 'user' (risk 'private'): "Datenbericht" — reach and engagement numbers of
// the person's own account or an org they manage (owner/admin), read from the
// analytics rollups (supabase/migrations/20261124_org_analytics.sql). The
// get_account_* RPCs re-check owner/admin for ctx.wallet, so a wrong org id can
// never leak another account's numbers. No wallet addresses in the output.
import { z } from "zod";
import { ToolInputError } from "../errors";
import type { HarnessContext, HarnessTool, ToolRegistry } from "../types";
import { actionsDeps, clip, managedOrgs, pickManagedOrg } from "./actions";

async function adminDb() {
  const { createAdminClient } = await import("../../../supabase/admin");
  return createAdminClient();
}

export const METRIC_LABELS: Record<string, string> = {
  impression: "Einblendungen im Feed",
  view: "Aufrufe",
  open: "Öffnungen",
  click: "Klicks",
  link_tap: "Link-Klicks",
  share: "Geteilt",
  like: "Gefällt mir",
  comment: "Kommentare",
  follow: "Neue Follower",
  unfollow: "Entfolgt",
  interest: "Interessiert (Events)",
  save: "Gespeichert",
};

const OBJECT_LABELS: Record<string, string> = {
  post: "Beitrag", event: "Veranstaltung", listing: "Anzeige", deal: "Angebot", profile: "Profil",
  org: "Profil", mini_app: "Mini-App", ticket: "Ticket", link: "Link",
};

/** Change in percent vs. the previous window; null when there is no base. */
export function changePct(current: number, previous: number): number | null {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 100);
}

function berlinDay(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** [from, to] as yyyy-mm-dd for the last `days` Berlin days including today. */
export function reportRange(days: number, now = new Date()): { from: string; to: string } {
  const to = berlinDay(now);
  const fromDate = new Date(`${to}T12:00:00Z`);
  fromDate.setUTCDate(fromDate.getUTCDate() - (days - 1));
  return { from: fromDate.toISOString().slice(0, 10), to };
}

const reportInput = z.object({
  account: z.enum(["persoenlich", "organisation"]).default("organisation")
    .describe("Wessen Zahlen: 'organisation' (Verein/Betrieb, den der Mensch verwaltet) oder 'persoenlich' (eigenes Profil)"),
  org: z.string().optional().describe("Name der Organisation (nur nötig, wenn der Mensch mehrere verwaltet)"),
  days: z.number().int().min(1).max(365).default(30).describe("Zeitraum in Tagen bis heute (Standard 30)"),
});
type ReportInput = z.infer<typeof reportInput>;
// Defaults make input ≠ output type; HarnessTool wants one type (same cast as user-private noInput).
const reportSchema = reportInput as unknown as z.ZodType<ReportInput>;

async function resolveAccount(input: ReportInput, ctx: HarnessContext): Promise<{ id: string; name: string }> {
  if (input.account === "persoenlich" || (!input.org && managedOrgs(ctx).length === 0)) {
    const id = await actionsDeps.personalAccountId(ctx.wallet);
    if (!id) throw new ToolInputError("Dafür braucht der Mensch ein Profil in der Röbel-App.");
    return { id, name: ctx.profile?.displayName?.trim() || "Dein Profil" };
  }
  return pickManagedOrg(managedOrgs(ctx), input.org);
}

type Row<T> = { data: T[] | null; error: { message: string } | null };

async function titlesFor(objects: { object_type: string; object_id: string }[]): Promise<Map<string, string>> {
  const db = await adminDb();
  const ids = (type: string) => objects.filter((o) => o.object_type === type).map((o) => o.object_id);
  const out = new Map<string, string>();
  const load = async (type: string, table: string, col: string) => {
    const list = ids(type);
    if (!list.length) return;
    const res = (await db.from(table).select(`id, ${col}`).in("id", list)) as unknown as Row<Record<string, string>>;
    for (const r of res.data ?? []) out.set(`${type}:${r.id}`, clip(String(r[col] ?? ""), 70));
  };
  await Promise.all([
    load("post", "posts", "content"),
    load("event", "events", "title"),
    load("listing", "marketplace_listings", "title"),
    load("deal", "business_deals", "title"),
  ]);
  return out;
}

export const accountReport: HarnessTool<ReportInput> = {
  name: "account_report",
  pack: "user",
  risk: "private",
  description:
    "Datenbericht: Reichweite und Interaktionen (Aufrufe, Einblendungen, Teilen, Likes, Kommentare, Follower, Event-Interesse) " +
    "einer Organisation, die der Mensch verwaltet, oder seines eigenen Profils — mit Vergleich zum Zeitraum davor, " +
    "Top-Inhalten und Herkunft. Fasse die Zahlen verständlich auf Deutsch zusammen; auf Wunsch als Datei (write_file).",
  inputSchema: reportSchema,
  summarize: (i) => `Datenbericht der letzten ${i.days ?? 30} Tage erstellen`,
  execute: async (input, ctx) => {
    const account = await resolveAccount(input, ctx);
    const days = input.days ?? 30;
    const { from, to } = reportRange(days);
    const db = await adminDb();
    const args = { p_account_id: account.id, p_wallet: ctx.wallet.toLowerCase(), p_from: from, p_to: to };
    const [totals, top, uniques, surfaces] = await Promise.all([
      db.rpc("get_account_analytics_totals", args),
      db.rpc("get_top_objects", { ...args, p_metric: "view", p_limit: 5 }),
      db.rpc("get_account_uniques", args),
      db.rpc("get_account_surfaces", args),
    ]);
    const err = totals.error ?? top.error ?? uniques.error ?? surfaces.error;
    if (err) {
      if (/not allowed/.test(err.message)) throw new ToolInputError("Keine Berechtigung für die Zahlen dieses Kontos.");
      throw new Error(`[reports] ${err.message}`);
    }
    const totalRows = (totals.data ?? []) as { metric: string; current: number; previous: number }[];
    const topRows = (top.data ?? []) as { object_type: string; object_id: string; count: number }[];
    const uniqueRows = (uniques.data ?? []) as { day: string; uniques: number }[];
    const surfaceRows = (surfaces.data ?? []) as { surface: string | null; count: number }[];
    const titles = await titlesFor(topRows);
    const uniqueSum = uniqueRows.reduce((s, r) => s + Number(r.uniques), 0);
    const metrics = totalRows
      .map((r) => ({
        kennzahl: METRIC_LABELS[r.metric] ?? r.metric,
        zeitraum: Number(r.current),
        davor: Number(r.previous),
        veraenderungProzent: changePct(Number(r.current), Number(r.previous)),
      }))
      .filter((m) => m.zeitraum || m.davor)
      .sort((a, b) => b.zeitraum - a.zeitraum);
    return {
      konto: account.name,
      zeitraum: { von: from, bis: to, tage: days },
      kennzahlen: metrics,
      besucherProTagDurchschnitt: uniqueRows.length ? Math.round((uniqueSum / uniqueRows.length) * 10) / 10 : 0,
      topInhalteNachAufrufen: topRows.map((r) => ({
        art: OBJECT_LABELS[r.object_type] ?? r.object_type,
        titel: titles.get(`${r.object_type}:${r.object_id}`) ?? null,
        aufrufe: Number(r.count),
      })),
      herkunft: surfaceRows.slice(0, 6).map((s) => ({ bereich: s.surface ?? "unbekannt", anzahl: Number(s.count) })),
      hinweis: metrics.length
        ? undefined
        : "Für diesen Zeitraum sind noch keine Zahlen erfasst. Die Messung läuft seit dem 24.11.2026 und braucht die aktuelle App-Version.",
    };
  },
};

export function register(registry: ToolRegistry): void {
  registry.registerTool(accountReport);
}
