// Optional LLM copy for designed posters: one subline + up to three short
// highlights, drafted from the description. Never facts (those come from
// content.ts). Schema is strings only (@ai-sdk/anthropic rejects numeric bounds).
import { z } from "zod";
import { contentLines } from "./content";
import type { PosterContent, PosterCopy, PosterEventInput } from "./types";

export const posterCopySchema = z.object({
  subline: z
    .string()
    .describe("Eine kurze Unterzeile (max. ~10 Wörter), die Lust auf die Veranstaltung macht. Leer, wenn nichts Sinnvolles."),
  highlights: z
    .array(z.string())
    .describe("0 bis 3 kurze Stichpunkte (je max. ~5 Wörter) aus der Beschreibung, z. B. „Livemusik“ oder „Kaffee und Kuchen“."),
});

export const POSTER_COPY_SYSTEM = `Du bist Meckys Grafik-Texter für die Stadt Röbel/Müritz.
Du lieferst nur ergänzenden Kurztext für ein Veranstaltungsplakat.
Regeln:
- Sprache: Deutsch, klar, einladend, nie werblich-übertrieben.
- Erfinde KEINE Fakten (Datum, Uhrzeit, Ort, Preis, Namen). Diese stehen bereits fest und dürfen nicht wiederholt werden.
- Keine Emojis, keine Ausrufezeichen-Ketten.
- Gib die Felder exakt gemäß Schema zurück.`;

const SUBLINE_MAX = 80;
const HIGHLIGHT_MAX = 40;
const HIGHLIGHTS_MAX = 3;

export function buildPosterCopyPrompt(event: PosterEventInput, content: PosterContent): string {
  const fixed = contentLines(content).map((l) => `- ${l}`).join("\n");
  const description = (event.description ?? "").replace(/\s+/g, " ").trim().slice(0, 1500);
  return [
    "Feststehende Zeilen auf dem Plakat (nicht wiederholen):",
    fixed,
    "",
    description ? `Beschreibung der Veranstaltung:\n${description}` : "Es gibt keine Beschreibung.",
    "",
    "Schreibe eine passende Unterzeile und bis zu drei Highlights.",
  ].join("\n");
}

export function normalizePosterCopy(
  raw: Partial<PosterCopy> | null | undefined,
  content: PosterContent,
): PosterCopy {
  const fixed = new Set(contentLines(content).map((l) => l.toLowerCase()));
  const clean = (s: unknown, max: number) =>
    String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max);
  const seen = new Set<string>();
  const highlights: string[] = [];
  for (const h of Array.isArray(raw?.highlights) ? raw.highlights : []) {
    const v = clean(h, HIGHLIGHT_MAX);
    const key = v.toLowerCase();
    if (!v || seen.has(key) || fixed.has(key)) continue;
    seen.add(key);
    highlights.push(v);
    if (highlights.length >= HIGHLIGHTS_MAX) break;
  }
  const subline = clean(raw?.subline, SUBLINE_MAX);
  return { subline: fixed.has(subline.toLowerCase()) ? "" : subline, highlights };
}
