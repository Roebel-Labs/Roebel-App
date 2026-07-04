/**
 * POST /api/mini-apps/manifest — draft a store manifest for a built app.
 *
 * Reads the generated HTML + the build conversation and returns an editable
 * manifest draft (name, slug, description, category, tags, permissions, icon
 * as inline SVG). The builder UI prefills its publish form with this; the
 * developer edits before publishing.
 *
 * Uses plain text generation + zod validation (with one retry) instead of
 * generateObject: z.ai's API ignores JSON-schema response formats, so schema
 * enforcement happens here.
 *
 * Body: { html: string; idea?: string }
 * Response: { manifest: ManifestDraft }
 */
import { generateText } from "ai";
import { z } from "zod";
import { manifestDraftSchema, type ManifestDraft } from "@/lib/miniapp/ai/manifest";
import { codegenModel, codegenProviderOptions, hasCodegenKey } from "@/lib/miniapp/ai/model";

export const maxDuration = 60;
export const runtime = "nodejs";

const bodySchema = z.object({
  html: z.string().min(200).max(900_000),
  idea: z.string().max(4000).optional(),
});

const SYSTEM = `Du erstellst den Store-Eintrag (Manifest) für eine Röbel Mini-App aus ihrem HTML-Quelltext und der Idee dahinter.

Antworte AUSSCHLIESSLICH mit einem JSON-Objekt (keine Code-Fences, kein Text davor/danach) in exakt dieser Form:
{"name": string, "slug": string, "description": string, "category": string, "tags": string[], "permissions": string[], "primaryColor": string, "iconSvg": string}

Regeln:
- name: kurz, deutsch, max. 32 Zeichen, ohne "App" am Ende wenn möglich.
- slug: sprechend, nur a-z, 0-9 und Bindestriche (aus dem Namen abgeleitet, Umlaute transkribiert: ä→ae, ö→oe, ü→ue, ß→ss), 2-48 Zeichen.
- description: 1-2 deutsche Sätze (max. 200 Zeichen), beschreibt den Nutzen für Bürger:innen. Niemals "CRC" oder "Circles" — die Währung heißt "Röbel-Münzen".
- category: genau eine aus community | governance | finance | utility | games | education | news | culture | environment.
- permissions: Teilmenge von ["wallet","rewards","notifications","circles","share"] — NUR was der Code wirklich benutzt: wallet (sdk.wallet.*/roebel.pay), rewards (roebel.grantReward), circles (roebel.getMuenzenBalance), notifications (notifications.send), share (actions.share).
- tags: bis zu 5 kurze deutsche Schlagworte.
- primaryColor: Hexfarbe, in der Regel "#00498B".
- iconSvg: ein schlichtes quadratisches SVG-Icon als String, viewBox="0 0 64 64", flächig im Navy #00498B auf weißem Grund (oder invertiert), maximal ~15 Elemente, KEINE Texte außer max. 2 Buchstaben, keine Skripte/Links/Event-Attribute.`;

/** Strip optional markdown fences and parse the first JSON object in the text. */
function parseManifest(raw: string): ManifestDraft | null {
  let s = raw.trim();
  const fence = s.match(/^```(?:json)?\s*\n?/i);
  if (fence) s = s.slice(fence[0].length);
  if (s.endsWith("```")) s = s.slice(0, -3);
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const parsed = manifestDraftSchema.safeParse(JSON.parse(s.slice(start, end + 1)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

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
  if (!hasCodegenKey()) {
    return Response.json({ error: "server_misconfigured" }, { status: 500 });
  }

  const { html, idea } = parsed.data;
  const prompt = `${idea ? `Idee / Verlauf:\n${idea}\n\n` : ""}HTML der App:\n${html.slice(0, 60_000)}`;

  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const { text } = await generateText({
        model: codegenModel(),
        system: SYSTEM,
        prompt:
          attempt === 0
            ? prompt
            : `${prompt}\n\nWICHTIG: Deine letzte Antwort war kein gültiges JSON nach dem Schema. Antworte jetzt NUR mit dem JSON-Objekt.`,
        maxOutputTokens: 4000,
        // Fast, deterministic JSON — no thinking pass for the store entry.
        providerOptions: codegenProviderOptions("default"),
      });
      const manifest = parseManifest(text);
      if (manifest) return Response.json({ manifest });
    }
    return Response.json({ error: "manifest_failed" }, { status: 500 });
  } catch (e) {
    console.error("[mini-apps/manifest] generation failed", e);
    return Response.json({ error: "manifest_failed" }, { status: 500 });
  }
}
