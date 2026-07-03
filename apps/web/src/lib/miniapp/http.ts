// Shared HTTP helpers for the /api/mini-apps/* routes. Server-only. Mirrors the
// muenzen route pattern (requireAdmin + a uniform JSON error shape) and adds a
// builder-auth resolver.
import "server-only";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/muenzen/api";
import { getDeveloperByWallet, getOrCreateDeveloper } from "./data";
import { MiniAppError, type DeveloperRow } from "./types";

export { requireAdmin };

/** Uniform error envelope. Surfaces `.code` for MiniAppError so clients can branch. */
export function jsonError(e: unknown): NextResponse {
  if (e instanceof MiniAppError) {
    return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
  }
  const message = e instanceof Error ? e.message : String(e);
  console.error("[api/mini-apps]", message);
  return NextResponse.json({ error: message, code: "internal" }, { status: 500 });
}

export function getParam(req: Request, key: string): string | null {
  try {
    return new URL(req.url).searchParams.get(key);
  } catch {
    return null;
  }
}

/**
 * Resolve the calling developer for a builder route.
 *
 * ── AUTH WIRING (INTEGRATION NEED) ──────────────────────────────────────────
 * The dashboard authenticates with the existing thirdweb smart-account login;
 * there is no separate developer portal. For the MVP we trust the `wallet` the
 * dashboard sends (header `x-wallet-address` or a `wallet` field/param) and
 * resolve/create the `developers` row from it. This is NOT tamper-proof on its
 * own — the hardening step is to require a host-signed token (SIWE / the same
 * HMAC session mechanism as admin) that proves ownership of the wallet before
 * trusting it. See INTEGRATION NEEDS in the build report.
 */
export async function resolveDeveloper(
  req: Request,
  body?: { wallet?: string } | null,
): Promise<DeveloperRow> {
  const wallet =
    req.headers.get("x-wallet-address") ||
    body?.wallet ||
    getParam(req, "wallet") ||
    "";
  if (!wallet) {
    throw new MiniAppError("unauthorized", "Keine Wallet — bitte anmelden.");
  }
  return getOrCreateDeveloper(wallet);
}

/** Read-only variant: returns null instead of creating a row. */
export async function resolveDeveloperReadonly(
  req: Request,
  body?: { wallet?: string } | null,
): Promise<DeveloperRow | null> {
  const wallet =
    req.headers.get("x-wallet-address") || body?.wallet || getParam(req, "wallet") || "";
  if (!wallet) return null;
  return getDeveloperByWallet(wallet);
}
