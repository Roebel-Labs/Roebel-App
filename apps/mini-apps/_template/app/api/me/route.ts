import { verifyUserToken } from "@netizen-labs/miniapp-verify";
import manifest from "../../../netizen.manifest";
import { whoAmI } from "../../../lib/me";

const ISSUER = process.env.ROEBEL_ISSUER ?? "https://id.roebel.app";

/** GET /api/me with `Authorization: Bearer <user token>` → `{ id, citizen }` or 401. */
export async function GET(req: Request) {
  const r = await whoAmI(req.headers.get("authorization"), (token) =>
    verifyUserToken(token, { issuer: ISSUER, slug: manifest.slug }),
  );
  return Response.json(r.body, { status: r.status, headers: { "cache-control": "no-store" } });
}
