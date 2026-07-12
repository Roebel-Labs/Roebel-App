"use client";

// "Hol die Bilder von <Website> in die App" — detects the German
// import-images intent in a chat message and runs the server-side import
// (website → content storage → Mini-CMS key). The caller then tells the
// model about the imported URLs so the SAME turn wires the display.

export interface CmsImportOutcome {
  key: string;
  images: { url: string; alt: string }[];
  sourceHost: string;
}

const URL_RE = /https?:\/\/[^\s"'<>)\]]+/i;
const IMAGE_WORD_RE = /\b(bild(?:er)?|foto(?:s)?|grafik(?:en)?|galerie|logo(?:s)?|images?|pictures?)\b/i;
const ACTION_WORD_RE =
  /\b(hol|hole|holen|lad|lade|laden|importier\w*|übernimm|übernehm\w*|zieh\w*|speicher\w*|kopier\w*|nimm|füg\w*|get|import|load|fetch)\b/i;
// e.g. „… unter dem Schlüssel "galerie" / in den Key galerie“
const KEY_RE = /(?:schlüssel|key)\s*[„"']?([a-z0-9][a-z0-9-_.]{0,63})["'“]?/i;

/** The message asks to pull images from a linked website. */
export function detectImageImportIntent(
  message: string,
): { url: string; key?: string } | null {
  const url = message.match(URL_RE)?.[0];
  if (!url) return null;
  if (!IMAGE_WORD_RE.test(message) || !ACTION_WORD_RE.test(message)) return null;
  const key = message.match(KEY_RE)?.[1]?.toLowerCase();
  return { url, key };
}

export async function runImageImport(
  appSlug: string,
  wallet: string,
  url: string,
  key?: string,
): Promise<{ ok: true; result: CmsImportOutcome } | { ok: false; error: string }> {
  try {
    const res = await fetch("/api/mini-apps/cms-import-images", {
      method: "POST",
      headers: { "content-type": "application/json", "x-wallet-address": wallet },
      body: JSON.stringify({ app: appSlug, url, key }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      key?: string;
      images?: { url: string; alt: string }[];
      sourceHost?: string;
      error?: string;
    };
    if (!res.ok || !data.images?.length) {
      return { ok: false, error: data.error ?? `Fehler ${res.status}` };
    }
    return {
      ok: true,
      result: {
        key: data.key ?? "bilder",
        images: data.images,
        sourceHost: data.sourceHost ?? new URL(url).hostname,
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Model-facing block appended to the user turn after a successful import. */
export function buildImportPromptBlock(outcome: CmsImportOutcome): string {
  const list = outcome.images
    .map((img) => `  { "url": "${img.url}"${img.alt ? `, "alt": "${img.alt.replace(/"/g, "'")}"` : ""} }`)
    .join(",\n");
  return (
    `\n\n[CMS-Bildimport ausgeführt — NICHT erneut importieren]\n` +
    `Von ${outcome.sourceHost} wurden ${outcome.images.length} Bilder übernommen. Sie liegen bereits im Mini-CMS ` +
    `unter dem Schlüssel "${outcome.key}" (scope app) als Array von { url, alt }:\n[\n${list}\n]\n` +
    `Aufgabe: Stelle sicher, dass die App diese Bilder anzeigt — lies sie mit sdk.data.get("${outcome.key}") ` +
    `(Pflicht-Muster: eingebauter Fallback = GENAU dieses Array, dann per data.get überschreiben, wenn exists). ` +
    `Bilder mit <img loading="lazy" class="w-full rounded object-cover"> und alt-Text rendern; ` +
    `Layout passend zur App (z. B. Galerie-Grid oder Bild je Eintrag).`
  );
}
