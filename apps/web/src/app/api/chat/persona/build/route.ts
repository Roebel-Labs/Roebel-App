import { after, NextResponse } from "next/server";
import { PersonaBusyError, PersonaRateError, startPersonaBuild, tickPersonaJob } from "@/lib/chat/persona/build";
import { handleError, jsonError, readJson, requireWallet, unauthorized } from "../../_lib/http";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * POST /api/chat/persona/build — {mode?: 'full' | 'refresh'} → {status}.
 * Answers at once; the first tick of the build runs after the response, the
 * cron (/api/chat/cron/persona) continues it.
 */
export async function POST(request: Request) {
  const wallet = await requireWallet(request);
  if (!wallet) return unauthorized();
  const input = await readJson(request);
  const mode = input?.mode === "refresh" ? "refresh" : "full";
  try {
    const status = await startPersonaBuild(wallet, mode);
    after(() => tickPersonaJob(wallet).catch((err) => console.error("[api/chat/persona/build] tick", err)));
    return NextResponse.json({ status });
  } catch (err) {
    if (err instanceof PersonaBusyError) return jsonError(409, "busy", "Dein Wiki wird gerade aufgebaut.");
    if (err instanceof PersonaRateError) return jsonError(429, "rate_limited", "Das Wiki wurde heute schon mehrmals aufgebaut. Morgen geht es wieder.");
    return handleError(err, "persona/build");
  }
}
