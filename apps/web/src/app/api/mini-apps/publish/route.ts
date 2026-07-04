/**
 * POST /api/mini-apps/publish — publish a single-file AI-built mini app.
 *
 * Stores the HTML on a mini_app_versions row + registers/updates the mini_apps
 * row (status 'pending' → admin review queue). The app is attributed to the
 * calling developer (x-wallet-address, resolved/created like every builder
 * route). Served afterwards from GET /mini/[slug] on this web app.
 *
 * Body: { html: string; manifest: ManifestDraft }
 * 201 → { ok, slug, miniAppId, homeUrl, version, republished }
 * 409 → slug taken/reserved · 400 → invalid html/manifest · 401 → no wallet
 */
import { publishHtmlMiniApp } from "@/lib/miniapp/ai/publishHtml";
import { jsonError, resolveDeveloper } from "@/lib/miniapp/http";

export const maxDuration = 60;
export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: { html?: unknown; manifest?: unknown; wallet?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  let developerId: string | null = null;
  try {
    const developer = await resolveDeveloper(request, body);
    developerId = developer.id;
  } catch (e) {
    return jsonError(e);
  }

  try {
    const origin = new URL(request.url).origin;
    const result = await publishHtmlMiniApp({
      html: body.html,
      manifest: body.manifest,
      developerId,
      origin,
    });

    if (!result.ok) {
      const status =
        result.errorCode === "slug_taken" || result.errorCode === "slug_reserved"
          ? 409
          : result.errorCode === "db_error"
            ? 500
            : 400;
      return Response.json(result, { status });
    }
    return Response.json(result, { status: 201 });
  } catch (e) {
    console.error("[mini-apps/publish] failed", e);
    return Response.json({ ok: false, error: "publish_failed" }, { status: 500 });
  }
}
