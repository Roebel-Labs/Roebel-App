import { NextResponse } from "next/server";
import { personaStatus } from "@/lib/chat/persona/build";
import * as persona from "@/lib/chat/persona/store";
import type { Suggestion } from "@/lib/chat/persona/types";
import { handleError, requireWallet, unauthorized } from "../../_lib/http";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

/** GET /api/chat/persona/suggestions → {groups: [{title, items}], status}. */
export async function GET(request: Request) {
  const wallet = await requireWallet(request);
  if (!wallet) return unauthorized();
  try {
    const [rows, status] = await Promise.all([persona.listSuggestionRows(wallet), personaStatus(wallet)]);
    const groups: { title: string; items: Suggestion[] }[] = [];
    for (const r of rows) {
      let g = groups.find((x) => x.title === r.group_title);
      if (!g) { g = { title: r.group_title, items: [] }; groups.push(g); }
      g.items.push(persona.toSuggestion(r));
    }
    // "Allgemein" reads best at the end.
    groups.sort((a, b) => Number(a.title === "Allgemein") - Number(b.title === "Allgemein"));
    return NextResponse.json({ groups, status });
  } catch (err) {
    return handleError(err, "persona/suggestions");
  }
}
