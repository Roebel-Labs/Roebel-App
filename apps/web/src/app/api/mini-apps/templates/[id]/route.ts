/**
 * GET /api/mini-apps/templates/:id — one template incl. HTML and CMS seed, so a builder can
 * start from it (editor `?template=<id>`, Ortis Studio).
 */
import { getTemplate } from "@/lib/miniapp/templates";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const template = getTemplate(id);
  if (!template) return Response.json({ error: "Vorlage nicht gefunden.", code: "not_found" }, { status: 404 });
  return Response.json(
    { template },
    { headers: { "cache-control": "public, max-age=60, s-maxage=300, stale-while-revalidate=3600" } },
  );
}
