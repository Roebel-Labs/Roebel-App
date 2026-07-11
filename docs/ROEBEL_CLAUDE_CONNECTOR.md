# Röbel Claude Connector (MCP)

Ein öffentlicher, **nur lesender** MCP-Server, der die Daten der Röbel App für
Claude (und jeden anderen MCP-Client) verfügbar macht.

- **Endpoint:** `https://www.roebel.app/api/roebel/mcp` (Streamable HTTP, kein Auth)
- **Code:** `apps/web/src/app/api/roebel/[transport]/route.ts`
- Nicht zu verwechseln mit dem **Developer-MCP** unter `/api/mcp`
  (Mini-Apps bauen/veröffentlichen, Bearer-Key nötig).

## Einrichten

**claude.ai / Claude Desktop (Custom Connector):**
Settings → Connectors → *Add custom connector* → URL
`https://www.roebel.app/api/roebel/mcp` → hinzufügen. Keine Anmeldung nötig.

**Claude Code:**

```bash
claude mcp add --transport http roebel https://www.roebel.app/api/roebel/mcp
```

## Tools

| Tool | Inhalt |
|---|---|
| `roebel_info` | Was die Röbel App ist + Tool-Übersicht (Startpunkt) |
| `search_roebel {query}` | Volltextsuche über alle Kategorien |
| `list_events {limit?, upcoming?}` | Veranstaltungen (Standard: ab heute) |
| `list_news {limit?}` / `get_news_article {slug}` | Nachrichten (Liste / Volltext) |
| `list_proposals {limit?}` | Bürgervorschläge inkl. Abstimmungsstände |
| `list_businesses {limit?, category?}` | Lokale Gewerbe |
| `list_deals {limit?}` | Aktive Angebote der Gewerbe |
| `list_marketplace {limit?}` | Marktplatz-Anzeigen |
| `list_mini_apps` | Live-Apps im Mini-App-Store |

## Grundsätze

- Nur veröffentlichte/freigegebene Inhalte (`published` / `approved` / `active` / `live`).
- **Niemals** Wallet-Adressen, E-Mail-Adressen oder Telefonnummern in den Antworten.
- Währungs-Copy: „Röbel-Münzen" (RÖ) — kein CRC/Circles-Jargon.
- Alle Ergebnisse verlinken auf die Web-App (`https://www.roebel.app/app/…`).

## Testen

```bash
curl -s https://www.roebel.app/api/roebel/mcp \
  -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```
