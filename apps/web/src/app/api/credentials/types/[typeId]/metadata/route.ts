// Public ERC-1155 metadata for one credential type (the URI the register stores on chain).
// No auth, cached 5 minutes, never an account address.
import { NextResponse } from "next/server";
import type { Hex } from "viem";
import { createAdminClient } from "@/lib/supabase/admin";
import { metadataFor, reservedMetadataFor } from "@/lib/credentials/metadata";
import { supabaseCredentialStore } from "@/lib/credentials/store-supabase";
import { supabaseDesignStore } from "@/lib/credentials/designs/store-supabase";

export const runtime = "nodejs";

const CACHE = { "Cache-Control": "public, max-age=300" };
const TYPE_ID = /^0x[0-9a-fA-F]{64}$/;

export async function GET(_req: Request, ctx: { params: Promise<{ typeId: string }> }) {
  const { typeId } = await ctx.params;
  if (!TYPE_ID.test(typeId)) return NextResponse.json({ error: "Unbekannter Ausweis." }, { status: 404 });

  const reserved = reservedMetadataFor(typeId as Hex);
  if (reserved) return NextResponse.json(reserved, { headers: CACHE });

  try {
    // Drafts are served only while their createType action is live (see metadataFor).
    const admin = createAdminClient();
    const meta = await metadataFor(supabaseCredentialStore(admin), typeId as Hex, Date.now(), supabaseDesignStore(admin));
    if (!meta) return NextResponse.json({ error: "Unbekannter Ausweis." }, { status: 404 });
    return NextResponse.json(meta, { headers: CACHE });
  } catch (err) {
    console.error("[credentials/metadata] lookup failed", err instanceof Error ? err.name : typeof err);
    return NextResponse.json({ error: "Gerade nicht erreichbar." }, { status: 503 });
  }
}
