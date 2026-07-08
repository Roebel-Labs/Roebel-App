// GET /mini-apps/llms.txt — llms.txt-convention index for AI agents/editors.
import { buildLlmsIndexTxt } from "@/lib/miniapp/devdocs";

export const dynamic = "force-static";

export async function GET() {
  return new Response(buildLlmsIndexTxt(), {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=300, s-maxage=3600",
      "access-control-allow-origin": "*",
    },
  });
}
