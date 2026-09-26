import { NextResponse } from "next/server";
import * as store from "@/lib/chat/store";
import { grantableToolsForWallet } from "@/lib/chat/harness/grants";
import { listGrants, setGrants } from "@/lib/chat/harness/policy";
import { badRequest, handleError, notFound, readJson, requireWallet, unauthorized } from "../../../_lib/http";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

async function usableBot(wallet: string, id: string) {
  if (!store.isUuid(id)) return null;
  const [bot] = await store.getUsableBotRows(wallet, [id]);
  return bot ?? null;
}

/** GET /api/chat/bots/:id/grants → {tools, available: [{tool, label, risk}]} (gated public/external tools only). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const wallet = await requireWallet(request);
  if (!wallet) return unauthorized();
  const { id } = await params;
  try {
    const bot = await usableBot(wallet, id);
    if (!bot) return notFound("Der Bot");
    const available = await grantableToolsForWallet(bot.tools, wallet);
    const allowed = new Set(available.map((a) => a.tool));
    const tools = (await listGrants(wallet, bot.id)).filter((t) => allowed.has(t));
    return NextResponse.json({ tools, available });
  } catch (err) {
    return handleError(err, "bots/:id/grants");
  }
}

/** PUT /api/chat/bots/:id/grants {tools} — replaces the always-allowed set → {tools, available}. */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const wallet = await requireWallet(request);
  if (!wallet) return unauthorized();
  const { id } = await params;
  const body = await readJson(request);
  if (!body || !Array.isArray(body.tools) || !body.tools.every((t) => typeof t === "string") || body.tools.length > 100) {
    return badRequest("Ungültige Werkzeugliste.");
  }
  try {
    const bot = await usableBot(wallet, id);
    if (!bot) return notFound("Der Bot");
    const available = await grantableToolsForWallet(bot.tools, wallet);
    const allowed = new Set(available.map((a) => a.tool));
    const requested = body.tools as string[];
    const unknown = requested.filter((t) => !allowed.has(t));
    if (unknown.length) return badRequest("Diese Werkzeuge können nicht immer erlaubt werden.");
    const tools = await setGrants(wallet, bot.id, requested);
    return NextResponse.json({ tools, available });
  } catch (err) {
    return handleError(err, "bots/:id/grants");
  }
}
