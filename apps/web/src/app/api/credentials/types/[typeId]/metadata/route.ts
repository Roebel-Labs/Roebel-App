// Public ERC-1155 metadata for one credential type (the URI the register stores on chain).
// No auth, cached 5 minutes, never an account address.
import { NextResponse } from "next/server";
import type { Hex } from "viem";
import { createAdminClient } from "@/lib/supabase/admin";
import { reservedMetadataFor, typeMetadataJson } from "@/lib/credentials/metadata";
import { supabaseCredentialStore } from "@/lib/credentials/store-supabase";

export const runtime = "nodejs";

const CACHE = { "Cache-Control": "public, max-age=300" };
const TYPE_ID = /^0x[0-9a-fA-F]{64}$/;

export async function GET(_req: Request, ctx: { params: Promise<{ typeId: string }> }) {
  const { typeId } = await ctx.params;
  if (!TYPE_ID.test(typeId)) return NextResponse.json({ error: "Unbekannter Ausweis." }, { status: 404 });

  const reserved = reservedMetadataFor(typeId as Hex);
  if (reserved) return NextResponse.json(reserved, { headers: CACHE });

  try {
    const store = supabaseCredentialStore(createAdminClient());
    const type = await store.getType(typeId as Hex);
    if (!type) return NextResponse.json({ error: "Unbekannter Ausweis." }, { status: 404 });
    const org = type.accountId ? await store.getAccount(type.accountId) : null;
    return NextResponse.json(typeMetadataJson(type, org ? { name: org.name } : null), { headers: CACHE });
  } catch (err) {
    console.error("[credentials/metadata] lookup failed", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Gerade nicht erreichbar." }, { status: 503 });
  }
}
