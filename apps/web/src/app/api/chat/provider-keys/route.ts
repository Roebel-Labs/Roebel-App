import { NextResponse } from "next/server";
import { HOUR_MS, takeAll } from "@/lib/rate-limit";
import { sharedLimiters } from "@/lib/rate-limit/server";
import { deleteProviderKey, isKeyProvider, listProviderKeys, looksLikeKey, saveProviderKey, verifyProviderKey } from "@/lib/chat/provider-keys";
import { badRequest, handleError, jsonError, readJson, requireWallet, unauthorized } from "../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const limiters = sharedLimiters([{ name: "chat-provider-key-save", limit: 20, windowMs: HOUR_MS }]);

/** GET /api/chat/provider-keys — { keys: [{ provider, last4, status }] } (never the key). */
export async function GET(request: Request) {
  try {
    const wallet = await requireWallet(request);
    if (!wallet) return unauthorized();
    return NextResponse.json({ keys: await listProviderKeys(wallet) });
  } catch (err) {
    return handleError(err, "provider-keys");
  }
}

/** PUT /api/chat/provider-keys { provider, key } — verifies the key live, then stores it encrypted. */
export async function PUT(request: Request) {
  try {
    const wallet = await requireWallet(request);
    if (!wallet) return unauthorized();
    if (!(await takeAll(limiters, wallet))) return jsonError(429, "rate_limited", "Zu viele Versuche. Bitte später erneut.");
    const body = (await readJson(request)) ?? {};
    const provider = body.provider;
    const key = typeof body.key === "string" ? body.key.trim() : "";
    if (!isKeyProvider(provider)) return badRequest("Unbekannter Anbieter.");
    if (!looksLikeKey(provider, key)) return badRequest("Das sieht nicht wie ein gültiger Schlüssel aus.");
    try {
      await verifyProviderKey(provider, key);
    } catch (e) {
      return jsonError(422, "key_rejected", (e as Error).message);
    }
    return NextResponse.json({ key: await saveProviderKey(wallet, provider, key) });
  } catch (err) {
    return handleError(err, "provider-keys");
  }
}

/** DELETE /api/chat/provider-keys?provider= */
export async function DELETE(request: Request) {
  try {
    const wallet = await requireWallet(request);
    if (!wallet) return unauthorized();
    const provider = new URL(request.url).searchParams.get("provider");
    if (!isKeyProvider(provider)) return badRequest("Unbekannter Anbieter.");
    await deleteProviderKey(wallet, provider);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err, "provider-keys");
  }
}
