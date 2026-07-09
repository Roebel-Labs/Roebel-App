/**
 * POST /api/mini-apps/cms-plan — pre-flight check for the AI editor: would
 * this app benefit from the Mini-CMS (sdk.data), and if so, which content
 * keys should it use?
 *
 * The editor calls this BEFORE the first generation. When the answer is yes,
 * it shows the "Mini-CMS einrichten" card (keys editable by the user) and
 * appends the confirmed keys to the build prompt so the app is generated
 * CMS-wired from the start; after publishing, the same keys are seeded as
 * initial content.
 *
 * Fast: GLM-5.2 with thinking disabled, small output. Fails soft — the editor
 * proceeds without CMS on any error/timeout.
 *
 * Body: { idea: string }
 * Response: { cms: boolean, reason?: string, keys?: [{key, beschreibung, beispiel}],
 *             userKeys?: [{key, beschreibung}] }
 */
import { generateText } from "ai";
import { z } from "zod";
import { codegenModel, codegenProviderOptions, hasCodegenKey } from "@/lib/miniapp/ai/model";

export const maxDuration = 30;
export const runtime = "nodejs";

const bodySchema = z.object({ idea: z.string().min(3).max(9000) });

const KEY_RE = /^[a-z0-9][a-z0-9-_.]{0,63}$/;

const planSchema = z.object({
  cms: z.boolean(),
  reason: z.string().max(300).optional(),
  keys: z
    .array(
      z.object({
        key: z.string().regex(KEY_RE),
        beschreibung: z.string().min(1).max(200),
        beispiel: z.unknown(),
      }),
    )
    .max(6)
    .default([]),
  userKeys: z
    .array(
      z.object({
        key: z.string().regex(KEY_RE),
        beschreibung: z.string().min(1).max(200),
      }),
    )
    .max(4)
    .default([]),
});

export type CmsPlan = z.infer<typeof planSchema>;

const SYSTEM = `Du prüfst für den Röbel Mini-App-Baukasten, ob eine geplante App vom Mini-CMS profitiert. Das Mini-CMS ist ein Schlüssel/JSON-Speicher: App-Inhalte (scope app) pflegen Redakteur:innen später im Dashboard OHNE die App neu zu bauen; Nutzer-Zustand (scope user) speichert die App pro Person.

Ein CMS lohnt sich, wenn die App PFLEGBARE INHALTE hat: Kurse/Lektionen, Produkte, Speisekarten, Termine, Quizfragen, Texte/FAQ, Öffnungszeiten, Vereins-News. Es lohnt sich NICHT für reine Werkzeuge ohne redaktionelle Inhalte (Rechner, Zähler, reine Anzeige von Live-Daten, Einmal-Formulare).

Nutzer-Zustand (userKeys) lohnt sich bei: Fortschritt, gespeicherten Antworten, Favoriten, Punktestände.

Antworte AUSSCHLIESSLICH mit einem JSON-Objekt (keine Code-Fences, kein Text davor/danach):
{"cms": boolean, "reason": "1 kurzer deutscher Satz", "keys": [{"key": "kleinbuchstaben-slug", "beschreibung": "kurz, deutsch", "beispiel": <kompaktes JSON-Beispiel der Struktur, bei Listen GENAU 1-2 Beispiel-Einträge>}], "userKeys": [{"key": "slug", "beschreibung": "kurz"}]}

Regeln:
- Maximal 4 keys, maximal 2 userKeys — nur was wirklich gebraucht wird. Lieber EIN Schlüssel mit einer Liste (z. B. "kurse" = Liste aller Kurse inkl. Lektionen) als viele kleine.
- key: nur a-z, 0-9, Bindestrich/Unterstrich/Punkt, deutsch und sprechend (z. B. "kurse", "produkte", "quizfragen", "einstellungen").
- beispiel: minimal, aber mit allen Feldern, die die App braucht (inkl. "bild"-URL-Feldern, wo Bilder sinnvoll sind).
- Bei cms=false: keys und userKeys leer lassen.`;

function parsePlan(raw: string): CmsPlan | null {
  let s = raw.trim();
  const fence = s.match(/^```(?:json)?\s*\n?/i);
  if (fence) s = s.slice(fence[0].length);
  if (s.endsWith("```")) s = s.slice(0, -3);
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const parsed = planSchema.safeParse(JSON.parse(s.slice(start, end + 1)));
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

  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const { text } = await generateText({
        model: codegenModel(),
        system: SYSTEM,
        prompt: `Geplante App:\n${parsed.data.idea}`,
        providerOptions: codegenProviderOptions("default"), // thinking disabled → fast
        maxOutputTokens: 1200,
        temperature: 0.2,
      });
      const plan = parsePlan(text);
      if (plan) return Response.json(plan);
    }
    return Response.json({ cms: false });
  } catch (e) {
    console.error("[mini-apps/cms-plan] failed", e);
    // Fail soft: the editor simply builds without CMS.
    return Response.json({ cms: false });
  }
}
