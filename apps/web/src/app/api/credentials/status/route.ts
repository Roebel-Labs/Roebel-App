// Public: is the credential register switched on (app_settings.credentials_enabled) and
// configured on this node? The dashboard sidebar and the credentials layout read it. Cached 60 s.
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { registryConfig } from "@/lib/credentials/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TTL_MS = 60_000;
let cached: { at: number; value: { enabled: boolean; configured: boolean } } | null = null;

async function readEnabled(): Promise<boolean> {
  try {
    const { data, error } = await createAdminClient().from("app_settings").select("value").eq("key", "credentials_enabled").maybeSingle();
    if (error) {
      console.error("[credentials/status] app_settings read failed", error.message);
      return false;
    }
    return typeof data?.value === "string" && data.value.trim() === "true";
  } catch (err) {
    // Closed is the safe direction.
    console.error("[credentials/status] app_settings read threw", err instanceof Error ? err.message : err);
    return false;
  }
}

export async function GET() {
  const now = Date.now();
  if (!cached || now - cached.at > TTL_MS) {
    cached = { at: now, value: { enabled: await readEnabled(), configured: registryConfig() !== null } };
  }
  return NextResponse.json(cached.value, { headers: { "Cache-Control": "public, max-age=60, s-maxage=60" } });
}
