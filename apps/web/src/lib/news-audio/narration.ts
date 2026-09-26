// apps/web/src/lib/news-audio/narration.ts
// Pure helpers for "Vorlesen" on news articles: turn the article's rich-text
// HTML into speakable text, split it into ElevenLabs-sized chunks, and derive
// the content-addressed storage path. No I/O here.
import { createHash } from "node:crypto";
import { TTS_MODEL_ID, VOICE_SETTINGS } from "@/lib/event-radio/tts";

// eleven_multilingual_v2 accepts up to 10k characters per request; smaller
// chunks keep each call well inside the Vercel function budget.
export const MAX_CHUNK_CHARS = 4500;
// Hard cap so one very long article cannot burn the ElevenLabs quota.
export const MAX_TOTAL_CHARS = 40_000;

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "–",
  hellip: "…",
  bdquo: "„",
  ldquo: "“",
  rdquo: "”",
  lsquo: "‘",
  rsquo: "’",
  auml: "ä",
  ouml: "ö",
  uuml: "ü",
  Auml: "Ä",
  Ouml: "Ö",
  Uuml: "Ü",
  szlig: "ß",
  euro: "€",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === "#") {
      const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : match;
    }
    return ENTITIES[code] ?? match;
  });
}

// URLs, www. hosts, e-mail addresses and bare domains on common TLDs
// ("roebel.app/news"): never read out.
// A URL's tail stops before closing punctuation, so "(www.x.de)." keeps ")."
const URL_TAIL = String.raw`(?:\S*[^\s.,;:!?)\]"'»“”])?`;
const URL_LIKE = new RegExp(
  [
    String.raw`\b(?:https?:\/\/|www\.)` + URL_TAIL,
    String.raw`\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b`,
    String.raw`\b(?:[\w-]+\.)+(?:de|com|org|net|app|eu|info|io|site|xyz|online|shop)\b(?:\/` + URL_TAIL + ")?",
  ].join("|"),
  "gi",
);
// Visible link text that is itself just an address ("roebel.de", "example.com/x").
const DOMAIN_ONLY = /^\s*(?:https?:\/\/)?(?:www\.)?[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}(?:\/\S*)?\s*$/i;

/** Drops links: anchors whose text is an address vanish, others keep their words. */
function stripLinks(html: string): string {
  return html.replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, (_m, inner: string) =>
    DOMAIN_ONLY.test(inner.replace(/<[^>]+>/g, "")) ? " " : inner,
  );
}

/** Rich-text HTML → plain paragraphs separated by blank lines, without links. */
export function htmlToSpeechText(html: string | null | undefined): string {
  if (!html) return "";
  const text = stripLinks(html)
    .replace(/<(script|style|figure|figcaption|iframe)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|blockquote|ul|ol|tr)>/gi, "\n\n")
    .replace(/<li[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(text)
    .replace(URL_LIKE, " ")
    .split(/\n{2,}/)
    .map((p) => p.replace(/\(\s*\)/g, "").replace(/\s+/g, " ").replace(/\s+([.,;:!?)])/g, "$1").trim())
    .filter(Boolean)
    .join("\n\n");
}

/** Title, dek and body, each ending in a full stop so the voice pauses. */
export function buildNarrationText(article: {
  title: string;
  excerpt: string | null;
  content: string | null;
}): string {
  const stop = (s: string) => (/[.!?…:]$/.test(s) ? s : `${s}.`);
  const plain = (s: string | null | undefined) => (s ?? "").replace(URL_LIKE, " ").replace(/\s+/g, " ").trim();
  const parts = [plain(article.title), plain(article.excerpt), htmlToSpeechText(article.content)]
    .filter(Boolean)
    .map(stop);
  const text = parts.join("\n\n");
  return text.length > MAX_TOTAL_CHARS ? `${text.slice(0, MAX_TOTAL_CHARS).replace(/\s+\S*$/, "")} …` : text;
}

function splitLong(paragraph: string, max: number): string[] {
  if (paragraph.length <= max) return [paragraph];
  const sentences = paragraph.match(/[^.!?…]+[.!?…]+["“”']?\s*|[^.!?…]+$/g) ?? [paragraph];
  const out: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (sentence.length > max) {
      if (current) out.push(current.trim());
      current = "";
      for (let i = 0; i < sentence.length; i += max) out.push(sentence.slice(i, i + max).trim());
      continue;
    }
    if ((current + sentence).length > max) {
      out.push(current.trim());
      current = "";
    }
    current += sentence;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

/** Packs paragraphs into chunks of at most `max` characters. */
export function chunkText(text: string, max = MAX_CHUNK_CHARS): string[] {
  const pieces = text.split(/\n{2,}/).flatMap((p) => splitLong(p, max));
  const chunks: string[] = [];
  let current = "";
  for (const piece of pieces) {
    const next = current ? `${current}\n\n${piece}` : piece;
    if (next.length > max && current) {
      chunks.push(current);
      current = piece;
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

export type NarrationContext = { voiceId: string; speed: number };

export function narrationHash(text: string, ctx: NarrationContext): string {
  return createHash("sha256")
    .update(JSON.stringify({ text, voiceId: ctx.voiceId, speed: ctx.speed, model: TTS_MODEL_ID, settings: VOICE_SETTINGS }))
    .digest("hex")
    .slice(0, 12);
}

/** Folder + file stem; the full file name appends `-<durationMs>.mp3`. */
export function narrationObjectStem(articleId: string, hash: string): { folder: string; stem: string } {
  return { folder: `news/${articleId}`, stem: hash };
}

export function narrationFileName(stem: string, durationMs: number): string {
  return `${stem}-${Math.max(0, Math.round(durationMs))}.mp3`;
}

/** Reads the duration back out of a stored file name, or null. */
export function durationFromFileName(stem: string, name: string): number | null {
  const m = name.match(new RegExp(`^${stem}-(\\d+)\\.mp3$`));
  return m ? Number(m[1]) : null;
}
