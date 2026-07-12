// Prompt builders for the KIE image models (Seedream 4.5) — app icons,
// store hero and 1:1 previews.
import "server-only";
import type { MiniAppRow } from "../types";

export function buildIconPrompt(app: MiniAppRow, userPrompt?: string): string {
  const parts = [
    `Ein hochwertiges App-Icon für die Mini-App "${app.name}".`,
    app.description ? `Die App: ${app.description}.` : "",
    `Flaches, modernes Design mit einem zentrierten, freundlichen Motiv auf ruhigem Hintergrund in der Farbe ${app.primary_color ?? "#00498B"}.`,
    "Abgerundete Formen, klare Silhouette, kein Text, kein Rahmen, kein Schlagschatten außerhalb der Fläche.",
    userPrompt?.trim() ? `Zusätzlicher Wunsch: ${userPrompt.trim()}.` : "",
  ];
  return parts.filter(Boolean).join(" ");
}

export function buildFeaturePrompt(app: MiniAppRow, userPrompt?: string): string {
  const parts = [
    `Erstelle ein breites Hero-Artwork (16:9) für die Mini-App "${app.name}" im App-Store.`,
    app.description ? `Die App: ${app.description}.` : "",
    `Stimmungsvolle, moderne Illustration der App-Idee mit ruhiger Komposition und der Farbwelt um ${app.primary_color ?? "#00498B"}; unten muss Platz für eine Textzeile bleiben.`,
    "NO TEXT — absolut kein Text im Bild: keine Wörter, keine Buchstaben, keine Schriftzüge, keine Logos. Keine UI-Screenshots.",
    userPrompt?.trim() ? `Zusätzlicher Wunsch: ${userPrompt.trim()}.` : "",
  ];
  return parts.filter(Boolean).join(" ");
}

/**
 * Edit mode: the current image goes in as the NB2 reference, the user's wish
 * is the instruction. Per-kind constraints keep the result usable in its slot.
 */
export function buildEditPrompt(
  app: MiniAppRow,
  opts: { userPrompt: string; kind: "icon" | "feature" | "preview" },
): string {
  const constraints =
    opts.kind === "icon"
      ? "Es bleibt ein App-Icon: zentriertes Motiv, klare Silhouette, kein Text, kein Rahmen, kein Schlagschatten außerhalb der Fläche."
      : opts.kind === "feature"
        ? "Es bleibt ein breites Store-Hero-Artwork (16:9) mit ruhiger Komposition; unten muss Platz für eine Textzeile bleiben. NO TEXT — absolut kein Text im Bild, keine Wörter, Buchstaben oder Logos."
        : "Es bleibt ein App-Store-Vorschaubild (1:1) im hochwertigen App-Store-Look; eine kurze deutsche Bildunterschrift (2–6 Wörter) ist erlaubt, sonst kein Text und keine Logos.";
  return [
    `Bearbeite das beigefügte Bild der Mini-App "${app.name}".`,
    `Gewünschte Änderung: ${opts.userPrompt.trim()}.`,
    "Übernimm Komposition, Stil und Farbwelt des Originals und ändere nur das Gewünschte.",
    constraints,
  ].join(" ");
}

export function buildPreviewPrompt(
  app: MiniAppRow,
  opts: { userPrompt?: string; hasReference: boolean },
): string {
  const base = opts.hasReference
    ? `Erstelle ein App-Store-Vorschaubild für die Mini-App "${app.name}". Zeige den beigefügten Screenshot in einem modernen, leicht geneigten Smartphone-Rahmen auf einem ruhigen Verlaufshintergrund in ${app.primary_color ?? "#00498B"}. Der Screenshot muss klar erkennbar und unverändert bleiben.`
    : `Erstelle ein App-Store-Vorschaubild für die Mini-App "${app.name}"${app.description ? ` (${app.description})` : ""}. Moderne, freundliche Illustration der App-Idee auf ruhigem Verlaufshintergrund in ${app.primary_color ?? "#00498B"}.`;
  // Screenshot previews may carry a short caption; pure illustrations stay text-free.
  const style = opts.hasReference
    ? "Dazu eine kurze deutsche Bildunterschrift mit 2–6 Wörtern, die den gezeigten Screen beschreibt (z. B. über oder unter dem Smartphone). Sonst kein weiterer Text, keine Logos. Viel Luft, hochwertiger App-Store-Look."
    : "Viel Luft, keine Texte, keine Logos, hochwertiger App-Store-Look.";
  const extra = opts.userPrompt?.trim() ? `Zusätzlicher Wunsch: ${opts.userPrompt.trim()}.` : "";
  return [base, style, extra].filter(Boolean).join(" ");
}
