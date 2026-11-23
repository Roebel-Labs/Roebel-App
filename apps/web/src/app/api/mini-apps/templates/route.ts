/**
 * GET /api/mini-apps/templates — the template gallery (no HTML).
 * Public and cacheable; used by /editor and the Ortis Studio Apps section.
 */
import { MINI_APP_TEMPLATES, TEMPLATE_GROUPS, templateSummary } from "@/lib/miniapp/templates";

export const runtime = "nodejs";

export function GET() {
  return Response.json(
    { groups: TEMPLATE_GROUPS, templates: MINI_APP_TEMPLATES.map(templateSummary) },
    { headers: { "cache-control": "public, max-age=60, s-maxage=300, stale-while-revalidate=3600" } },
  );
}
