// Helpers for the /api/mini-apps/generate stream.
//
// Protocol 2 (current): newline-delimited JSON frames —
//   {t:"status", v:"vision"|"code"}  phase changes
//   {t:"brief",  v:string}           the GLM-4.6V image-analysis brief
//   {t:"think",  v:string}           model reasoning delta ("Stark" mode)
//   {t:"html",   v:string}           document text delta
//   {t:"ping"}                       keepalive (ignore)
// Legacy (no `protocol` in the request): raw HTML text stream.

export interface StreamFrame {
  t: "status" | "brief" | "think" | "html" | "ping" | string;
  v?: string;
}

/** Incremental NDJSON parser: feed decoded chunks, get one callback per frame. */
export function makeFrameParser(onFrame: (f: StreamFrame) => void): (chunk: string) => void {
  let buffer = "";
  return (chunk: string) => {
    buffer += chunk;
    for (;;) {
      const nl = buffer.indexOf("\n");
      if (nl < 0) return;
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      try {
        onFrame(JSON.parse(line) as StreamFrame);
      } catch {
        /* skip malformed frame */
      }
    }
  };
}

/** Remove a leading ```/```html fence and a trailing ``` the model may emit despite instructions. */
export function stripFences(raw: string): string {
  let s = raw.trim();
  const fence = s.match(/^```(?:html)?\s*\n/i);
  if (fence) s = s.slice(fence[0].length);
  if (s.endsWith("```")) s = s.slice(0, -3).trimEnd();
  return s;
}

/** Split the finished stream into the HTML document and the trailing NOTES comment. */
export function extractResult(raw: string): {
  html: string | null;
  notes: string;
  /** true = document started but never closed (</html> missing) — the stream
   * or the model's output budget was cut mid-document. Never use such a doc. */
  truncated?: boolean;
} {
  const s = stripFences(raw);
  const notesMatch = s.match(/<!--\s*NOTES:?\s*([\s\S]*?)-->\s*$/i);
  const notes = notesMatch ? notesMatch[1].trim() : "";
  const html = notesMatch ? s.slice(0, notesMatch.index).trimEnd() : s;
  const looksLikeHtml =
    html.slice(0, 200).toLowerCase().includes("<!doctype html") ||
    html.slice(0, 200).toLowerCase().startsWith("<html");
  if (looksLikeHtml && !/<\/html\s*>/i.test(html.slice(-400))) {
    return { html: null, notes, truncated: true };
  }
  return { html: looksLikeHtml ? html : null, notes };
}
