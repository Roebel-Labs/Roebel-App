import { NextRequest, NextResponse } from "next/server";
import { getProposals } from "@/lib/supabase";

/**
 * GET /api/proposals/list
 *
 * Thin wrapper around getProposals() so client components can fetch the
 * proposal list without having to import the Supabase client (which
 * carries an extra ~30 KB of polyfills). Used by the admin proposal-
 * action page.
 *
 * Query params:
 *   limit            number  (default 10)
 *   offset           number  (default 0)
 *   orderBy          string  (default "created_at")
 *   orderDirection   string  "asc" | "desc"  (default "desc")
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const limit = Number(searchParams.get("limit") ?? "10");
  const offset = Number(searchParams.get("offset") ?? "0");
  const orderBy =
    (searchParams.get("orderBy") as "created_at" | undefined) ?? "created_at";
  const orderDirection =
    (searchParams.get("orderDirection") as "asc" | "desc" | undefined) ?? "desc";

  const result = await getProposals({
    limit,
    offset,
    orderBy,
    orderDirection,
  });

  if (!result.success || !result.data) {
    return NextResponse.json(
      { error: result.error ?? "fetch failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    proposals: result.data.proposals,
    total: result.data.total,
  });
}
