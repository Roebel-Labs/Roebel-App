// Pure prompt builders for the two poster pipelines (German, like the probe
// prompts that produced the reference results on 2026-09-22).
import { contentLines } from "./content";
import type { PosterAnalysis, PosterContent, PosterCopy, PosterDirection } from "./types";

export const POSTER_GUARD = [
  "Anforderungen: druckfähiges Plakat im DIN-A-Hochformat (Seitenverhältnis 1:1,414), Format komplett gefüllt, kein Rand, kein Letterboxing.",
  "Alle Texte korrekt geschrieben, vollständig lesbar, nichts am Rand abgeschnitten, keine Texte erfinden, keine Platzhaltertexte, keine erfundenen Sponsoren oder Logos.",
  "Moderner Print-Look wie von einer Werbeagentur: klare Hierarchie, ruhige Flächen, präzise Typografie. Kein KI-Kitsch, kein übertriebenes Glühen, keine Wasserzeichen.",
].join("\n");

const DESIGN_GUARD = "Keine erfundenen Menschen mit erkennbaren Gesichtern.";

export function buildReformatPrompt(
  analysis: PosterAnalysis,
  direction: PosterDirection,
  hint?: string | null,
): string {
  const texts = analysis.visibleText
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => `„${t}“`)
    .join(" / ");
  return [
    "Du bist ein professioneller Grafikdesigner. Das Eingabebild ist ein vorhandenes Veranstaltungsplakat, das nicht sauber im DIN-A-Hochformat vorliegt. Baue es auf DIN A um.",
    analysis.hasUiChrome
      ? "Das Bild ist ein Screenshot: entferne die gesamte App-Oberfläche (Kopfzeilen, Icons, Ränder, Seitenzahlen) und übernimm nur das Plakat."
      : "",
    texts
      ? `Alle Texte exakt beibehalten, Wort für Wort, gleiche Schreibweise: ${texts}. Keine neuen Texte erfinden.`
      : "Alle im Bild sichtbaren Texte exakt beibehalten, Wort für Wort. Keine neuen Texte erfinden.",
    "Logos und Fotos originalgetreu übernehmen, nicht neu zeichnen.",
    `Stilrichtung „${direction.label}“: ${direction.brief}`,
    analysis.quality !== "ok"
      ? "Das Original ist niedrig aufgelöst oder unscharf: Texte und Formen sauber und scharf neu setzen, Inhalt unverändert."
      : "",
    hint?.trim() ? `Zusätzlicher Hinweis der Redaktion: ${hint.trim()}` : "",
    POSTER_GUARD,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildDesignPrompt(
  content: PosterContent,
  copy: PosterCopy | null,
  direction: PosterDirection,
  options: { hasReference: boolean; referenceKind?: string | null; hint?: string | null },
): string {
  const lines = contentLines(content);
  const extras = copy ? [copy.subline, ...copy.highlights].map((s) => s.trim()).filter(Boolean) : [];
  const referenceWhat =
    options.referenceKind === "logo"
      ? "das Logo des Veranstalters"
      : options.referenceKind === "photo"
        ? "ein Foto zur Veranstaltung"
        : "ein Bild des Veranstalters";
  return [
    "Du bist ein professioneller Grafikdesigner. Gestalte ein Veranstaltungsplakat im DIN-A-Hochformat für eine Veranstaltung in Röbel/Müritz.",
    options.hasReference
      ? `Das Eingabebild ist ${referenceWhat}: binde es originalgetreu ein (nicht verändern, nicht neu zeichnen), gut sichtbar, aber nicht als verzerrter Hintergrund.`
      : "Es gibt kein Referenzbild: gestalte ein passendes grafisches Motiv ohne eigenen Text.",
    "Inhalt (exakt so, deutsch, keine weiteren Fakten erfinden):",
    ...lines.map((l) => `- ${l}`),
    extras.length ? "Optional als Unterzeile oder kleine Highlights:" : "",
    ...extras.map((l) => `- ${l}`),
    "Hierarchie: Titel am größten, dann Datum und Uhrzeit, dann Ort; Preis und Veranstalter klein.",
    `Stilrichtung „${direction.label}“: ${direction.brief}`,
    options.hint?.trim() ? `Zusätzlicher Hinweis: ${options.hint.trim()}` : "",
    POSTER_GUARD,
    DESIGN_GUARD,
  ]
    .filter(Boolean)
    .join("\n");
}
