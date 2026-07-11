/**
 * Röbel Claude Connector — public MCP server at POST https://www.roebel.app/api/roebel/mcp
 * (Streamable HTTP via mcp-handler, no SSE).
 *
 * Read-only town data for ANY MCP client, designed as a claude.ai custom
 * connector: add the URL under Settings → Connectors (no auth needed) and
 * Claude can search events, news, businesses, deals, the marketplace,
 * proposals and the mini-app store of Röbel/Müritz.
 *
 * Claude Code:
 *   claude mcp add --transport http roebel https://www.roebel.app/api/roebel/mcp
 *
 * Distinct from the developer MCP at /api/mcp (build/publish mini apps).
 * Privacy: only published/approved/active content; never wallet addresses,
 * emails or phone numbers.
 */
import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;
export const runtime = "nodejs";

const SITE = "https://www.roebel.app";

function text(s: string) {
  return { content: [{ type: "text" as const, text: s }] };
}

function json(v: unknown) {
  return text(JSON.stringify(v, null, 2));
}

function db() {
  return createAdminClient();
}

const limitParam = z.number().int().min(1).max(50).default(10);

const handler = createMcpHandler(
  (server) => {
    server.tool(
      "roebel_info",
      "Was die Röbel App ist und welche Daten dieser Connector liefert (Startpunkt).",
      {},
      async () =>
        text(
          `Die Röbel App ist die digitale Bürger-Plattform der Stadt Röbel/Müritz (Mecklenburg-Vorpommern): ` +
            `Veranstaltungen, Nachrichten, lokale Gewerbe & Angebote, Marktplatz, Bürgerbeteiligung ` +
            `(Vorschläge mit anonymer Abstimmung) und Mini-Apps. Web: ${SITE} — Open Source als Blaupause für Kleinstädte.\n\n` +
            `Tools dieses Connectors (alle öffentlich, nur Lesen):\n` +
            `- search_roebel {query} — Volltextsuche über alle Kategorien\n` +
            `- list_events {limit?, upcoming?} — Veranstaltungen\n` +
            `- list_news {limit?} / get_news_article {slug} — Nachrichten\n` +
            `- list_proposals {limit?} — Bürgervorschläge + Abstimmungsstände\n` +
            `- list_businesses {limit?} / list_deals {limit?} — Gewerbe & Angebote\n` +
            `- list_marketplace {limit?} — Marktplatz-Anzeigen\n` +
            `- list_mini_apps — Mini-App-Store\n\n` +
            `Hinweis: Die lokale Währung heißt "Röbel-Münzen" (RÖ).`,
        ),
    );

    server.tool(
      "search_roebel",
      "Volltextsuche über Veranstaltungen, Nachrichten, Gewerbe, Angebote, Marktplatz und Bürgervorschläge.",
      { query: z.string().min(2).max(120) },
      async ({ query }) => {
        const q = query.trim();
        const like = `%${q}%`;
        const supabase = db();
        const [events, news, businesses, listings, proposals, deals] = await Promise.all([
          supabase
            .from("events")
            .select("id, title, description, date, location")
            .eq("status", "approved")
            .or(`title.ilike.${like},description.ilike.${like},location.ilike.${like}`)
            .order("date", { ascending: false })
            .limit(5),
          supabase
            .from("news_articles")
            .select("title, slug, excerpt, published_at")
            .eq("status", "published")
            .or(`title.ilike.${like},excerpt.ilike.${like}`)
            .order("published_at", { ascending: false })
            .limit(5),
          supabase
            .from("businesses")
            .select("name, slug, description, category")
            .eq("status", "published")
            .or(`name.ilike.${like},description.ilike.${like}`)
            .limit(5),
          supabase
            .from("marketplace_listings")
            .select("id, title, description, price, listing_type")
            .eq("status", "active")
            .or(`title.ilike.${like},description.ilike.${like}`)
            .order("created_at", { ascending: false })
            .limit(5),
          supabase
            .from("proposals")
            .select("proposal_id, proposal_number, title, summary, state")
            .or(`title.ilike.${like},summary.ilike.${like}`)
            .order("created_at", { ascending: false })
            .limit(5),
          supabase
            .from("business_deals")
            .select("id, title, description, businesses!inner(name)")
            .eq("is_active", true)
            .or(`title.ilike.${like},description.ilike.${like}`)
            .limit(5),
        ]);
        return json({
          events: (events.data ?? []).map((e) => ({ ...e, url: `${SITE}/app/events/${e.id}` })),
          news: (news.data ?? []).map((n) => ({ ...n, url: `${SITE}/app/news/${n.slug}` })),
          businesses: (businesses.data ?? []).map((b) => ({
            ...b,
            url: `${SITE}/app/gewerbe/${b.slug}`,
          })),
          marketplace: (listings.data ?? []).map((m) => ({
            ...m,
            url: `${SITE}/app/marktplatz/${m.id}`,
          })),
          proposals: (proposals.data ?? []).map((p) => ({
            ...p,
            url: `${SITE}/app/proposals/${p.proposal_id}`,
          })),
          deals: deals.data ?? [],
        });
      },
    );

    server.tool(
      "list_events",
      "Veranstaltungen in Röbel/Müritz. upcoming=true (Standard) listet ab heute, sonst die neuesten.",
      { limit: limitParam, upcoming: z.boolean().default(true) },
      async ({ limit, upcoming }) => {
        let q = db()
          .from("events")
          .select("id, title, description, date, time, end_time, location, category, ticket_price, is_cancelled")
          .eq("status", "approved");
        if (upcoming) {
          q = q.gte("date", new Date().toISOString().slice(0, 10)).order("date", { ascending: true });
        } else {
          q = q.order("date", { ascending: false });
        }
        const { data, error } = await q.limit(limit);
        if (error) throw new Error(error.message);
        return json({
          events: (data ?? []).map((e) => ({ ...e, url: `${SITE}/app/events/${e.id}` })),
        });
      },
    );

    server.tool(
      "list_news",
      "Die neuesten veröffentlichten Nachrichten aus Röbel.",
      { limit: limitParam },
      async ({ limit }) => {
        const { data, error } = await db()
          .from("news_articles")
          .select("title, slug, excerpt, category, published_at")
          .eq("status", "published")
          .order("published_at", { ascending: false })
          .limit(limit);
        if (error) throw new Error(error.message);
        return json({
          articles: (data ?? []).map((n) => ({ ...n, url: `${SITE}/app/news/${n.slug}` })),
        });
      },
    );

    server.tool(
      "get_news_article",
      "Einen Nachrichten-Artikel komplett lesen (per slug aus list_news/search_roebel).",
      { slug: z.string().min(1).max(200) },
      async ({ slug }) => {
        const { data, error } = await db()
          .from("news_articles")
          .select("title, slug, excerpt, content, category, tags, author_name, published_at")
          .eq("status", "published")
          .eq("slug", slug)
          .maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) throw new Error(`Artikel "${slug}" nicht gefunden.`);
        return json({ ...data, url: `${SITE}/app/news/${data.slug}` });
      },
    );

    server.tool(
      "list_proposals",
      "Bürgervorschläge (DAO-Governance) mit Zusammenfassung und Abstimmungsständen.",
      { limit: limitParam },
      async ({ limit }) => {
        const { data, error } = await db()
          .from("proposals")
          .select(
            "proposal_id, proposal_number, title, summary, category, state, for_votes, against_votes, abstain_votes, created_at",
          )
          .order("created_at", { ascending: false })
          .limit(limit);
        if (error) throw new Error(error.message);
        return json({
          proposals: (data ?? []).map((p) => ({
            ...p,
            url: `${SITE}/app/proposals/${p.proposal_id}`,
          })),
        });
      },
    );

    server.tool(
      "list_businesses",
      "Lokale Gewerbe (optional nach Kategorie gefiltert).",
      { limit: limitParam, category: z.string().max(40).optional() },
      async ({ limit, category }) => {
        let q = db()
          .from("businesses")
          .select("name, slug, description, category, address, website_url, opening_hours, is_roebel_partner")
          .eq("status", "published")
          .order("is_featured", { ascending: false });
        if (category) q = q.eq("category", category);
        const { data, error } = await q.limit(limit);
        if (error) throw new Error(error.message);
        return json({
          businesses: (data ?? []).map((b) => ({ ...b, url: `${SITE}/app/gewerbe/${b.slug}` })),
        });
      },
    );

    server.tool(
      "list_deals",
      "Aktive Angebote/Deals der lokalen Gewerbe.",
      { limit: limitParam },
      async ({ limit }) => {
        const { data, error } = await db()
          .from("business_deals")
          .select("id, title, description, deal_type, deal_value, start_date, end_date, businesses!inner(name, slug)")
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .limit(limit);
        if (error) throw new Error(error.message);
        return json({ deals: data ?? [] });
      },
    );

    server.tool(
      "list_marketplace",
      "Aktive Marktplatz-Anzeigen (Produkte, Dienstleistungen, Schwarzes Brett).",
      { limit: limitParam },
      async ({ limit }) => {
        const { data, error } = await db()
          .from("marketplace_listings")
          .select("id, title, description, price, price_type, category, condition, listing_type, created_at")
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(limit);
        if (error) throw new Error(error.message);
        return json({
          listings: (data ?? []).map((m) => ({ ...m, url: `${SITE}/app/marktplatz/${m.id}` })),
        });
      },
    );

    server.tool(
      "list_mini_apps",
      "Live-Apps im Röbel Mini-App-Store.",
      {},
      async () => {
        const { data, error } = await db()
          .from("mini_apps")
          .select("name, slug, description, category, tags, home_url, featured")
          .eq("status", "live")
          .order("featured", { ascending: false });
        if (error) throw new Error(error.message);
        return json({ apps: data ?? [] });
      },
    );
  },
  {
    serverInfo: { name: "roebel-connector", version: "1.0.0" },
  },
  {
    basePath: "/api/roebel",
    verboseLogs: false,
    maxDuration: 60,
    disableSse: true,
  },
);

export { handler as GET, handler as POST, handler as DELETE };
