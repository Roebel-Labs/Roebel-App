import { NextResponse } from "next/server";
import * as store from "@/lib/chat/store";
import { badRequest, handleError, notFound, readJson, requireWallet, unauthorized } from "../../_lib/http";
import { parseBotBody } from "../../_lib/bot-input";

export const runtime = "nodejs";
export const maxDuration = 60;

/** PATCH /api/chat/bots/:id — update an own bot (presets are read-only). */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const wallet = await requireWallet(request);
  if (!wallet) return unauthorized();
  const { id } = await params;
  if (!store.isUuid(id)) return notFound("Der Bot");
  const body = await readJson(request);
  if (!body) return badRequest("Ungültige Anfrage.");
  const parsed = parseBotBody(body, { requireName: false });
  if (typeof parsed === "string") return badRequest(parsed);
  if (!Object.keys(parsed).length) return badRequest("Keine Änderungen angegeben.");
  try {
    const bot = await store.updateBot(wallet, id, parsed);
    if (!bot) return notFound("Der Bot");
    return NextResponse.json({ bot });
  } catch (err) {
    return handleError(err, "bots/:id");
  }
}
