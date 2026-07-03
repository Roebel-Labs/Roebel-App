/**
 * POST /api/mini-apps/generate/preview
 *
 * Renders a generated mini app's primary screen (app/page.tsx + its local
 * components) to a self-contained HTML document, wired to a MOCK Netizen host
 * bridge, so the builder can SEE the app before publishing. Returns HTML the
 * builder loads into a sandboxed iframe via srcdoc.
 *
 * Body: { files: [{ path, content }] }   (a file-plan, partial or full)
 * Response: { ok, html, error? }
 */
import { renderPreview } from "@/lib/miniapp/ai/preview";

export const maxDuration = 30;
export const runtime = "nodejs"; // uses the TS transpiler + react-dom/server + vm

export async function POST(request: Request) {
  let body: { files?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, html: "", error: "invalid_json" }, { status: 400 });
  }

  const files = Array.isArray(body.files) ? body.files : null;
  if (!files) {
    return Response.json({ ok: false, html: "", error: "files_required" }, { status: 400 });
  }

  // Keep only well-formed { path, content } entries (partial streams may have holes).
  const clean = files
    .filter(
      (f): f is { path: string; content: string } =>
        !!f && typeof f === "object" && typeof (f as { path?: unknown }).path === "string" && typeof (f as { content?: unknown }).content === "string",
    )
    .map((f) => ({ path: f.path, content: f.content }));

  if (clean.length === 0) {
    return Response.json({ ok: false, html: "", error: "no_renderable_files" }, { status: 200 });
  }

  try {
    const result = renderPreview({ files: clean });
    return Response.json(result, { status: 200 });
  } catch (e) {
    console.error("[mini-apps/generate/preview] render failed", e);
    return Response.json(
      { ok: false, html: "", error: e instanceof Error ? e.message : "render_failed" },
      { status: 200 },
    );
  }
}
