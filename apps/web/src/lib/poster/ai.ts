// Server: the two Claude calls of the poster pipeline (vision classification
// and optional copy). Model id follows the repo convention (claude-sonnet-4-6).
import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { LOW_RES_MIN_SIDE } from "./constants";
import { buildPosterCopyPrompt, normalizePosterCopy, posterCopySchema, POSTER_COPY_SYSTEM } from "./copy";
import type { FetchedImage } from "./analyze";
import type { PosterAnalysis, PosterContent, PosterCopy, PosterEventInput } from "./types";

const MODEL = "claude-sonnet-4-6";

export const posterAnalysisSchema = z.object({
  kind: z.enum(["poster", "photo", "logo", "graphic", "screenshot"]),
  hasEventInfo: z
    .boolean()
    .describe("true wenn Titel UND (Datum oder Uhrzeit) der Veranstaltung im Bild lesbar sind"),
  visibleText: z
    .array(z.string())
    .describe("Alle lesbaren Textzeilen wörtlich, in Leserichtung, ohne App-Oberfläche"),
  hasUiChrome: z
    .boolean()
    .describe("true wenn Handy-/App-Oberfläche, PDF-Reader-Leisten, Browser-Rahmen oder Seitenzahlen sichtbar sind"),
  brandColors: z.array(z.string()).describe("2 bis 4 dominante Farben als Hex"),
  styleNotes: z.string().describe("Ein Satz zu Stil und Motiv"),
  quality: z.enum(["ok", "low_res", "blurry"]),
});

const ANALYSIS_PROMPT = `Analysiere dieses Veranstaltungsbild aus einer Stadt-App.
- kind: "poster" = gestaltetes Plakat/Flyer mit Text; "screenshot" = Bildschirmfoto, in dem ein Plakat steckt; "logo" = Wappen/Logo; "photo" = Foto ohne Gestaltung; "graphic" = Grafik/Illustration ohne Veranstaltungstext.
- visibleText: jede Textzeile wörtlich (Umlaute, Groß-/Kleinschreibung, Zahlen exakt), ohne Bedienelemente.
Antworte exakt gemäß Schema.`;

export async function classifyImage(img: FetchedImage): Promise<PosterAnalysis> {
  const { object } = await generateObject({
    model: anthropic(MODEL),
    schema: posterAnalysisSchema,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", image: img.bytes, mediaType: img.contentType },
          { type: "text", text: `${ANALYSIS_PROMPT}\nBildgröße: ${img.width} × ${img.height} Pixel.` },
        ],
      },
    ],
  });
  const lowRes = Math.min(img.width, img.height) < LOW_RES_MIN_SIDE;
  return {
    ...object,
    visibleText: object.visibleText.map((t) => t.trim()).filter(Boolean).slice(0, 40),
    brandColors: object.brandColors.slice(0, 4),
    quality: lowRes && object.quality === "ok" ? "low_res" : object.quality,
  };
}

/** Never throws: an LLM hiccup must not block a poster. */
export async function draftPosterCopy(
  event: PosterEventInput,
  content: PosterContent,
): Promise<PosterCopy> {
  try {
    const { object } = await generateObject({
      model: anthropic(MODEL),
      schema: posterCopySchema,
      system: POSTER_COPY_SYSTEM,
      prompt: buildPosterCopyPrompt(event, content),
    });
    return normalizePosterCopy(object, content);
  } catch (error) {
    console.warn("draftPosterCopy failed, continuing without copy", error);
    return { subline: "", highlights: [] };
  }
}
