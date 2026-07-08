// GET /mini-apps/llms-full.txt — the complete machine-readable developer guide
// (same content the MCP get_docs tool serves; assembled in devdocs.ts from the
// AI builder's frozen prompt sections).
import { buildLlmsFullTxt } from "@/lib/miniapp/devdocs";

export const dynamic = "force-static";

export async function GET() {
  return new Response(buildLlmsFullTxt(), {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=300, s-maxage=3600",
      "access-control-allow-origin": "*",
    },
  });
}
