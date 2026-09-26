import { NextResponse } from "next/server";
import { googleEnabled, revokeToken } from "@/lib/chat/harness/connectors/google";
import type { GoogleSecret } from "@/lib/chat/harness/connectors/google";
import { discoverMcpTools, sanitizeHeaders, serverSlug, validateMcpUrl } from "@/lib/chat/harness/connectors/mcp";
import {
  MAX_CONNECTORS, deleteConnector, getConnector, insertConnector, listConnectors, secretOf, toPublic,
} from "@/lib/chat/harness/connectors/store";
import { FetchUrlError } from "@/lib/chat/harness/packs/web";
import { badRequest, handleError, jsonError, notFound, readJson, requireWallet, unauthorized } from "../_lib/http";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

/** GET /api/chat/connectors — { connectors, googleAvailable } (never secrets). */
export async function GET(request: Request) {
  const wallet = await requireWallet(request);
  if (!wallet) return unauthorized();
  try {
    const rows = await listConnectors(wallet);
    return NextResponse.json({ connectors: rows.map(toPublic), googleAvailable: googleEnabled() });
  } catch (err) {
    return handleError(err, "connectors");
  }
}

/** POST /api/chat/connectors — { kind?: 'mcp', name, url, headers? } → connect, list tools, store. */
export async function POST(request: Request) {
  const wallet = await requireWallet(request);
  if (!wallet) return unauthorized();
  const body = await readJson(request);
  if (!body) return badRequest("Ungültige Anfrage.");
  if (body.kind !== undefined && body.kind !== "mcp") return badRequest("Nur MCP-Server können hier hinzugefügt werden.");
  const name = typeof body.name === "string" ? body.name.trim().replace(/\s+/g, " ") : "";
  if (name.length < 1 || name.length > 60) return badRequest("Bitte gib einen Namen (1–60 Zeichen) ein.");
  if (typeof body.url !== "string") return badRequest("Bitte gib die Adresse des MCP-Servers ein.");
  try {
    const url = validateMcpUrl(body.url).toString();
    const headers = sanitizeHeaders(body.headers);
    const existing = await listConnectors(wallet);
    if (existing.length >= MAX_CONNECTORS) return badRequest(`Höchstens ${MAX_CONNECTORS} Verbindungen.`);
    const slug = serverSlug(name);
    if (existing.some((c) => c.kind === "mcp" && serverSlug(c.name) === slug)) {
      return badRequest("Es gibt schon eine Verbindung mit diesem Namen.");
    }
    const tools = await discoverMcpTools(url, headers);
    const row = await insertConnector({ wallet, kind: "mcp", name, url, secret: { headers }, toolsCache: tools });
    return NextResponse.json({ connector: toPublic(row) });
  } catch (err) {
    if (err instanceof FetchUrlError) return badRequest(err.message);
    return handleError(err, "connectors");
  }
}

/** DELETE /api/chat/connectors?id= */
export async function DELETE(request: Request) {
  const wallet = await requireWallet(request);
  if (!wallet) return unauthorized();
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!id) return badRequest("id fehlt.");
  try {
    const row = await getConnector(wallet, id);
    if (!row) return notFound("Verbindung");
    if (row.kind === "google") {
      try {
        const secret = secretOf<GoogleSecret>(row);
        if (secret?.refreshToken) await revokeToken(secret.refreshToken);
      } catch { /* delete anyway */ }
    }
    const ok = await deleteConnector(wallet, id);
    return ok ? NextResponse.json({ ok: true }) : jsonError(404, "not_found", "Verbindung wurde nicht gefunden.");
  } catch (err) {
    return handleError(err, "connectors");
  }
}
