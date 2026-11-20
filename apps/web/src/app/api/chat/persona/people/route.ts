import { NextResponse } from "next/server";
import { personSlug } from "@/lib/chat/persona/classify";
import * as persona from "@/lib/chat/persona/store";
import { badRequest, handleError, readJson, requireWallet, unauthorized } from "../../_lib/http";

export const runtime = "nodejs";
export const maxDuration = 30;

const EMAIL = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;

/** POST /api/chat/persona/people — {name, email?, description?} → {page}: a contact the person adds by hand. */
export async function POST(request: Request) {
  const wallet = await requireWallet(request);
  if (!wallet) return unauthorized();
  const input = await readJson(request);
  const name = typeof input?.name === "string" ? input.name.trim() : "";
  if (!name || name.length > 80) return badRequest("Bitte gib einen Namen mit höchstens 80 Zeichen an.");
  const email = typeof input?.email === "string" && input.email.trim() ? input.email.trim().toLowerCase() : null;
  if (email && !EMAIL.test(email)) return badRequest("Diese E-Mail-Adresse sieht nicht richtig aus.");
  const description = typeof input?.description === "string" ? input.description.trim().slice(0, 200) : "";
  try {
    const slug = personSlug(email, name);
    const existing = await persona.getPageRow(wallet, slug);
    if (existing) return NextResponse.json({ page: persona.toPage(existing) });
    const row = await persona.upsertPage(wallet, {
      slug, kind: "person", title: name, summary: description, parent: "people",
      body: `## Kontakt\n${email ? `- E-Mail: ${email}` : "- E-Mail: unbekannt"}\n\n## Wer das ist\n${description ? `- ${description}` : "- Noch nichts notiert."}`,
      facts: email ? [{ label: "E-Mail", value: email }] : [],
      meta: { email, name, description, priority: 200 }, editedByUser: true,
    });
    return NextResponse.json({ page: persona.toPage(row) });
  } catch (err) {
    return handleError(err, "persona/people");
  }
}
