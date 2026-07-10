import { type NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { countUnreadNotifications } from "@/lib/notifications/unread-count";
import { createSupabaseUnreadCountSources } from "@/lib/notifications/supabase-unread-count";

export const dynamic = "force-dynamic";

const WALLET_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
};

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const payload = body as { since?: unknown; wallet?: unknown };
  const sinceParam = payload.since;
  const walletParam = payload.wallet;

  if (sinceParam !== undefined && typeof sinceParam !== "string") {
    return NextResponse.json(
      { error: "Invalid since timestamp" },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  if (walletParam !== undefined && typeof walletParam !== "string") {
    return NextResponse.json(
      { error: "Invalid wallet address" },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  let after: string | undefined;
  if (sinceParam) {
    const since = new Date(sinceParam);
    if (Number.isNaN(since.getTime())) {
      return NextResponse.json(
        { error: "Invalid since timestamp" },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }
    after = since.toISOString();
  }

  if (walletParam && !WALLET_PATTERN.test(walletParam)) {
    return NextResponse.json(
      { error: "Invalid wallet address" },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  try {
    const supabase = await createClient();
    const count = await countUnreadNotifications({
      after,
      walletAddress: walletParam,
      sources: createSupabaseUnreadCountSources(supabase),
    });
    return NextResponse.json({ count }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error("[notifications/unread-count] count failed", error);
    return NextResponse.json(
      { error: "Unable to count unread notifications" },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
