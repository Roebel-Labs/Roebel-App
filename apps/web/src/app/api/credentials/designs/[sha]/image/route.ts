// Public, immutable preview PNG of a published card design version (rendered at publication with
// the personal fields empty).
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicVersion } from "@/lib/credentials/designs/public";
import { supabaseAssetStorage } from "@/lib/credentials/designs/runtime";
import { supabaseDesignStore } from "@/lib/credentials/designs/store-supabase";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ sha: string }> }) {
  const { sha } = await ctx.params;
  try {
    const admin = createAdminClient();
    const v = await publicVersion(supabaseDesignStore(admin), sha);
    const bytes = v ? await supabaseAssetStorage(admin).get(v.previewPath) : null;
    if (!bytes) return NextResponse.json({ error: "Unbekannte Gestaltung." }, { status: 404 });
    return new Response(bytes, {
      status: 200,
      headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=31536000, immutable" },
    });
  } catch (err) {
    console.error("[credentials/designs/image] lookup failed", err instanceof Error ? err.name : typeof err);
    return NextResponse.json({ error: "Gerade nicht erreichbar." }, { status: 503 });
  }
}
