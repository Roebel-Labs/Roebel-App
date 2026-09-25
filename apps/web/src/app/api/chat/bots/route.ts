import { NextResponse } from "next/server";
import * as store from "@/lib/chat/store";
import { badRequest, handleError, readJson, requireWallet, unauthorized } from "../_lib/http";
import { parseBotBody } from "../_lib/bot-input";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BOTS_PER_WALLET = 30;

/** POST /api/chat/bots — create an own bot. */
export async function POST(request: Request) {
  const wallet = await requireWallet(request);
  if (!wallet) return unauthorized();
  const body = await readJson(request);
  if (!body) return badRequest("Ungültige Anfrage.");
  const parsed = parseBotBody(body, { requireName: true });
  if (typeof parsed === "string") return badRequest(parsed);
  try {
    const existing = await store.listUserBots(wallet);
    if (existing.length >= MAX_BOTS_PER_WALLET) return badRequest(`Du kannst höchstens ${MAX_BOTS_PER_WALLET} eigene Bots anlegen.`);
    const bot = await store.createBot(wallet, {
      name: parsed.name!,
      description: parsed.description ?? "",
      instructions: parsed.instructions ?? "",
      avatar: parsed.avatar ?? store.normalizeAvatar(null),
      modelRoute: parsed.model_route,
    });
    return NextResponse.json({ bot });
  } catch (err) {
    return handleError(err, "bots");
  }
}
