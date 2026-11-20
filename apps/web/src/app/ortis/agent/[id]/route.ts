// Public share page of an Ortis agent character ("Teilen" in Ortis Studio): the picture on its colour, the name
// the person gave it, and a link preview (card.png). Only the character id and an optional display name come in.
import { characterArt, characterById, characterRoleLine } from "@/lib/chat/agent/characters";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const origin = () => (process.env.NEXT_PUBLIC_SITE_URL || "https://www.roebel.app").replace(/\/$/, "");

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = characterById(id);
  if (!c) return new Response("Nicht gefunden", { status: 404 });
  const raw = new URL(request.url).searchParams.get("name") ?? "";
  const name = raw.replace(/[\u0000-\u001f]/g, "").trim().slice(0, 30) || c.name;
  const art = characterArt(c.id);
  const title = `${name} · Ortis`;
  const desc = `${characterRoleLine(c)}. ${c.tagline}`;
  const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}">
<meta property="og:type" content="website"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${origin()}${art.card}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${origin()}${art.card}">
<style>
body{margin:0;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:${c.color};color:#1a1a16;font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;overflow:hidden}
main{position:relative;display:flex;flex-direction:column;align-items:center;padding:24px}
img{height:min(68vh,720px);width:auto;max-width:90vw;object-fit:contain}
h1{font-family:Georgia,"Times New Roman",serif;font-weight:400;font-size:clamp(64px,14vw,200px);line-height:.9;margin:-.45em 0 0;letter-spacing:-.02em;mix-blend-mode:multiply}
p{margin:18px 0 0;color:rgba(26,26,22,.7);text-align:center}
a{color:inherit}
</style></head><body><main><img src="${art.full}" alt="${esc(name)}"><h1>${esc(name)}</h1>
<p>${esc(desc)}</p><p><a href="https://www.roebel.app/studio">Erstellt mit Ortis</a></p></main></body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300" } });
}
