/**
 * POST /api/mini-apps/manifest — draft a store manifest for a built app.
 *
 * Reads the generated HTML + the build conversation and returns an editable
 * manifest draft (name, slug, description, category, tags, permissions, icon
 * as inline SVG). The builder UI prefills its publish form with this; the
 * developer edits before publishing.
 *
 * Body: { html: string; idea?: string }
 * Response: { manifest: ManifestDraft }
 */
import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { manifestDraftSchema } from "@/lib/miniapp/ai/manifest";
import { codegenModelId } from "@/lib/miniapp/ai/model";

export const maxDuration = 60;
export const runtime = "nodejs";

const bodySchema = z.object({
  html: z.string().min(200).max(900_000),
  idea: z.string().max(4000).optional(),
});

const SYSTEM = `Du erstellst den Store-Eintrag (Manifest) für eine Röbel Mini-App aus ihrem HTML-Quelltext und der Idee dahinter.

Regeln:
- name: kurz, deutsch, max. 32 Zeichen, ohne "App" am Ende wenn möglich.
- slug: sprechend, ascii-kleinbuchstaben mit Bindestrichen (aus dem Namen abgeleitet, Umlaute transkribiert: ä→ae, ö→oe, ü→ue, ß→ss).
- description: 1-2 deutsche Sätze (max. 200 Zeichen), beschreibt den Nutzen für Bürger:innen. Niemals "CRC" oder "Circles" — die Währung heißt "Röbel-Münzen".
- permissions: NUR was der Code wirklich benutzt — wallet (sdk.wallet.*/roebel.pay), rewards (roebel.grantReward), circles (roebel.getMuenzenBalance), notifications (notifications.send), share (actions.share).
- tags: bis zu 5 kurze deutsche Schlagworte.
- iconSvg: ein schlichtes quadratisches Icon, viewBox="0 0 64 64", flächig im Navy #00498B auf weißem Grund (oder invertiert), maximal ~15 Elemente, KEINE Texte außer max. 2 Buchstaben, keine Skripte/Links/Event-Attribute.`;

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "server_misconfigured" }, { status: 500 });
  }

  const { html, idea } = parsed.data;
  try {
    const { object } = await generateObject({
      model: anthropic(codegenModelId("default")),
      schema: manifestDraftSchema,
      system: SYSTEM,
      prompt: `${idea ? `Idee / Verlauf:\n${idea}\n\n` : ""}HTML der App:\n${html.slice(0, 60_000)}`,
    });
    return Response.json({ manifest: object });
  } catch (e) {
    console.error("[mini-apps/manifest] generateObject failed", e);
    return Response.json({ error: "manifest_failed" }, { status: 500 });
  }
}
