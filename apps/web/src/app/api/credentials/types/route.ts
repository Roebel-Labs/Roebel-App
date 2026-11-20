// Public directory of credential types that are on chain and not retired. Used by the app to
// show another person's public cards and by other nodes to name types. No address, no counts.
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { typeDirectory } from "@/lib/credentials/metadata";
import { supabaseCredentialStore } from "@/lib/credentials/store-supabase";

export const runtime = "nodejs";

export async function GET() {
  try {
    const types = await typeDirectory(supabaseCredentialStore(createAdminClient()));
    return NextResponse.json({ types }, { headers: { "Cache-Control": "public, max-age=300" } });
  } catch (err) {
    console.error("[credentials/types] directory failed", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Gerade nicht erreichbar." }, { status: 503 });
  }
}
