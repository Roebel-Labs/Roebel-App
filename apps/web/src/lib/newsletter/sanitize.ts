/** Defense-in-depth-Strip für Newsletter-HTML (Tiptap/KI-Ausgabe).
 *  Kein vollständiger Sanitizer — entfernt script-fähige Konstrukte;
 *  ergänzt durch iframe-sandbox in der Vorschau und Escaping im Template. */
export function sanitizeNewsletterHtml(html: string): string {
  return html
    .replace(/<\s*(script|style|iframe|object|embed|form|link|meta)\b[\s\S]*?(<\s*\/\s*\1\s*>|\/?>)/gi, "")
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, "")
    .replace(/(href|src)\s*=\s*(["']?)\s*javascript:[^"'\s>]*\2/gi, '$1="#"')
}

export function escapeHtmlText(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}
