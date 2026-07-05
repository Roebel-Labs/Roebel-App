// Helpers for the raw HTML text stream coming from /api/mini-apps/generate.

/** Remove a leading ```/```html fence and a trailing ``` the model may emit despite instructions. */
export function stripFences(raw: string): string {
  let s = raw.trim();
  const fence = s.match(/^```(?:html)?\s*\n/i);
  if (fence) s = s.slice(fence[0].length);
  if (s.endsWith("```")) s = s.slice(0, -3).trimEnd();
  return s;
}

/** Split the finished stream into the HTML document and the trailing NOTES comment. */
export function extractResult(raw: string): { html: string | null; notes: string } {
  const s = stripFences(raw);
  const notesMatch = s.match(/<!--\s*NOTES:?\s*([\s\S]*?)-->\s*$/i);
  const notes = notesMatch ? notesMatch[1].trim() : "";
  const html = notesMatch ? s.slice(0, notesMatch.index).trimEnd() : s;
  const looksLikeHtml =
    html.slice(0, 200).toLowerCase().includes("<!doctype html") ||
    html.slice(0, 200).toLowerCase().startsWith("<html");
  return { html: looksLikeHtml ? html : null, notes };
}
