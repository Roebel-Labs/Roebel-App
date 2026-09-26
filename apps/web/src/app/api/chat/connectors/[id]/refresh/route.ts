import { NextResponse } from "next/server";
import { discoverMcpTools } from "@/lib/chat/harness/connectors/mcp";
import { getConnector, secretOf, toPublic, updateConnector } from "@/lib/chat/harness/connectors/store";
import { FetchUrlError } from "@/lib/chat/harness/packs/web";
import { badRequest, handleError, notFound, requireWallet, unauthorized } from "../../../_lib/http";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

/** POST /api/chat/connectors/:id/refresh — re-lists the MCP server's tools. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const wallet = await requireWallet(request);
  if (!wallet) return unauthorized();
  const { id } = await params;
  try {
    const row = await getConnector(wallet, id);
    if (!row) return notFound("Verbindung");
    if (row.kind !== "mcp" || !row.url) return badRequest("Nur MCP-Verbindungen können aktualisiert werden.");
    const secret = secretOf<{ headers?: Record<string, string> }>(row);
    try {
      const tools = await discoverMcpTools(row.url, secret?.headers ?? {});
      await updateConnector(wallet, id, { status: "active", toolsCache: tools, lastError: null });
    } catch (err) {
      const message = err instanceof FetchUrlError ? err.message : "Verbindung zum MCP-Server fehlgeschlagen.";
      await updateConnector(wallet, id, { status: "error", lastError: message });
    }
    const fresh = await getConnector(wallet, id);
    return NextResponse.json({ connector: fresh ? toPublic(fresh) : toPublic(row) });
  } catch (err) {
    return handleError(err, "connectors/refresh");
  }
}
