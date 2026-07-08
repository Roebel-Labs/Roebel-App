/**
 * /api/mini-apps/api-keys — developer API keys (for the MCP server + external
 * publishing from Claude Code etc.). Named "api-keys" because the root
 * .gitignore ignores any keys/ directory.
 *
 *   GET              → { keys: ApiKeyRow[] }          (own keys, active only)
 *   POST { name? }   → { key, row }                   (plain key shown ONCE)
 *   DELETE { id }    → { ok: true }                   (revoke)
 *
 * Auth: the dashboard's wallet header (same MVP trust tier as the other
 * builder routes). Keys themselves then authenticate MCP/API calls.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, resolveDeveloper } from "@/lib/miniapp/http";
import { createApiKey, listApiKeys, revokeApiKey } from "@/lib/miniapp/keys";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const dev = await resolveDeveloper(request);
    return NextResponse.json({ keys: await listApiKeys(dev) });
  } catch (e) {
    return jsonError(e);
  }
}

const createSchema = z.object({ name: z.string().min(1).max(60).optional() });

export async function POST(request: Request) {
  try {
    const body = createSchema.safeParse(await request.json().catch(() => ({})));
    if (!body.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    const dev = await resolveDeveloper(request);
    const existing = await listApiKeys(dev);
    if (existing.length >= 5) {
      return NextResponse.json(
        { error: "Maximal 5 aktive API-Keys — widerrufe zuerst einen alten." },
        { status: 400 },
      );
    }
    const { key, row } = await createApiKey(dev, body.data.name);
    return NextResponse.json({ key, row }, { status: 201 });
  } catch (e) {
    return jsonError(e);
  }
}

const deleteSchema = z.object({ id: z.string().uuid() });

export async function DELETE(request: Request) {
  try {
    const body = deleteSchema.safeParse(await request.json().catch(() => null));
    if (!body.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    const dev = await resolveDeveloper(request);
    await revokeApiKey(dev, body.data.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
