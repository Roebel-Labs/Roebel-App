/**
 * Vision sidecar for the AI Mini App Builder.
 *
 * GLM-5.2 (the codegen model) is text-only on the z.ai coding endpoint, but
 * GLM-4.6V accepts images on the SAME key/endpoint (verified live 2026-07-08).
 * So attached images (mockups, screenshots, logos, sketches) are first turned
 * into a precise German implementation brief here, and that brief rides along
 * with the user's text into the GLM-5.2 codegen prompt.
 *
 * Called with plain fetch (not the AI SDK): GLM-4.6V is a reasoning vision
 * model whose reasoning_content the pinned openai-compatible provider doesn't
 * separate cleanly — the raw API with thinking disabled returns direct content.
 */

const VISION_MODEL = "glm-4.6v";
const ZAI_BASE_URL = "https://api.z.ai/api/coding/paas/v4";
// Hard wall-clock cap for the WHOLE vision call (connect + compute + body read).
// The generate route's total budget is maxDuration; vision must never eat it.
const VISION_TIMEOUT_MS = 75_000;

const BRIEF_PROMPT = `Du bist UI-Analyst:in für einen Mini-App-Baukasten. Analysiere die angehängten Bilder als Umsetzungsvorlage für eine mobile Mini-App (~360px breit) und schreibe einen präzisen deutschen Umsetzungs-Brief:

1. ART je Bild: UI-Mockup / App-Screenshot / Skizze / Logo / Foto / Dokument.
2. LAYOUT: Screens bzw. Sektionen in Reihenfolge, Hierarchie, Navigationsmuster.
3. KOMPONENTEN: jede erkennbare Komponente (Header, Cards, Buttons, Listen, Tabs, Charts, Formulare …) mit Position und Zweck.
4. FARBEN & STIL: dominante Farben als Hex (geschätzt), Ecken/Radien, Dichte, Typografie-Charakter. Hinweis: Die App wird das Röbel-Design-System nutzen — nenne, was von der Vorlage übernommen werden soll (Struktur, Stimmung) vs. was die Röbel-Farben ersetzen.
5. TEXTE: ALLE lesbaren Texte wörtlich (Headlines, Labels, Buttons, Platzhalter).
6. FUNKTION: Was soll die App offenbar tun? Welche Interaktionen legt die Vorlage nahe?

Bei Logos/Fotos ohne UI: beschreibe Motiv, Farben und wie es in der App eingesetzt werden kann (Inline-SVG nachbauen oder als Stilreferenz).
Max. 500 Wörter, keine Einleitung, direkt der Brief.`;

export interface VisionImage {
  /** data:image/(png|jpeg|webp);base64,… */
  dataUrl: string;
}

/**
 * Turn attached images into an implementation brief. Returns null on ANY
 * failure — image analysis must never block generation.
 */
export async function analyzeImagesForBrief(
  images: VisionImage[],
  userText: string,
): Promise<string | null> {
  const apiKey = process.env.Z_API_KEY;
  if (!apiKey || images.length === 0) return null;

  const content: Array<Record<string, unknown>> = [
    {
      type: "text",
      text: `${BRIEF_PROMPT}\n\nAnmerkung der Nutzer:in dazu: "${userText.slice(0, 1000)}"`,
    },
    ...images.map((img) => ({
      type: "image_url",
      image_url: { url: img.dataUrl },
    })),
  ];

  const controller = new AbortController();
  // The timer must stay armed through the BODY read too — an early-headers/
  // slow-body response would otherwise hang past the abort (this exact gap
  // burned a full 300s maxDuration → 504 on 2026-07-08).
  const timer = setTimeout(() => controller.abort(), VISION_TIMEOUT_MS);
  try {
    const res = await fetch(
      `${process.env.Z_API_BASE_URL || ZAI_BASE_URL}/chat/completions`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: VISION_MODEL,
          thinking: { type: "disabled" },
          messages: [{ role: "user", content }],
          max_tokens: 1800,
          temperature: 0.2,
        }),
        signal: controller.signal,
      },
    );
    if (!res.ok) {
      console.error("[mini-apps/vision] HTTP", res.status, await res.text().catch(() => ""));
      return null;
    }
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const brief = json.choices?.[0]?.message?.content?.trim();
    return brief && brief.length > 20 ? brief : null;
  } catch (e) {
    console.error("[mini-apps/vision] failed", e);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
