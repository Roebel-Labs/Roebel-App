// GET /api/mini-apps/list — registry listing.
//   ?status=live|pending|...   (repeatable via comma)
//   ?category=...  ?featured=1  ?search=...  ?developer=<uuid>  ?mine=1
// Public callers get live apps only. Admins/owners can request any status.
import { NextResponse } from "next/server";
import { listApps, type MiniAppStatus } from "@/lib/miniapp";
import { isAuthenticated } from "@/lib/auth/session";
import { jsonError, getParam, resolveDeveloperReadonly } from "@/lib/miniapp/http";

export const dynamic = "force-dynamic";

const ALL_STATUSES: MiniAppStatus[] = [
  "draft",
  "pending",
  "approved",
  "live",
  "rejected",
  "suspended",
];

export async function GET(req: Request) {
  try {
    const statusParam = getParam(req, "status");
    const category = getParam(req, "category") || undefined;
    const featured = getParam(req, "featured");
    const search = getParam(req, "search") || undefined;
    const developerParam = getParam(req, "developer") || undefined;
    const mine = getParam(req, "mine") === "1";

    const isAdmin = await isAuthenticated();

    let developerId = developerParam;
    if (mine) {
      const dev = await resolveDeveloperReadonly(req);
      if (!dev) return NextResponse.json({ apps: [] });
      developerId = dev.id;
    }

    // Only admins or the owning developer may see non-live apps.
    const canSeeAll = isAdmin || Boolean(developerId);
    let status: MiniAppStatus | MiniAppStatus[] | undefined;
    if (statusParam) {
      const requested = statusParam
        .split(",")
        .map((s) => s.trim())
        .filter((s): s is MiniAppStatus => (ALL_STATUSES as string[]).includes(s));
      status = canSeeAll ? requested : ["live"];
    } else {
      status = canSeeAll ? undefined : "live";
    }

    const apps = await listApps({
      status,
      category: category as never,
      featured: featured === "1" ? true : featured === "0" ? false : undefined,
      search,
      developerId,
    });
    return NextResponse.json({ apps });
  } catch (e) {
    return jsonError(e);
  }
}
