// Public, immutable metadata of a published card design version (the metadataURI a type carries
// on chain). No auth; never a holder value or an account address.
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { designMetadataJson, publicVersion } from "@/lib/credentials/designs/public";
import { supabaseDesignStore } from "@/lib/credentials/designs/store-supabase";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ sha: string }> }) {
  const { sha } = await ctx.params;
  try {
    const v = await publicVersion(supabaseDesignStore(createAdminClient()), sha);
    if (!v) return NextResponse.json({ error: "Unbekannte Gestaltung." }, { status: 404 });
    return NextResponse.json(designMetadataJson(v), { headers: { "Cache-Control": "public, max-age=31536000, immutable" } });
  } catch (err) {
    console.error("[credentials/designs] lookup failed", err instanceof Error ? err.name : typeof err);
    return NextResponse.json({ error: "Gerade nicht erreichbar." }, { status: 503 });
  }
}
