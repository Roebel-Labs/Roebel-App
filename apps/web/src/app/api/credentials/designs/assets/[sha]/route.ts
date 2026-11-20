// Public: a card design asset by its sha256 → 302 to the immutable storage object.
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { supabaseAssetStorage } from "@/lib/credentials/designs/runtime";
import { SHA } from "@/lib/credentials/designs/public";
import { supabaseDesignStore } from "@/lib/credentials/designs/store-supabase";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ sha: string }> }) {
  const { sha } = await ctx.params;
  if (!SHA.test(sha)) return NextResponse.json({ error: "Unbekanntes Bild." }, { status: 404 });
  try {
    const admin = createAdminClient();
    const asset = await supabaseDesignStore(admin).getAsset(sha);
    if (!asset) return NextResponse.json({ error: "Unbekanntes Bild." }, { status: 404 });
    return NextResponse.redirect(supabaseAssetStorage(admin).publicUrl(asset.storagePath), {
      status: 302,
      headers: { "Cache-Control": "public, max-age=31536000, immutable" },
    });
  } catch (err) {
    console.error("[credentials/designs/asset] lookup failed", err instanceof Error ? err.name : typeof err);
    return NextResponse.json({ error: "Gerade nicht erreichbar." }, { status: 503 });
  }
}
