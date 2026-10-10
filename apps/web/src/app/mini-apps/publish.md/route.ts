// GET /mini-apps/publish.md — the agent recipe for self-hosted mini apps.
import { buildPublishMd } from "@/lib/miniapp/publishDoc";
import { DOCS_BASE_URL } from "@/lib/miniapp/devdocs";

export const dynamic = "force-static";

export async function GET() {
  return new Response(buildPublishMd(DOCS_BASE_URL), {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "cache-control": "public, max-age=300, s-maxage=3600",
      "access-control-allow-origin": "*",
    },
  });
}
