import { NextResponse } from "next/server";
import { personaStatus } from "@/lib/chat/persona/build";
import * as persona from "@/lib/chat/persona/store";
import { handleError, requireWallet, unauthorized } from "../_lib/http";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

/** GET /api/chat/persona — {status, pages, people, updates}: the wiki index. */
export async function GET(request: Request) {
  const wallet = await requireWallet(request);
  if (!wallet) return unauthorized();
  try {
    const [status, rows, updates] = await Promise.all([
      personaStatus(wallet), persona.listPageRows(wallet), persona.listUpdates(wallet),
    ]);
    const order = ["overview", "goals", "projects", "profile", "communication-style", "background", "work-patterns", "notes"];
    const rank = (slug: string) => { const i = order.indexOf(slug); return i < 0 ? order.length : i; };
    const pages = rows.filter((r) => r.kind !== "person" && r.kind !== "core").sort((a, b) => rank(a.slug) - rank(b.slug)).map(persona.toMeta);
    const people = rows.filter((r) => r.kind === "person").map(persona.toPerson).sort((a, b) => b.priority - a.priority || a.name.localeCompare(b.name));
    return NextResponse.json({ status, pages, people, updates });
  } catch (err) {
    return handleError(err, "persona");
  }
}

/** DELETE /api/chat/persona — wipes the wiki, imports and suggestions. */
export async function DELETE(request: Request) {
  const wallet = await requireWallet(request);
  if (!wallet) return unauthorized();
  try {
    await persona.wipePersona(wallet);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err, "persona");
  }
}
