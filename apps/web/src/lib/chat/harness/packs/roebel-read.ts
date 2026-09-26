// Pack 'roebel' (risk 'read'): the community's public knowledge — events,
// news, orgs, deals, marketplace, proposals, feed, menus, Abfallkalender,
// Gemeinschaftskasse. Tenant-scoped via ctx.tenant; outputs compact
// (shapeOutput: ≤ ~4k chars, no wallet addresses) with deep links.
import { z } from "zod";
import {
  abfallkalender,
  getBlogArticle,
  getEvent,
  getMenu,
  getNewsArticle,
  getOrg,
  listBlogArticles,
  listDeals,
  listEvents,
  listFeedPosts,
  listMarketplace,
  listNews,
  listOrgs,
  listProposals,
  PROPOSAL_STATE_LABEL,
  searchOrgs,
  searchRoebel,
  WASTE_FRACTION_LABEL,
  type TenantRef,
} from "../../../roebel-data/public";
import { plainText, shapeOutput } from "../../../roebel-data/shape";
import type { Db } from "../../../roebel-data/tenant";
import { getTreasury } from "../../../roebel-data/treasury";
import type { HarnessContext, HarnessTool, ToolRegistry } from "../types";

async function db(): Promise<Db> {
  const { createAdminClient } = await import("../../../supabase/admin");
  return createAdminClient();
}

function tenantOf(ctx: HarnessContext): TenantRef {
  return { id: ctx.tenant.id, appOrigin: ctx.tenant.appOrigin };
}

const limit = (def: number, max = 20) =>
  z.number().int().min(1).max(max).default(def).describe(`Anzahl Einträge (Standard ${def}, max. ${max})`);

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum als JJJJ-MM-TT");

function preview(s: string | null | undefined, max = 240): string | null {
  const t = plainText(s);
  return t && t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function votes(v: string | null | undefined): number {
  // Stored as wei-scaled strings (1 NFT = 1 vote = 1e18) or plain integers.
  if (!v) return 0;
  try {
    const b = BigInt(v);
    return b >= 10n ** 15n ? Number(b / 10n ** 18n) : Number(b);
  } catch {
    return Number(v) || 0;
  }
}

// ---- tools -----------------------------------------------------------------------

const searchInput = z.object({ query: z.string().min(2).max(120).describe("Suchbegriff") });
export const searchRoebelTool: HarnessTool<z.infer<typeof searchInput>> = {
  name: "search_roebel",
  pack: "roebel",
  risk: "read",
  description:
    "Volltextsuche in der Röbel-App über Veranstaltungen, Nachrichten, Organisationen/Vereine, Gewerbe, Angebote, Marktplatz und Bürgervorschläge. Guter Startpunkt, wenn unklar ist, wo etwas steht.",
  inputSchema: searchInput,
  summarize: ({ query }) => `In der Röbel-App suchen: „${query}“`,
  execute: async ({ query }, ctx) => {
    const d = await db();
    const t = tenantOf(ctx);
    const [r, orgs] = await Promise.all([searchRoebel(d, t, { query }), searchOrgs(d, t, { query, limit: 5 })]);
    return shapeOutput({
      veranstaltungen: r.events.map((e) => ({ titel: e.title, datum: e.date, ort: e.location, url: e.url })),
      nachrichten: r.news.map((n) => ({ titel: n.title, slug: n.slug, datum: n.published_at, url: n.url })),
      organisationen: orgs.map((o) => ({ name: o.name, slug: o.slug, url: o.url })),
      gewerbe: r.businesses.map((b) => ({ name: b.name, slug: b.slug, kategorie: b.category, url: b.url })),
      marktplatz: r.marketplace.map((m) => ({ titel: m.title, preis: m.price, art: m.listing_type, url: m.url })),
      vorschlaege: r.proposals.map((p) => ({
        nr: p.proposal_number,
        titel: p.title,
        status: PROPOSAL_STATE_LABEL[p.state as number] ?? null,
        url: p.url,
      })),
      angebote: r.deals.map((dl) => ({ titel: dl.title, id: dl.id, url: `${ctx.tenant.appOrigin}/app/angebote/${dl.id}` })),
    });
  },
};

const listEventsInput = z.object({
  limit: limit(10),
  upcoming: z.boolean().default(true).describe("true = ab heute (Standard), false = die neuesten/vergangenen"),
  query: z.string().max(80).optional().describe("Optionaler Suchbegriff (Titel, Beschreibung, Ort)"),
  from: isoDate.optional().describe("Frühestes Datum JJJJ-MM-TT"),
  to: isoDate.optional().describe("Spätestes Datum JJJJ-MM-TT"),
});
export const listEventsTool: HarnessTool<z.infer<typeof listEventsInput>> = {
  name: "list_events",
  pack: "roebel",
  risk: "read",
  description:
    "Veranstaltungen in Röbel/Müritz aus der App, optional gefiltert nach Suchbegriff und Zeitraum. Für Details danach get_event mit der id.",
  inputSchema: listEventsInput,
  summarize: ({ query }) => (query ? `Veranstaltungen suchen: „${query}“` : "Veranstaltungen ansehen"),
  execute: async (input, ctx) => {
    const r = await listEvents(await db(), tenantOf(ctx), input);
    return shapeOutput({
      veranstaltungen: r.events.map((e) => ({
        id: e.id,
        titel: e.title,
        datum: e.date,
        beginn: e.time,
        ende: e.end_time,
        ort: e.location,
        kategorie: e.category,
        eintritt: e.ticket_price,
        abgesagt: e.is_cancelled || undefined,
        info: preview(e.description, 160),
        url: e.url,
      })),
    });
  },
};

const idInput = z.object({ id: z.string().uuid().describe("id der Veranstaltung (aus list_events/search_roebel)") });
export const getEventTool: HarnessTool<z.infer<typeof idInput>> = {
  name: "get_event",
  pack: "roebel",
  risk: "read",
  description: "Alle Details zu einer Veranstaltung: Beschreibung, Zeit, Ort, Veranstalter, Tickets, Interessierte.",
  inputSchema: idInput,
  summarize: () => "Veranstaltung ansehen",
  execute: async ({ id }, ctx) => {
    const e = await getEvent(await db(), tenantOf(ctx), { id });
    if (!e) return { error: "Veranstaltung nicht gefunden (oder noch nicht freigegeben)." };
    return shapeOutput(
      {
        titel: e.title,
        datum: e.date,
        beginn: e.time,
        ende: e.end_time,
        ort: e.location,
        adresse: e.formatted_address,
        kategorie: e.category,
        eintritt: e.ticket_price,
        max_teilnehmende: e.max_attendees,
        abgesagt: e.is_cancelled || undefined,
        regelmaessig: e.is_recurring || undefined,
        veranstalter: e.veranstalter,
        veranstalter_url: e.veranstalter_url,
        webseite: e.website_url,
        livestream: e.livestream_url,
        interessiert: e.interessiert,
        tickets: e.tickets,
        beschreibung: plainText(e.description),
        url: e.url,
      },
      { maxString: 2000 },
    );
  },
};

const listNewsInput = z.object({
  limit: limit(8),
  include_org_blogs: z.boolean().default(true).describe("Auch Blog-Beiträge von Vereinen/Gewerbe einbeziehen"),
});
export const listNewsTool: HarnessTool<z.infer<typeof listNewsInput>> = {
  name: "list_news",
  pack: "roebel",
  risk: "read",
  description:
    "Die neuesten Nachrichten aus Röbel (Redaktion) und Blog-Beiträge der Vereine/Gewerbe. Volltext mit get_news_article (slug bzw. Blog-id).",
  inputSchema: listNewsInput,
  summarize: () => "Nachrichten ansehen",
  execute: async ({ limit: n, include_org_blogs }, ctx) => {
    const d = await db();
    const t = tenantOf(ctx);
    const [news, blogs] = await Promise.all([
      listNews(d, t, { limit: n }),
      include_org_blogs ? listBlogArticles(d, t, { limit: Math.min(n, 5) }) : Promise.resolve([]),
    ]);
    return shapeOutput({
      nachrichten: news.articles.map((a) => ({
        titel: a.title,
        slug: a.slug,
        kategorie: a.category,
        datum: a.published_at,
        teaser: preview(a.excerpt, 200),
        url: a.url,
      })),
      blogs: blogs.map((b) => ({ titel: b.title, id: b.id, von: b.von, datum: b.published_at, teaser: preview(b.excerpt, 160), url: b.url })),
    });
  },
};

const articleInput = z.object({
  slug: z.string().min(1).max(200).describe("slug einer Nachricht oder id eines Blog-Beitrags"),
});
export const getNewsArticleTool: HarnessTool<z.infer<typeof articleInput>> = {
  name: "get_news_article",
  pack: "roebel",
  risk: "read",
  description: "Einen Nachrichten-Artikel (per slug) oder Vereins-/Gewerbe-Blogbeitrag (per id) komplett lesen.",
  inputSchema: articleInput,
  summarize: () => "Artikel lesen",
  execute: async ({ slug }, ctx) => {
    const d = await db();
    const t = tenantOf(ctx);
    const a = await getNewsArticle(d, t, { slug });
    if (a) {
      return shapeOutput(
        { titel: a.title, kategorie: a.category, autor: a.author_name, datum: a.published_at, text: plainText(a.content) ?? a.excerpt, url: a.url },
        { maxString: 3600, maxChars: 4200 },
      );
    }
    const b = await getBlogArticle(d, t, { id: slug });
    if (b) {
      return shapeOutput(
        { titel: b.title, von: b.von, datum: b.published_at, text: plainText(b.content) ?? b.excerpt, url: b.url },
        { maxString: 3600, maxChars: 4200 },
      );
    }
    return { error: `Artikel „${slug}“ nicht gefunden.` };
  },
};

const orgKind = z.enum(["verein", "restaurant", "unternehmen", "fraktion", "stadt", "gewerbe"]);
const listOrgsInput = z.object({
  kind: orgKind.optional().describe("verein, restaurant (Gastronomie), unternehmen, fraktion, stadt, gewerbe (Gewerbe-Verzeichnis)"),
  query: z.string().max(80).optional().describe("Optionaler Suchbegriff"),
  limit: limit(15, 30),
});
export const listOrgsTool: HarnessTool<z.infer<typeof listOrgsInput>> = {
  name: "list_orgs",
  pack: "roebel",
  risk: "read",
  description:
    "Organisationen in Röbel aus der App: Vereine, Gastronomie, Unternehmen, Fraktionen, Stadt und das Gewerbe-Verzeichnis. Details mit get_org (slug).",
  inputSchema: listOrgsInput,
  summarize: ({ kind }) => (kind ? `Organisationen ansehen (${kind})` : "Organisationen ansehen"),
  execute: async (input, ctx) => {
    const r = await listOrgs(await db(), tenantOf(ctx), input);
    return shapeOutput({
      organisationen: r.orgs.map((o) => ({ ...o, beschreibung: preview(o.beschreibung, 140) })),
    });
  },
};

const slugInput = z.object({ slug: z.string().min(1).max(120).describe("slug der Organisation (aus list_orgs/search_roebel)") });
export const getOrgTool: HarnessTool<z.infer<typeof slugInput>> = {
  name: "get_org",
  pack: "roebel",
  risk: "read",
  description:
    "Profil einer Organisation (Verein, Gastro, Unternehmen, Gewerbe): Beschreibung, Adresse, Öffnungszeiten, nächste Veranstaltungen, Angebote, Blog.",
  inputSchema: slugInput,
  summarize: () => "Organisation ansehen",
  execute: async ({ slug }, ctx) => {
    const o = await getOrg(await db(), tenantOf(ctx), { slug });
    if (!o) return { error: `Organisation „${slug}“ nicht gefunden.` };
    return shapeOutput(o, { maxString: 1200 });
  },
};

const listLimitInput = z.object({ limit: limit(10) });
export const listDealsTool: HarnessTool<z.infer<typeof listLimitInput>> = {
  name: "list_deals",
  pack: "roebel",
  risk: "read",
  description: "Aktive Angebote und Aktionen lokaler Gewerbe in Röbel.",
  inputSchema: listLimitInput,
  summarize: () => "Angebote ansehen",
  execute: async ({ limit: n }, ctx) => {
    const r = await listDeals(await db(), tenantOf(ctx), { limit: n });
    return shapeOutput({
      angebote: (r.deals as unknown as {
        id: string;
        title: string;
        description: string | null;
        deal_type: string | null;
        deal_value: string | null;
        start_date: string | null;
        end_date: string | null;
        businesses: { name: string; slug: string } | { name: string; slug: string }[] | null;
      }[]).map((d) => {
        const b = Array.isArray(d.businesses) ? d.businesses[0] : d.businesses;
        return {
          titel: d.title,
          von: b?.name ?? null,
          art: d.deal_type,
          wert: d.deal_value,
          gueltig_bis: d.end_date,
          info: preview(d.description, 160),
          url: `${ctx.tenant.appOrigin}/app/angebote/${d.id}`,
        };
      }),
    });
  },
};

const marketInput = z.object({
  limit: limit(10),
  query: z.string().max(80).optional().describe("Optionaler Suchbegriff"),
});
export const listMarketplaceTool: HarnessTool<z.infer<typeof marketInput>> = {
  name: "list_marketplace",
  pack: "roebel",
  risk: "read",
  description: "Aktive Anzeigen im Röbel-Marktplatz (Verkaufen, Verschenken, Suchen, Dienstleistungen, Schwarzes Brett).",
  inputSchema: marketInput,
  summarize: ({ query }) => (query ? `Marktplatz durchsuchen: „${query}“` : "Marktplatz ansehen"),
  execute: async (input, ctx) => {
    const r = await listMarketplace(await db(), tenantOf(ctx), input);
    return shapeOutput({
      anzeigen: r.listings.map((m) => ({
        titel: m.title,
        preis: m.price,
        preisart: m.price_type,
        kategorie: m.category,
        zustand: m.condition,
        art: m.listing_type,
        datum: m.created_at,
        info: preview(m.description, 140),
        url: m.url,
      })),
    });
  },
};

export const listProposalsTool: HarnessTool<z.infer<typeof listLimitInput>> = {
  name: "list_proposals",
  pack: "roebel",
  risk: "read",
  description:
    "Bürgervorschläge mit Status und Stimmen (Ja/Nein/Enthaltung). Abstimmungen sind ein Meinungsbild der Bürgerschaft, keine Stadtratsbeschlüsse.",
  inputSchema: listLimitInput,
  summarize: () => "Bürgervorschläge ansehen",
  execute: async ({ limit: n }, ctx) => {
    const r = await listProposals(await db(), tenantOf(ctx), { limit: n });
    return shapeOutput({
      vorschlaege: r.proposals.map((p) => ({
        nr: p.proposal_number,
        titel: p.title,
        kategorie: p.category,
        status: PROPOSAL_STATE_LABEL[p.state as number] ?? String(p.state),
        stimmen: { ja: votes(p.for_votes), nein: votes(p.against_votes), enthaltung: votes(p.abstain_votes) },
        zusammenfassung: preview(p.summary, 200),
        erstellt: p.created_at,
        url: p.url,
      })),
    });
  },
};

const feedInput = z.object({
  limit: limit(10),
  query: z.string().max(80).optional().describe("Optionaler Suchbegriff im Beitragstext"),
});
export const listFeedPostsTool: HarnessTool<z.infer<typeof feedInput>> = {
  name: "list_feed_posts",
  pack: "roebel",
  risk: "read",
  description: "Die neuesten öffentlichen Beiträge im Röbel-Feed (was gerade in der Stadt geteilt wird).",
  inputSchema: feedInput,
  summarize: () => "Röbel-Feed ansehen",
  execute: async (input, ctx) => {
    const r = await listFeedPosts(await db(), tenantOf(ctx), input);
    return shapeOutput({ beitraege: r.posts.map((p) => ({ ...p, text: preview(p.text, 280) })) });
  },
};

const menuInput = z.object({
  restaurant: z.string().min(2).max(120).describe("slug oder Name des Restaurants/Gastro-Betriebs"),
});
export const getMenuTool: HarnessTool<z.infer<typeof menuInput>> = {
  name: "get_menu",
  pack: "roebel",
  risk: "read",
  description: "Speisekarte eines Röbeler Gastro-Betriebs aus der App (Gerichte, Preise, vegetarisch/vegan).",
  inputSchema: menuInput,
  summarize: ({ restaurant }) => `Speisekarte ansehen: ${restaurant}`,
  execute: async ({ restaurant }, ctx) => {
    const m = await getMenu(await db(), tenantOf(ctx), { restaurant });
    if (!m) return { error: `Keine Speisekarte für „${restaurant}“ gefunden. Tipp: list_orgs mit kind "restaurant".` };
    return shapeOutput(m, { maxString: 300 });
  },
};

const fractionKeys = Object.keys(WASTE_FRACTION_LABEL) as [string, ...string[]];
const wasteInput = z.object({
  fraction: z.enum(fractionKeys).optional().describe("restmuell, bio, papier, gelbe_tonne, schadstoff, weihnachtsbaum"),
  limit: limit(8, 30),
});
export const abfallkalenderTool: HarnessTool<z.infer<typeof wasteInput>> = {
  name: "abfallkalender",
  pack: "roebel",
  risk: "read",
  description: "Nächste Müllabfuhr-Termine in Röbel (Restmüll, Bio, Papier, Gelbe Tonne, Schadstoffmobil, Weihnachtsbaum).",
  inputSchema: wasteInput,
  summarize: ({ fraction }) =>
    fraction ? `Abfuhrtermine ansehen (${WASTE_FRACTION_LABEL[fraction] ?? fraction})` : "Abfuhrtermine ansehen",
  execute: async (input, ctx) => shapeOutput(await abfallkalender(await db(), tenantOf(ctx), input)),
};

export const getTreasuryTool: HarnessTool<Record<string, never>> = {
  name: "get_treasury",
  pack: "roebel",
  risk: "read",
  description: "Aktueller Stand der Gemeinschaftskasse (gemeinsamer Topf der Röbeler Gemeinschaft) in Euro.",
  inputSchema: z.object({}) as unknown as z.ZodType<Record<string, never>>,
  summarize: () => "Gemeinschaftskasse ansehen",
  execute: async (_input, ctx) => shapeOutput(await getTreasury(ctx.tenant.id, { origin: ctx.tenant.appOrigin })),
};

export const TOOLS: HarnessTool[] = [
  searchRoebelTool,
  listEventsTool,
  getEventTool,
  listNewsTool,
  getNewsArticleTool,
  listOrgsTool,
  getOrgTool,
  listDealsTool,
  listMarketplaceTool,
  listProposalsTool,
  listFeedPostsTool,
  getMenuTool,
  abfallkalenderTool,
  getTreasuryTool,
];

export function register(registry: ToolRegistry): void {
  for (const t of TOOLS) registry.registerTool(t);
}
