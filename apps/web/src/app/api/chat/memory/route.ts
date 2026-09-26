import { NextResponse } from "next/server";
import { listMemories } from "@/lib/chat/harness/memory";
import { handleError, requireWallet, unauthorized } from "../_lib/http";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

/** GET /api/chat/memory — {memories: {id, botId, fact, createdAt}[]}, newest first. */
export async function GET(request: Request) {
  const wallet = await requireWallet(request);
  if (!wallet) return unauthorized();
  try {
    return NextResponse.json({ memories: await listMemories(wallet) });
  } catch (err) {
    return handleError(err, "memory");
  }
}
