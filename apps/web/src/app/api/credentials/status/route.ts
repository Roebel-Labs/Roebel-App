// Public: is the credential register switched on (app_settings.credentials_enabled) and
// configured on this node, and is the card designer open (credential_designer_enabled)? The
// dashboard sidebar, the credentials layout, Studio and the app read it. Cached 60 s.
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { registryConfig } from "@/lib/credentials/config";
import { credentialStatus, type CredentialStatus } from "@/lib/credentials/status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TTL_MS = 60_000;
let cached: { at: number; value: CredentialStatus } | null = null;

async function readSetting(key: string): Promise<string | null> {
  const { data, error } = await createAdminClient().from("app_settings").select("value").eq("key", key).maybeSingle();
  if (error) {
    console.error("[credentials/status] app_settings read failed", key, error.message);
    return null;
  }
  return typeof data?.value === "string" ? data.value : null;
}

export async function GET() {
  const now = Date.now();
  if (!cached || now - cached.at > TTL_MS) {
    cached = { at: now, value: await credentialStatus(readSetting, registryConfig() !== null) };
  }
  return NextResponse.json(cached.value, { headers: { "Cache-Control": "public, max-age=60, s-maxage=60" } });
}
