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
import {
  getNewsArticle,
  listBusinesses,
  listDeals,
  listEvents,
  listMarketplace,
  listMiniApps,
  listNews,
  listProposals,
  searchRoebel,
} from "@/lib/roebel-data/public";

export const maxDuration = 60;
export const runtime = "nodejs";

const SITE = "https://www.roebel.app";
const TENANT = "roebel";

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
      async ({ query }) => json(await searchRoebel(db(), TENANT, { query })),
    );

    server.tool(
      "list_events",
      "Veranstaltungen in Röbel/Müritz. upcoming=true (Standard) listet ab heute, sonst die neuesten.",
      { limit: limitParam, upcoming: z.boolean().default(true) },
      async ({ limit, upcoming }) => json(await listEvents(db(), TENANT, { limit, upcoming })),
    );

    server.tool(
      "list_news",
      "Die neuesten veröffentlichten Nachrichten aus Röbel.",
      { limit: limitParam },
      async ({ limit }) => json(await listNews(db(), TENANT, { limit })),
    );

    server.tool(
      "get_news_article",
      "Einen Nachrichten-Artikel komplett lesen (per slug aus list_news/search_roebel).",
      { slug: z.string().min(1).max(200) },
      async ({ slug }) => {
        const article = await getNewsArticle(db(), TENANT, { slug });
        if (!article) throw new Error(`Artikel "${slug}" nicht gefunden.`);
        return json(article);
      },
    );

    server.tool(
      "list_proposals",
      "Bürgervorschläge (DAO-Governance) mit Zusammenfassung und Abstimmungsständen.",
      { limit: limitParam },
      async ({ limit }) => json(await listProposals(db(), TENANT, { limit })),
    );

    server.tool(
      "list_businesses",
      "Lokale Gewerbe (optional nach Kategorie gefiltert).",
      { limit: limitParam, category: z.string().max(40).optional() },
      async ({ limit, category }) => json(await listBusinesses(db(), TENANT, { limit, category })),
    );

    server.tool(
      "list_deals",
      "Aktive Angebote/Deals der lokalen Gewerbe.",
      { limit: limitParam },
      async ({ limit }) => json(await listDeals(db(), TENANT, { limit })),
    );

    server.tool(
      "list_marketplace",
      "Aktive Marktplatz-Anzeigen (Produkte, Dienstleistungen, Schwarzes Brett).",
      { limit: limitParam },
      async ({ limit }) => json(await listMarketplace(db(), TENANT, { limit })),
    );

    server.tool(
      "list_mini_apps",
      "Live-Apps im Röbel Mini-App-Store.",
      {},
      async () => json(await listMiniApps(db(), TENANT)),
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
