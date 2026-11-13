import { NextResponse } from "next/server";
import { listMemories } from "@/lib/chat/harness/memory";
import * as persona from "@/lib/chat/persona/store";
import { badRequest, handleError, notFound, readJson, requireWallet, unauthorized } from "../../../_lib/http";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

const SLUG = /^[a-z0-9][a-z0-9-]{0,60}$/;

/** GET /api/chat/persona/pages/:slug → {page}. The notes page also lists what was remembered in chat. */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const wallet = await requireWallet(request);
  if (!wallet) return unauthorized();
  const { slug } = await params;
  if (!SLUG.test(slug)) return notFound("Die Seite");
  try {
    const row = await persona.getPageRow(wallet, slug);
    if (!row || row.kind === "core") return notFound("Die Seite");
    const page = persona.toPage(row);
    if (slug === "notes") {
      const memories = await listMemories(wallet, 60).catch(() => []);
      if (memories.length) {
        page.body = `${page.body.trim()}${page.body.trim() ? "\n\n" : ""}## Im Chat gemerkt\n${memories.map((m) => `- ${m.fact}`).join("\n")}`;
      }
    }
    // Links in both directions, from the [Text](wiki:slug) references in the bodies.
    const all = await persona.listPageRows(wallet, { withBody: true });
    const visible = all.filter((r) => r.kind !== "core" && r.slug !== slug);
    const linksOf = (body: string) => new Set([...body.matchAll(/\]\(wiki:([a-z0-9-]+)\)/g)].map((m) => m[1]));
    const out = linksOf(row.body);
    const link = (r: { slug: string; title: string }) => ({ slug: r.slug, title: r.title });
    const backlinks = visible.filter((r) => linksOf(r.body).has(slug)).map(link).slice(0, 12);
    const related = visible.filter((r) => out.has(r.slug) || (row.parent && r.parent === row.parent) || r.parent === slug || r.slug === row.parent).map(link).slice(0, 12);
    return NextResponse.json({ page, backlinks, related });
  } catch (err) {
    return handleError(err, "persona/pages");
  }
}

/** PUT /api/chat/persona/pages/:slug — {body, title?, summary?}: the person corrects a page; rebuilds keep it. */
export async function PUT(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const wallet = await requireWallet(request);
  if (!wallet) return unauthorized();
  const { slug } = await params;
  if (!SLUG.test(slug)) return notFound("Die Seite");
  const input = await readJson(request);
  if (!input || typeof input.body !== "string") return badRequest("Der Seiteninhalt fehlt.");
  if (input.body.length > 40_000) return badRequest("Die Seite ist zu lang (höchstens 40 000 Zeichen).");
  try {
    const row = await persona.getPageRow(wallet, slug);
    if (!row || row.kind === "core") return notFound("Die Seite");
    // The "Im Chat gemerkt" list is appended on read; never store it back into the page.
    const body = slug === "notes" ? input.body.split(/\n## Im Chat gemerkt\n/)[0].trimEnd() : input.body;
    const title = typeof input.title === "string" && input.title.trim() ? input.title.trim() : row.title;
    const summary = typeof input.summary === "string" ? input.summary.trim() : row.summary;
    const saved = await persona.upsertPage(wallet, {
      slug, kind: row.kind, title, summary, parent: row.parent, body, facts: row.facts ?? [], sources: row.sources ?? [],
      meta: row.kind === "person" ? { ...row.meta, name: title, description: summary } : row.meta,
      editedByUser: slug === "notes" ? row.edited_by_user : true,
    });
    await persona.addUpdate(wallet, `Du hast die Seite [${saved.title}](wiki:${slug}) bearbeitet. Deine Fassung bleibt bei Aktualisierungen erhalten.`);
    return NextResponse.json({ page: persona.toPage(saved) });
  } catch (err) {
    return handleError(err, "persona/pages");
  }
}

/** DELETE /api/chat/persona/pages/:slug — people only; the person is never derived again. */
export async function DELETE(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const wallet = await requireWallet(request);
  if (!wallet) return unauthorized();
  const { slug } = await params;
  try {
    const row = SLUG.test(slug) ? await persona.getPageRow(wallet, slug) : null;
    if (!row) return notFound("Die Seite");
    if (row.kind !== "person") return badRequest("Nur Personen-Seiten können gelöscht werden.");
    if (row.meta?.email) await persona.addTombstone(wallet, row.meta.email);
    await persona.deletePage(wallet, slug);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err, "persona/pages");
  }
}
