import { NextResponse } from "next/server";
import { createThreadWithGreeting } from "@/lib/chat/runtime";
import { badRequest, handleError, readJson, requireWallet, unauthorized } from "../_lib/http";

export const runtime = "nodejs";
export const maxDuration = 60;

/** POST /api/chat/threads — new thread with the given bots; they greet. */
export async function POST(request: Request) {
  const wallet = await requireWallet(request);
  if (!wallet) return unauthorized();
  const body = await readJson(request);
  const botIds = body?.botIds;
  if (!Array.isArray(botIds) || !botIds.length || !botIds.every((x) => typeof x === "string")) {
    return badRequest("Bitte wähle mindestens einen Bot.");
  }
  try {
    const { thread, messages } = await createThreadWithGreeting(wallet, botIds as string[]);
    return NextResponse.json({ thread, messages });
  } catch (err) {
    return handleError(err, "threads");
  }
}
