import { NextResponse } from "next/server";
import { loadProfile } from "@/lib/chat/harness/context";
import * as persona from "@/lib/chat/persona/store";
import { handleError, requireWallet, unauthorized } from "../../_lib/http";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

/** GET /api/chat/persona/briefing → {name, date, items[{label, text, task}], suggestions, doc, title, audio}: what the start page greets the person with. */
export async function GET(request: Request) {
  const wallet = await requireWallet(request);
  if (!wallet) return unauthorized();
  try {
    const [row, rows, profile, overview] = await Promise.all([
      persona.getPageRow(wallet, "_briefing"), persona.listSuggestionRows(wallet), loadProfile(wallet).catch(() => null),
      persona.getPageRow(wallet, "overview"),
    ]);
    // First name: from the wiki's info box (the person's real name), else the Röbel profile.
    const full = (overview?.facts ?? []).find((f) => f.label.toLowerCase() === "name")?.value || profile?.displayName || "";
    const first = full.trim().split(/\s+/)[0] ?? "";
    const name = /^[\p{L}][\p{L}'-]{1,30}$/u.test(first) ? first : null;
    // The build sorts by urgency (today's offers first), so the order is kept; never more than five.
    const picked = rows.slice(0, 5).map(persona.toSuggestion);
    const byTitle = new Map(rows.map((r) => [r.title, r]));
    const doc = row?.body?.trim() || null;
    const when = row?.updated_at ? new Date(row.updated_at) : null;
    const title = doc && when
      ? `Tagesbriefing · ${new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Berlin" }).format(when)}`
      : null;
    return NextResponse.json({
      doc, title, audio: Boolean(doc && process.env.ELEVENLABS_API_KEY),
      name,
      date: row?.updated_at ?? null,
      // A point links to the suggestion that tackles it, as long as that one is still open.
      items: (row?.facts ?? []).map((f) => {
        const hit = f.action ? byTitle.get(f.action) : undefined;
        return { label: f.label, text: f.value, task: hit ? persona.toSuggestion(hit) : null };
      }),
      suggestions: picked,
    });
  } catch (err) {
    return handleError(err, "persona/briefing");
  }
}
